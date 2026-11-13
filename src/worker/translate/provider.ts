import type { LanguageCode } from "../../shared/types"
import type { TranslateProvider, TranslateRequest, TranslateResult } from "./types"

/**
 * Provider 选型（阶段 4，阶段 7 线上修复时调整）：
 *
 * 1. 默认：GoogleGtxProvider 优先 + MyMemoryProvider 兜底的组合。
 *    - GoogleGtxProvider 走 Google 翻译网页版的公开 gtx 接口，免密钥、
 *      免账单，从 Workers 的数据中心出站 IP 可正常访问。生产默认走它。
 *    - MyMemoryProvider 免密钥，但匿名额度按出站 IP 计算，Workers 的
 *      共享出口 IP 额度常年耗尽（返回 MYMEMORY WARNING / 403，译文全挂），
 *      所以线上只作兜底；本地开发（国内网络访问不了 googleapis）会
 *      自动落到它，体验不变。
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

/** 默认 Provider：Google 翻译网页版的公开 gtx 接口，GET 一次一条，免密钥。 */
export class GoogleGtxProvider implements TranslateProvider {
  readonly id = "google"

  async translate(request: TranslateRequest): Promise<TranslateResult> {
    const source = request.sourceLang ?? "auto"
    const url = new URL("https://translate.googleapis.com/translate_a/single")
    url.searchParams.set("client", "gtx")
    url.searchParams.set("sl", source)
    url.searchParams.set("tl", request.targetLang)
    url.searchParams.set("dt", "t")
    url.searchParams.set("q", request.text)

    const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })
    if (!res.ok) throw new Error(`Google HTTP ${res.status}`)

    // 响应是嵌套数组：[[["译文","原文",null,null,…],…],…,"zh",…]
    const data = (await res.json()) as unknown
    const segments = Array.isArray(data) && Array.isArray(data[0]) ? data[0] : []
    const text = segments
      .map((seg) => (Array.isArray(seg) && typeof seg[0] === "string" ? seg[0] : ""))
      .join("")
    if (!text) throw new Error("Google 未返回译文")
    return { text, sourceLang: source, targetLang: request.targetLang, provider: this.id }
  }
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

/**
 * 主备组合：先用主 Provider，失败（含超时/被拒）自动换备 Provider 重试一次。
 * 生产环境 Workers 出站 IP 上 Google 可用、MyMemory 匿名额度常年耗尽，
 * 本地开发则相反（国内网络访问不了 googleapis），组合后两边都能出译文。
 */
class FallbackProvider implements TranslateProvider {
  readonly id = "fallback"

  constructor(
    private readonly primary: TranslateProvider,
    private readonly secondary: TranslateProvider,
  ) {}

  async translate(request: TranslateRequest): Promise<TranslateResult> {
    try {
      return await this.primary.translate(request)
    } catch (error) {
      console.error(`[translate] ${this.primary.id} 失败，改用 ${this.secondary.id}`, error)
      return this.secondary.translate(request)
    }
  }
}

/** 按环境变量挑选 Provider：配置了 LibreTranslate 地址就用自托管实例，否则用免密钥默认。 */
export function createTranslateProvider(env: TranslateEnv): TranslateProvider {
  if (env.LIBRETRANSLATE_URL) {
    return new LibreTranslateProvider(env.LIBRETRANSLATE_URL, env.LIBRETRANSLATE_KEY)
  }
  return new FallbackProvider(new GoogleGtxProvider(), new MyMemoryProvider())
}

/** 目标语言与消息原语言相同时不需要翻译。语言码统一小写比较。 */
export function sameLanguage(a: LanguageCode, b: LanguageCode): boolean {
  return a.toLowerCase() === b.toLowerCase()
}
