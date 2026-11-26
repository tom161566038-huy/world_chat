/**
 * 产品介绍块（公共控件）：主标语 + 三条亮点 + 一句话正文。
 * 落地页与大厅共用——大厅每次进入也展示，让回访用户第一眼看到卖点。
 */
import type { LanguageCode } from "../shared/types"
import { t } from "./i18n"

export default function LandingIntro({ language }: { language: LanguageCode }) {
  return (
    <>
      <p className="landing-hook">{t(language, "tagline")}</p>
      <ul className="landing-points">
        <li>{t(language, "pointTranslate")}</li>
        <li>{t(language, "pointFree")}</li>
        <li>{t(language, "pointInstall")}</li>
      </ul>
      <p className="landing-body">{t(language, "landingIntro")}</p>
    </>
  )
}
