/**
 * 顶部语言切换器（界面小修复）：与落地页「我的语言」是同一个 language，
 * 不另设「界面语言」。切换后整个界面文案、html lang、内置房间标题立即跟随；
 * 有身份时由上层写回 profile 持久化。紧凑小控件，放标题一带（常见右上）。
 */
import type { LanguageCode } from "../shared/types"
import { LANGUAGES, t } from "./i18n"

export default function LanguageSwitcher({
  language,
  onChange,
}: {
  language: LanguageCode
  onChange: (language: LanguageCode) => void
}) {
  return (
    <select
      className="lang-switcher"
      value={language}
      aria-label={t(language, "langLabel")}
      onChange={(e) => onChange(e.target.value as LanguageCode)}
    >
      {LANGUAGES.map(({ code, label }) => (
        <option key={code} value={code}>
          {label}
        </option>
      ))}
    </select>
  )
}
