import type { LanguageCode } from "../../shared/types"
import type { TranslateProvider, TranslateRequest, TranslateResult } from "./types"

/**
 * Provider 选型（阶段 4，阶段 7 线上两次修复后调整）：
 *
 * 1. 默认链条（依次尝试，前一个失败自动换下一个，每个 provider 的失败都带
 *    provider id + HTTP 状态码打进日志）：
 *    a. GoogleClients5Provider：clients5.google.com 的 dict-chrome-ex 入口，
 *       免密钥、免账单。translate.googleapis.com 的 gtx 入口在共享/云出站 IP
 *       上普遍 429（返回 HTML），已弃用；clients5 入口是词典扩展用的通道，
 *       对数据中心出站更宽松。
 *    b. WorkersAiTranslateProvider：Cloudflare Workers AI 的
 *       @cf/meta/m2m100-1.2b，走 AI binding（wrangler.toml 里 [ai] binding = "AI"），
 *       Workers Free 每天 10,000 Neurons 免费额度，短消息够用，不需要付费计划、
 *       不需要密钥。m2m100 不支持 auto 检测，源语言缺省按 en。
 *    c. MyMemoryProvider：免密钥，但匿名额度按出站 IP 计算，Workers 共享出口
 *       IP 额度常年耗尽（429 / MYMEMORY WARNING），只作链条末端兜底；
 *       本地开发若 AI binding 不可用也能落到它。
 * 2. LibreTranslateProvider：开源、可自托管。设置 LIBRETRANSLATE_URL 即启用，
 *    生产环境推荐指向自己部署的实例（零月费、无第三方按量计费）。
 *
 * 以后要接需要密钥的商业 Provider（如 Azure Translator 免费档）时，
 * 在这里加一个类并按环境变量切换即可；密钥只放 .dev.vars / Cloudflare 密钥。
 * 按总纲要求，禁止把大模型（包括 GLM）设为默认生产翻译引擎。
 * （m2m100 是专用翻译模型，不是通用大模型。）
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

/** Workers AI 的 m2m100 翻译模型，走 AI binding，免密钥、免费额度内。 */
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

/** 按环境变量挑选 Provider：配置了 LibreTranslate 地址就用自托管实例，否则用免密钥默认链。 */
export function createTranslateProvider(env: TranslateEnv): TranslateProvider {
  if (env.LIBRETRANSLATE_URL) {
    return new LibreTranslateProvider(env.LIBRETRANSLATE_URL, env.LIBRETRANSLATE_KEY)
  }
  const chain: TranslateProvider[] = [new GoogleClients5Provider()]
  if (env.AI) chain.push(new WorkersAiTranslateProvider(env.AI))
  chain.push(new MyMemoryProvider())
  return new FallbackChainProvider(chain)
}

/** 目标语言与消息原语言相同时不需要翻译。语言码统一小写比较。 */
export function sameLanguage(a: LanguageCode, b: LanguageCode): boolean {
  return a.toLowerCase() === b.toLowerCase()
}
