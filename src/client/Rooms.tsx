/**
 * 房间列表（阶段 8）：每个内置房间可进入、可复制分享链接（/r/<slug>）。
 */
import { useState } from "react"
import { BUILTIN_ROOMS } from "../shared/rooms"
import type { LanguageCode } from "../shared/types"
import type { Profile } from "./Landing"
import { roomMeta, t } from "./i18n"
import { roomLink } from "./router"
import { copyText } from "./share"

interface RoomsProps {
  profile: Profile
  onEnter: (slug: string) => void
  onResetProfile: () => void
}

export default function Rooms({ profile, onEnter, onResetProfile }: RoomsProps) {
  const lang: LanguageCode = profile.language
  const [copiedSlug, setCopiedSlug] = useState<string | null>(null)

  async function copyRoomLink(slug: string) {
    if (await copyText(roomLink(slug))) {
      setCopiedSlug(slug)
      setTimeout(() => setCopiedSlug(null), 2000)
    }
  }

  return (
    <main className="setup">
      <h1>WorldChat</h1>
      <p className="subtitle">{t(lang, "helloRooms", { name: profile.displayName })}</p>
      <div className="rooms">
        <h2>{t(lang, "roomsHeading")}</h2>
        <ul>
          {BUILTIN_ROOMS.map((r) => {
            const meta = roomMeta(lang, r.slug, r)
            return (
              <li key={r.id}>
                <div className="room-row">
                  <button className="room-item" onClick={() => onEnter(r.slug)}>
                    <span className="room-title">{meta.title}</span>
                    <span className="room-topic">{meta.topic}</span>
                  </button>
                  <button
                    className="copy-link"
                    onClick={() => copyRoomLink(r.slug)}
                    title={roomLink(r.slug)}
                  >
                    {copiedSlug === r.slug ? t(lang, "copied") : t(lang, "copyLink")}
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
        <button className="link" onClick={onResetProfile}>
          {t(lang, "changeIdentity")}
        </button>
      </div>

      <footer className="footer-links">
        <a href="/privacy">{t(lang, "privacyLink")}</a>
        <span aria-hidden="true">·</span>
        <a href="/terms">{t(lang, "termsLink")}</a>
      </footer>
    </main>
  )
}
