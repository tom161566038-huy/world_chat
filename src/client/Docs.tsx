/**
 * 隐私说明 / 服务条款（阶段 8 草稿）：内容在 i18n.ts 里按语言维护，
 * 只描述产品真实做的事，不虚构公司主体或法律实体。
 * 顶部语言切换器（界面小修复）：文档页本地切换，只影响当前阅读语言。
 */
import { useEffect, useState } from "react"
import type { LanguageCode } from "../shared/types"
import LanguageSwitcher from "./LanguageSwitcher"
import { htmlLangOf, privacyDoc, termsDoc, t } from "./i18n"

interface DocPageProps {
  title: string
  sections: ReturnType<typeof privacyDoc>
  backLabel: string
  language: LanguageCode
  onLanguageChange: (language: LanguageCode) => void
}

function DocPage({ title, sections, backLabel, language, onLanguageChange }: DocPageProps) {
  return (
    <main className="setup doc">
      <div className="page-top">
        <a className="link" href="/">
          {backLabel}
        </a>
        <LanguageSwitcher language={language} onChange={onLanguageChange} />
      </div>
      <h1>{title}</h1>
      {sections.map((section) => (
        <section key={section.h}>
          <h2>{section.h}</h2>
          {section.p.map((paragraph, i) => (
            <p key={i}>{paragraph}</p>
          ))}
        </section>
      ))}
    </main>
  )
}

export default function Docs({ kind, lang }: { kind: "privacy" | "terms"; lang: LanguageCode }) {
  const [language, setLanguage] = useState<LanguageCode>(lang)

  // 文档页自带切换器时，html lang 跟着当前阅读语言走
  useEffect(() => {
    document.documentElement.lang = htmlLangOf(language)
  }, [language])

  return (
    <DocPage
      title={t(language, kind === "privacy" ? "privacyLink" : "termsLink")}
      sections={kind === "privacy" ? privacyDoc(language) : termsDoc(language)}
      backLabel={t(language, "backToRooms")}
      language={language}
      onLanguageChange={setLanguage}
    />
  )
}
