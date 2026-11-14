import type { LanguageCode } from "../../shared/types"
import type { TranslateProvider, TranslateRequest, TranslateResult } from "./types"

/**
 * Provider 选型（阶段 4，阶段 7 线上修复后 + 译文自然度调整）：
 *
 * 1. 默认链条（依次尝试，前一个失败自动换下一个，每个 provider 的失败都带
 *    provider id + HTTP 状态码打进日志）：
 *    a. GoogleClients5Provider：clients5.google.com 的 dict-chrome-ex 入口，
 *       免密钥、免账单。translate.googleapis.com 的 gtx 入口在共享/云出站 IP
 *       上普遍 429（返回 HTML），已弃用；clients5 入口是词典扩展用的通道，
 *       对数据中心出站更宽松。
 *    b. WorkersAiChatProvider：Workers AI 的 @cf/zai-org/glm-4.7-flash，
 *       走 AI binding（wrangler.toml [ai] binding = "AI"），Free 计划每天
 *       10,000 Neurons 免费额度、不绑卡。m2m100 的译文生硬（「夜间验收你好」
 *       会翻成 "Welcome to you at night"），产品负责人已批准有限例外：
 *       仅允许 Workers AI 免费层的多语言指令模型做默认翻译引擎；外部付费
 *       翻译/大模型 API（DeepL 付费、OpenAI、智谱官方 API 等）仍然禁止，
 *       glm-5.x 系列需要 Workers Paid，也不用。
 *    c. WorkersAiTranslateProvider：@cf/meta/m2m100-1.2b 专用翻译模型，
 *       自然度一般但便宜稳定，作 glm 失败时的下一棒。
 *    d. MyMemoryProvider：免密钥，但匿名额度按出站 IP 计算，Workers 共享出口
 *       IP 额度常年耗尽（429 / MYMEMORY WARNING），只作链条末端兜底。
 * 2. LibreTranslateProvider：开源、可自托管。设置 LIBRETRANSLATE_URL 即启用，
 *    生产环境推荐指向自己部署的实例（零月费、无第三方按量计费）。
 *
 * 以后要接需要密钥的商业 Provider（如 Azure Translator 免费档）时，
 * 在这里加一个类并按环境变量切换即可；密钥只放 .dev.vars / Cloudflare 密钥。
 */

/**
 * Workers AI binding 的最小类型。不复用 @cloudflare/workers-types 的 Ai，
 * 避免给客户端构建引入额外类型依赖。
 */
export interface AiLike {
  run(model: string, inputs: Record<string, unknown>): Promise<unknown>
}

/** 翻译相关的环境变量，Worker Env 继承自这里。 */
export interface TranslateEnv {
  /** 自托管 LibreTranslate 的根地址，例如 http://localhost:5000。设置后替代默认 Provider。 */
  LIBRETRANSLATE_URL?: string
  /** LibreTranslate 的 API 密钥（自托管实例未开启限流时可留空）。 */
  LIBRETRANSLATE_KEY?: string
  /** Workers AI binding（wrangler.toml [ai]）。存在时启用 m2m100 兜底。 */
  AI?: AiLike
}

const FETCH_TIMEOUT_MS = 10_000

/** glm-4.7-flash 是推理型模型，即使关掉 thinking 也比专用翻译模型慢，超时单独放宽。 */
const CHAT_TIMEOUT_MS = 15_000

/** 提示词里用英文语言名比裸语言码更稳；没映射到的语言直接用码。 */
const LANGUAGE_NAMES: Record<string, string> = {
  zh: "Simplified Chinese",
  "zh-tw": "Traditional Chinese",
  en: "English",
  ja: "Japanese",
  ko: "Korean",
  es: "Spanish",
  fr: "French",
  de: "German",
  ru: "Russian",
  pt: "Portuguese",
  ar: "Arabic",
}

function languageName(code: string): string {
  return LANGUAGE_NAMES[code.toLowerCase()] ?? code
}

/** 模拟 Chrome 浏览器的 UA，clients5 的 dict-chrome-ex 入口期望浏览器类请求。 */
const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"

/** 默认链条第一棒：clients5.google.com 的 dict-chrome-ex 入口，GET 一次一条，免密钥。 */
export class GoogleClients5Provider implements TranslateProvider {
  readonly id = "google-clients5"

  async translate(request: TranslateRequest): Promise<TranslateResult> {
    const source = request.sourceLang ?? "auto"
    const url = new URL("https://clients5.google.com/translate_a/t")
    url.searchParams.set("client", "dict-chrome-ex")
    url.searchParams.set("sl", source)
    url.searchParams.set("tl", request.targetLang)
    url.searchParams.set("q", request.text)

    const res = await fetch(url, {
      headers: { "User-Agent": BROWSER_UA },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })
    if (!res.ok) throw new Error(`GoogleClients5 HTTP ${res.status}`)

    // 限流时可能返回 HTML，json 解析失败要带上状态码，别只留一个 SyntaxError
    let data: unknown
    try {
      data = await res.json()
    } catch {
      throw new Error(`GoogleClients5 HTTP ${res.status} 返回非 JSON（疑似被限流）`)
    }
    // 响应格式随 sl 变化：["译文"] 或 [["译文","检测到的语言"],…]
    const text = extractClients5Text(data)
    if (!text) throw new Error("GoogleClients5 未返回有效译文")
    return { text, sourceLang: source, targetLang: request.targetLang, provider: this.id }
  }
}

/**
 * Workers AI 的 glm-4.7-flash，链条第二棒：聊天指令模型，译文比 m2m100 自然得多。
 * 提示词强约束「只输出译文」；temperature 0 求稳定；max_tokens 按原文长度收紧，
 * 省免费额度也防止模型跑题长篇大论。模型带 thinking，尝试用 chat_template_kwargs
 * 关掉（后端不认这个键也不影响调用，只是慢一点，有 15s 竞速超时兜底）。
 */
export class WorkersAiChatProvider implements TranslateProvider {
  readonly id = "workers-ai-glm-4.7-flash"

  constructor(private readonly ai: AiLike) {}

  async translate(request: TranslateRequest): Promise<TranslateResult> {
    // glm-4.7-flash 没有 auto 检测；聊天源语言缺省按 en（应用内可选项就几种）
    const source = request.sourceLang && request.sourceLang !== "auto" ? request.sourceLang : "en"
    const system = [
      "You are a translation engine for a casual multilingual chat room.",
      `Translate the user's message from ${languageName(source)} into ${languageName(request.targetLang)}.`,
      "Keep the tone natural and conversational, the way a native speaker would text a friend.",
      "Output ONLY the translation itself. No quotes, no explanations, no notes, no preamble.",
    ].join(" ")
    let output: unknown
    try {
      // AI binding 不吃 AbortSignal，沿用竞速超时，防止远端代理悬死整条链
      output = await Promise.race([
        this.ai.run("@cf/zai-org/glm-4.7-flash", {
          messages: [
            { role: "system", content: system },
            { role: "user", content: request.text },
          ],
          temperature: 0,
          max_tokens: Math.min(600, request.text.length * 3 + 64),
          chat_template_kwargs: { enable_thinking: false },
        }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("WorkersAiChat 超时")), CHAT_TIMEOUT_MS),
        ),
      ])
    } catch (error) {
      throw new Error(`WorkersAiChat 调用失败: ${error instanceof Error ? error.message : error}`)
    }
    const text = normalizeChatText(extractChatText(output))
    if (!text) throw new Error("WorkersAiChat 未返回有效译文")
    return { text, sourceLang: source, targetLang: request.targetLang, provider: this.id }
  }
}

/** Workers AI 的 m2m100 翻译模型，走 AI binding，免密钥、免费额度内；glm 失败后的兜底。 */
export class WorkersAiTranslateProvider implements TranslateProvider {
  readonly id = "workers-ai-m2m100"

  constructor(private readonly ai: AiLike) {}

  async translate(request: TranslateRequest): Promise<TranslateResult> {
    // m2m100 没有 auto 检测，源语言未知时按 en（默认聊天源语言就两种，影响极小）
    const source = request.sourceLang && request.sourceLang !== "auto" ? request.sourceLang : "en"
    let output: unknown
    try {
      // AI binding 不吃 AbortSignal，用竞速超时兜底：本地/边缘上远端代理
      // 连不通时会无限悬住，那样整条 provider 链都会被卡死。
      output = await Promise.race([
        this.ai.run("@cf/meta/m2m100-1.2b", {
          text: request.text,
          source_lang: source,
          target_lang: request.targetLang,
        }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("WorkersAi 超时")), FETCH_TIMEOUT_MS),
        ),
      ])
    } catch (error) {
      throw new Error(`WorkersAi 调用失败: ${error instanceof Error ? error.message : error}`)
    }
    const text = extractAiText(output)
    if (!text) throw new Error("WorkersAi 未返回有效译文")
    return { text, sourceLang: source, targetLang: request.targetLang, provider: this.id }
  }
}

/** clients5 dict-chrome-ex 响应解析：兼容 ["译文"] 与 [["译文","src"],…] 两种形状。 */
function extractClients5Text(data: unknown): string {
  if (!Array.isArray(data)) return ""
  if (typeof data[0] === "string") {
    return data.filter((part): part is string => typeof part === "string").join("")
  }
  if (Array.isArray(data[0])) {
    return (data as unknown[][])
      .map((seg) => (Array.isArray(seg) && typeof seg[0] === "string" ? seg[0] : ""))
      .join("")
  }
  return ""
}

/**
 * 聊天模型响应解析：优先 OpenAI 兼容的 choices[0].message.content，
 * 再退到 Workers AI 历史上的 response / result / translated_text 等键。
 */
function extractChatText(output: unknown): string {
  if (typeof output === "string") return output.trim()
  if (!output || typeof output !== "object") return ""
  const record = output as Record<string, unknown>
  const choices = record.choices
  if (Array.isArray(choices) && choices.length > 0) {
    const first = choices[0] as Record<string, unknown>
    const message = first?.message as Record<string, unknown> | undefined
    if (message && typeof message.content === "string" && message.content.trim()) {
      return message.content.trim()
    }
  }
  for (const key of ["response", "result", "translated_text", "translatedText"]) {
    const value = record[key]
    if (typeof value === "string" && value.trim()) return value.trim()
  }
  return ""
}

/**
 * 聊天模型偶尔不听话：给译文包引号、加「译文：」前缀、套 markdown 代码块，
 * 都剥掉；出现明显的拒答/解释性套话时返回空串，让链条走下一棒。
 */
function normalizeChatText(text: string): string {
  let out = text.trim()
  out = out.replace(/^```[a-z]*\s*/i, "").replace(/```\s*$/, "")
  out = out.replace(/^(?:translation|译文|翻譯)\s*[:：]\s*/i, "")
  out = out.replace(/^[「『"'“]+/u, "").replace(/[」』"'”]+$/u, "")
  out = out.trim()
  if (/^(i'?m sorry|as an ai|i cannot|i can't|抱歉|对不起|我无法|无法翻译)/i.test(out)) return ""
  return out
}

/** Workers AI 响应解析：兼容 translated_text / translatedText / 具名 response 等形状。 */
function extractAiText(output: unknown): string {
  if (typeof output === "string") return output.trim()
  if (output && typeof output === "object") {
    const record = output as Record<string, unknown>
    for (const key of ["translated_text", "translatedText", "response"]) {
      const value = record[key]
      if (typeof value === "string" && value.trim()) return value.trim()
    }
  }
  return ""
}

/** MyMemory 免费接口，GET 一次一条，无需密钥。 */
export class MyMemoryProvider implements TranslateProvider {
  readonly id = "mymemory"

  async translate(request: TranslateRequest): Promise<TranslateResult> {
    const source = request.sourceLang ?? "en"
    const url = new URL("https://api.mymemory.translated.net/get")
    url.searchParams.set("q", request.text)
    url.searchParams.set("langpair", `${source}|${request.targetLang}`)

    const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })
    if (!res.ok) throw new Error(`MyMemory HTTP ${res.status}`)

    let data: {
      responseData?: { translatedText?: string }
      responseStatus?: number | string
    }
    try {
      data = (await res.json()) as typeof data
    } catch {
      throw new Error(`MyMemory HTTP ${res.status} 返回非 JSON`)
    }
    const text = data.responseData?.translatedText
    // MyMemory 出错时会把错误文案塞进 translatedText（比如匿名额度用尽的
    // “MYMEMORY WARNING: YOU USED ALL AVAILABLE FREE TRANSLATIONS…”），
    // 必须识别出来当失败处理，不能当成译文广播出去。
    const isErrorMessage =
      !text ||
      /MYMEMORY WARNING|ALL AVAILABLE FREE|QUERY LENGTH LIMIT|INVALID/i.test(text) ||
      (data.responseStatus !== undefined && String(data.responseStatus) !== "200")
    if (isErrorMessage) {
      throw new Error(
        `MyMemory 未返回有效译文（status=${String(data.responseStatus)}）`,
      )
    }
    return { text, sourceLang: source, targetLang: request.targetLang, provider: this.id }
  }
}

/** 自托管 LibreTranslate（https://libretranslate.com），POST /translate。 */
export class LibreTranslateProvider implements TranslateProvider {
  readonly id = "libretranslate"

  constructor(
    private readonly baseUrl: string,
    private readonly apiKey?: string,
  ) {}

  async translate(request: TranslateRequest): Promise<TranslateResult> {
    const source = request.sourceLang ?? "auto"
    const res = await fetch(`${this.baseUrl.replace(/\/+$/, "")}/translate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        q: request.text,
        source,
        target: request.targetLang,
        format: "text",
        api_key: this.apiKey ?? "",
      }),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })
    if (!res.ok) throw new Error(`LibreTranslate HTTP ${res.status}`)

    const data = (await res.json()) as { translatedText?: string }
    const text = data.translatedText
    if (!text) throw new Error("LibreTranslate 未返回译文")

    return { text, sourceLang: source, targetLang: request.targetLang, provider: this.id }
  }
}

/**
 * 按序尝试的 Provider 链：前一个失败（含超时/被限流/额度用尽）自动换下一个。
 * 每一棒的失败都带 provider id 和 HTTP 状态码打进日志，线上排查时能看清
 * 是哪个环节挂了，而不是只看到一个被吞掉的 null。
 */
class FallbackChainProvider implements TranslateProvider {
  readonly id = "fallback-chain"

  constructor(private readonly providers: readonly TranslateProvider[]) {}

  async translate(request: TranslateRequest): Promise<TranslateResult> {
    let lastError: unknown = new Error("Provider 链为空")
    for (const provider of this.providers) {
      try {
        return await provider.translate(request)
      } catch (error) {
        lastError = error
        console.error(`[translate] provider ${provider.id} 失败`, error)
      }
    }
    throw lastError instanceof Error ? lastError : new Error(String(lastError))
  }
}

/**
 * 记账回调（阶段 12）：每个 provider 的成功/失败各调一次，只带 provider id
 * 和简短原因（不含消息原文），供 Room DO 上报目录 DO 做成功率统计。
 * 不改变链条的尝试顺序与失败切换行为。
 */
export type ProviderResultCallback = (
  provider: string,
  ok: boolean,
  reason?: string,
) => void

/** 包一层记账：成功/失败路径原样透传，只多调一次回调。 */
class RecordingProvider implements TranslateProvider {
  readonly id: string

  constructor(
    private readonly inner: TranslateProvider,
    private readonly onResult: ProviderResultCallback,
  ) {
    this.id = inner.id
  }

  async translate(request: TranslateRequest): Promise<TranslateResult> {
    try {
      const result = await this.inner.translate(request)
      this.onResult(result.provider, true)
      return result
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.onResult(this.inner.id, false, message.slice(0, 120))
      throw error
    }
  }
}

/** 按环境变量挑选 Provider：配置了 LibreTranslate 地址就用自托管实例，否则用免密钥默认链。 */
export function createTranslateProvider(
  env: TranslateEnv,
  onResult?: ProviderResultCallback,
): TranslateProvider {
  if (env.LIBRETRANSLATE_URL) {
    const libre = new LibreTranslateProvider(env.LIBRETRANSLATE_URL, env.LIBRETRANSLATE_KEY)
    return onResult ? new RecordingProvider(libre, onResult) : libre
  }
  const chain: TranslateProvider[] = [new GoogleClients5Provider()]
  if (env.AI) {
    chain.push(new WorkersAiChatProvider(env.AI))
    chain.push(new WorkersAiTranslateProvider(env.AI))
  }
  chain.push(new MyMemoryProvider())
  const wrapped = onResult ? chain.map((p) => new RecordingProvider(p, onResult)) : chain
  return new FallbackChainProvider(wrapped)
}

/** 目标语言与消息原语言相同时不需要翻译。语言码统一小写比较。 */
export function sameLanguage(a: LanguageCode, b: LanguageCode): boolean {
  return a.toLowerCase() === b.toLowerCase()
}
