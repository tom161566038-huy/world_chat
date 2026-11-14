/**
 * 隐私说明 / 服务条款（阶段 8 草稿）：内容在 i18n.ts 里按语言维护，
 * 只描述产品真实做的事，不虚构公司主体或法律实体。
 */
import type { LanguageCode } from "../shared/types"
import { privacyDoc, termsDoc, t } from "./i18n"

interface DocPageProps {
  title: string
  sections: ReturnType<typeof privacyDoc>
  backLabel: string
}

function DocPage({ title, sections, backLabel }: DocPageProps) {
  return (
    <main className="setup doc">
      <a className="link" href="/">
        {backLabel}
      </a>
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
  if (kind === "privacy") {
    return (
      <DocPage
        title={t(lang, "privacyLink")}
        sections={privacyDoc(lang)}
        backLabel={t(lang, "backToRooms")}
      />
    )
  }
  return (
    <DocPage
      title={t(lang, "termsLink")}
      sections={termsDoc(lang)}
      backLabel={t(lang, "backToRooms")}
    />
  )
}
