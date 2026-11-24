/**
 * 落地页 + 入口表单（游客身份阶段）：
 * 介绍产品 + 语言选择；昵称完全可选——不填就直接用当前语言的游客名进入。
 * 从房间链接进来时带上房间上下文（room），提示将进入哪个房间。
 */
import { useEffect, useState } from "react"
import type { LanguageCode, Room } from "../shared/types"
import InstallHint from "./InstallHint"
import LanguageSwitcher from "./LanguageSwitcher"
import { detectLanguage, htmlLangOf, LANGUAGES, roomMeta, t } from "./i18n"
import { guestName, guestSuffixOf } from "./profile"
import { getVisitorId } from "./api"
import { DONATE_CN_URL, DONATE_INTL_URL } from "./links"

export interface LandingResult {
  language: LanguageCode
  /** 选填昵称；空 = 游客名（前缀随语言、短号随身份）。 */
  nickname?: string
}

interface LandingProps {
  /** 从 /r/<slug> 进入时带上房间，表单提示会说明进哪个房间。 */
  room?: Room
  /** 继续（选语言，昵称可选）后建立档案进入下一步。 */
  onSubmit: (result: LandingResult) => void
}

export default function Landing({ room, onSubmit }: LandingProps) {
  const [nickname, setNickname] = useState("")
  const [language, setLanguage] = useState<LanguageCode>(detectLanguage())

  // 落地页还没存档案，html lang 跟着当前选择走
  useEffect(() => {
    document.documentElement.lang = htmlLangOf(language)
  }, [language])

  const roomTitle = room ? roomMeta(language, room.slug, room).title : undefined
  // 游客名预览随语言实时变化（短号跟身份走，不会变）
  const guestPreview = guestName(language, guestSuffixOf(getVisitorId()))

  return (
    <main className="setup landing">
      {/* 顶部切换器与下方表单选择器共用同一 language state，两边永远同步 */}
      <div className="page-top">
        <h1>WorldChat</h1>
        <LanguageSwitcher language={language} onChange={setLanguage} />
      </div>
      {/* 钩子文案紧跟标题：tagline 主句 + 三条亮点 + landingIntro 正文，让第一眼看到卖点 */}
      <p className="landing-hook">{t(language, "tagline")}</p>
      <ul className="landing-points">
        <li>{t(language, "pointTranslate")}</li>
        <li>{t(language, "pointFree")}</li>
        <li>{t(language, "pointInstall")}</li>
      </ul>
      <p className="landing-body">{t(language, "landingIntro")}</p>

      <form
        className="entry"
        onSubmit={(e) => {
          e.preventDefault()
          onSubmit({
            language,
            nickname: nickname.trim() ? nickname.trim().slice(0, 20) : undefined,
          })
        }}
      >
        {roomTitle && (
          <p className="enter-room-note">{t(language, "enterRoomNote", { room: roomTitle })}</p>
        )}
        <label>
          {t(language, "nameLabel")}
          <input
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            placeholder={guestPreview}
            maxLength={20}
          />
        </label>
        <label>
          {t(language, "langLabel")}
          <select value={language} onChange={(e) => setLanguage(e.target.value)}>
            {LANGUAGES.map(({ code, label }) => (
              <option key={code} value={code}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <button type="submit">{t(language, "continueBtn")}</button>
        <p className="landing-note">{t(language, "landingNote")}</p>
      </form>

      <section className="how">
        <h2>{t(language, "howTitle")}</h2>
        <ol>
          <li>{t(language, "how1")}</li>
          <li>{t(language, "how2")}</li>
          <li>{t(language, "how3")}</li>
        </ol>
      </section>

      {/* 安装到主屏幕入口：已在独立窗口/已关闭时不渲染 */}
      <InstallHint language={language} />

      <footer className="footer-links">
        <a href="/privacy">{t(language, "privacyLink")}</a>
        <span aria-hidden="true">·</span>
        <a href="/terms">{t(language, "termsLink")}</a>
        <span aria-hidden="true">·</span>
        <a href={DONATE_CN_URL} target="_blank" rel="noopener noreferrer">
          {t(language, "donateCnLink")}
        </a>
        <span aria-hidden="true">·</span>
        <a href={DONATE_INTL_URL} target="_blank" rel="noopener noreferrer">
          {t(language, "donateIntlLink")}
        </a>
      </footer>
    </main>
  )
}
