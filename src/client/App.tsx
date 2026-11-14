import { useEffect, useState } from "react"
import { BUILTIN_ROOMS } from "../shared/rooms"
import Chat from "./Chat"
import Docs from "./Docs"
import Landing, { type Profile } from "./Landing"
import Rooms from "./Rooms"
import { detectLanguage, htmlLangOf, roomMeta, t } from "./i18n"
import { navigate, useRoute } from "./router"

const PROFILE_KEY = "worldchat:profile"

/** 刷新后恢复身份（房间改为跟随 URL，/r/<slug> 即现场）。 */
function loadStoredProfile(): Profile | null {
  try {
    const profile = JSON.parse(localStorage.getItem(PROFILE_KEY) ?? "null") as Profile | null
    if (profile && typeof profile.displayName === "string" && profile.displayName.trim()) {
      return profile
    }
  } catch {
    // 存储损坏就当没存过
  }
  return null
}

export default function App() {
  const route = useRoute()
  const [profile, setProfile] = useState<Profile | null>(() => loadStoredProfile())

  useEffect(() => {
    if (profile) localStorage.setItem(PROFILE_KEY, JSON.stringify(profile))
  }, [profile])

  // html lang 与页面标题跟随当前视图 + 语言
  const uiLang = profile?.language ?? detectLanguage()
  useEffect(() => {
    document.documentElement.lang = htmlLangOf(uiLang)
  }, [uiLang])
  useEffect(() => {
    if (route.name === "room") {
      const room = BUILTIN_ROOMS.find((r) => r.slug === route.slug)
      document.title = room
        ? `${roomMeta(uiLang, room.slug, room).title} · WorldChat`
        : "WorldChat"
    } else if (route.name === "privacy" || route.name === "terms") {
      document.title = `${t(uiLang, route.name === "privacy" ? "privacyLink" : "termsLink")} · WorldChat`
    } else {
      document.title = "WorldChat"
    }
  }, [route, uiLang])

  if (route.name === "privacy") {
    return <Docs kind="privacy" lang={uiLang} />
  }
  if (route.name === "terms") {
    return <Docs kind="terms" lang={uiLang} />
  }

  if (route.name === "room") {
    const room = BUILTIN_ROOMS.find((r) => r.slug === route.slug)
    if (!room) {
      return (
        <main className="setup">
          <h1>{t(uiLang, "notFoundTitle")}</h1>
          <p className="subtitle">{t(uiLang, "notFoundBody", { room: route.slug })}</p>
          <button className="link" onClick={() => navigate("/")}>
            {t(uiLang, "backToRooms")}
          </button>
        </main>
      )
    }
    if (!profile) {
      // 房间链接进来：先收集名称和语言，再进入该房间（停在原 URL）
      return <Landing room={room} onSubmit={setProfile} />
    }
    return (
      <Chat
        room={room}
        displayName={profile.displayName}
        language={profile.language}
        onLeave={() => navigate("/")}
      />
    )
  }

  // 根路径：有身份看房间列表，没有先看落地页
  if (profile) {
    return (
      <Rooms
        profile={profile}
        onEnter={(slug) => navigate(`/r/${encodeURIComponent(slug)}`)}
        onResetProfile={() => setProfile(null)}
      />
    )
  }
  return <Landing onSubmit={setProfile} />
}
