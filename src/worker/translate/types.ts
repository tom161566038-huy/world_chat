import type { LanguageCode } from "../../shared/types"

export interface TranslateRequest {
  text: string
  sourceLang?: LanguageCode
  targetLang: LanguageCode
}

export interface TranslateResult {
  text: string
  sourceLang: LanguageCode
  targetLang: LanguageCode
  provider: string
}

export interface TranslateProvider {
  readonly id: string
  translate(request: TranslateRequest): Promise<TranslateResult>
}
