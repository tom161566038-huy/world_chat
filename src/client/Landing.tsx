/**
 * 落地页 + 入口表单（阶段 8）：
 * 先说清「这是什么、怎么用」，再收集显示名称与界面语言。
 * 从房间链接进来时带上房间上下文（room），提示将进入哪个房间。
 */
import { useEffect, useState } from "react"
import type { LanguageCode, Room } from "../shared/types"
import LanguageSwitcher from "./LanguageSwitcher"
import { detectLanguage, htmlLangOf, LANGUAGES, roomMeta, t } from "./i18n"

export interface Profile {
  displayName: string
  language: LanguageCode
}

interface LandingProps {
  /** 从 /r/<slug> 进入时带上房间，表单提示会说明进哪个房间。 */
  room?: Room
  /** 提交（起名 + 选语言）后进入下一步。 */
  onSubmit: (profile: Profile) => void
}

export default function Landing({ room, onSubmit }: LandingProps) {
  const [displayName, setDisplayName] = useState("")
  const [language, setLanguage] = useState<LanguageCode>(detectLanguage())

  // 落地页还没存档案，html lang 跟着当前选择走
  useEffect(() => {
    document.documentElement.lang = htmlLangOf(language)
  }, [language])

  const roomTitle = room ? roomMeta(language, room.slug, room).title : undefined

  return (
    <main className="setup landing">
      {/* 顶部切换器与下方表单选择器共用同一 language state，两边永远同步 */}
      <div className="page-top">
        <h1>WorldChat</h1>
        <LanguageSwitcher language={language} onChange={setLanguage} />
      </div>
      <p className="subtitle">{t(language, "tagline")}</p>

      <section className="how">
        <p className="intro">{t(language, "landingIntro")}</p>
        <h2>{t(language, "howTitle")}</h2>
        <ol>
          <li>{t(language, "how1")}</li>
          <li>{t(language, "how2")}</li>
          <li>{t(language, "how3")}</li>
        </ol>
      </section>

      <form
        className="entry"
        onSubmit={(e) => {
          e.preventDefault()
          if (!displayName.trim()) return
          onSubmit({ displayName: displayName.trim(), language })
        }}
      >
        {roomTitle && (
          <p className="enter-room-note">{t(language, "enterRoomNote", { room: roomTitle })}</p>
        )}
        <label>
          {t(language, "nameLabel")}
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder={t(language, "namePlaceholder")}
            maxLength={20}
            required
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
      </form>

      <footer className="footer-links">
        <a href="/privacy">{t(language, "privacyLink")}</a>
        <span aria-hidden="true">·</span>
        <a href="/terms">{t(language, "termsLink")}</a>
      </footer>
    </main>
  )
}
