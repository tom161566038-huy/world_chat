import type { LanguageCode } from "../../shared/types"
import type { TranslateProvider, TranslateRequest, TranslateResult } from "./types"

/**
 * Provider 选型（阶段 4）：
 *
 * 1. 默认 MyMemoryProvider：免密钥的免费 HTTP 翻译接口，本地 `wrangler dev`
 *    不用申请任何密钥就能完成验证。限制是匿名额度按 IP 计算、质量一般，
 *    只适合开发期和轻量使用。
 * 2. LibreTranslateProvider：开源、可自托管。设置 LIBRETRANSLATE_URL 即启用，
 *    生产环境推荐指向自己部署的实例（零月费、无第三方按量计费）。
 *
 * 以后要接需要密钥的商业 Provider（如 Azure Translator 免费档）时，
 * 在这里加一个类并按环境变量切换即可；密钥只放 .dev.vars / Cloudflare 密钥。
 * 按总纲要求，禁止把大模型（包括 GLM）设为默认生产翻译引擎。
 */

/** 翻译相关的环境变量，Worker Env 继承自这里。 */
export interface TranslateEnv {
  /** 自托管 LibreTranslate 的根地址，例如 http://localhost:5000。设置后替代默认 Provider。 */
  LIBRETRANSLATE_URL?: string
  /** LibreTranslate 的 API 密钥（自托管实例未开启限流时可留空）。 */
  LIBRETRANSLATE_KEY?: string
}

const FETCH_TIMEOUT_MS = 10_000

/** 默认 Provider：MyMemory 免费接口，GET 一次一条，无需密钥。 */
export class MyMemoryProvider implements TranslateProvider {
  readonly id = "mymemory"

  async translate(request: TranslateRequest): Promise<TranslateResult> {
    const source = request.sourceLang ?? "en"
    const url = new URL("https://api.mymemory.translated.net/get")
    url.searchParams.set("q", request.text)
    url.searchParams.set("langpair", `${source}|${request.targetLang}`)

    const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })
    if (!res.ok) throw new Error(`MyMemory HTTP ${res.status}`)

    const data = (await res.json()) as {
      responseData?: { translatedText?: string }
      responseStatus?: number | string
    }
    const text = data.responseData?.translatedText
    // MyMemory 出错时可能把错误文案塞进 translatedText，这里兜底识别
    if (!text || /MYMEMORY WARNING|QUERY LENGTH LIMIT|INVALID/i.test(text)) {
      throw new Error(`MyMemory 未返回有效译文（status=${String(data.responseStatus)}）`)
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

/** 按环境变量挑选 Provider：配置了 LibreTranslate 地址就用自托管实例，否则用免密钥默认。 */
export function createTranslateProvider(env: TranslateEnv): TranslateProvider {
  if (env.LIBRETRANSLATE_URL) {
    return new LibreTranslateProvider(env.LIBRETRANSLATE_URL, env.LIBRETRANSLATE_KEY)
  }
  return new MyMemoryProvider()
}

/** 目标语言与消息原语言相同时不需要翻译。语言码统一小写比较。 */
export function sameLanguage(a: LanguageCode, b: LanguageCode): boolean {
  return a.toLowerCase() === b.toLowerCase()
}
