import { useEffect, useState } from "react"
import { BUILTIN_ROOMS } from "../shared/rooms"
import type { Room } from "../shared/types"
import { lookupRoom, resetVisitorId } from "./api"
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

function NoticePage({ title, body, backLabel }: { title: string; body: string; backLabel: string }) {
  return (
    <main className="setup">
      <h1>{title}</h1>
      <p className="subtitle">{body}</p>
      <button className="link" onClick={() => navigate("/")}>
        {backLabel}
      </button>
    </main>
  )
}

/**
 * /r/<slug> 的房间解析（阶段 9）：内置房间直接进；自建房间先查目录，
 * 关闭的房间给明确「已关闭」页，不存在的按旧逻辑提示；需要身份时先收身份。
 */
function RoomRoute({
  slug,
  profile,
  onProfile,
}: {
  slug: string
  profile: Profile | null
  onProfile: (profile: Profile) => void
}) {
  const uiLang = profile?.language ?? detectLanguage()
  const builtin = BUILTIN_ROOMS.find((r) => r.slug === slug)
  const [userRoom, setUserRoom] = useState<Room | null>(null)
  const [lookupState, setLookupState] = useState<"loading" | "ok" | "closed" | "not_found">(
    builtin ? "ok" : "loading",
  )

  useEffect(() => {
    if (builtin) return
    let cancelled = false
    setUserRoom(null)
    setLookupState("loading")
    lookupRoom(slug).then((result) => {
      if (cancelled) return
      if (result.status === "ok") {
        setUserRoom(result.room)
        setLookupState("ok")
      } else {
        setLookupState(result.status)
      }
    })
    return () => {
      cancelled = true
    }
  }, [slug, builtin])

  if (lookupState === "loading") {
    return (
      <main className="setup">
        <p className="subtitle">{t(uiLang, "loadingRoom")}</p>
      </main>
    )
  }
  if (lookupState === "closed") {
    return (
      <NoticePage
        title={t(uiLang, "roomClosedTitle")}
        body={t(uiLang, "roomClosedBody")}
        backLabel={t(uiLang, "backToRooms")}
      />
    )
  }
  if (lookupState === "not_found") {
    return (
      <NoticePage
        title={t(uiLang, "notFoundTitle")}
        body={t(uiLang, "notFoundBody", { room: slug })}
        backLabel={t(uiLang, "backToRooms")}
      />
    )
  }

  const room = builtin ?? userRoom
  if (!room || !profile) {
    // 房间链接进来：先收集名称和语言，再进入该房间（停在原 URL）
    return room ? <Landing room={room} onSubmit={onProfile} /> : null
  }
  return (
    <Chat
      key={room.id}
      room={room}
      displayName={profile.displayName}
      language={profile.language}
      onLeave={() => navigate("/")}
    />
  )
}

export default function App() {
  const route = useRoute()
  const [profile, setProfile] = useState<Profile | null>(() => loadStoredProfile())

  useEffect(() => {
    if (profile) localStorage.setItem(PROFILE_KEY, JSON.stringify(profile))
    else localStorage.removeItem(PROFILE_KEY)
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
    return <RoomRoute slug={route.slug} profile={profile} onProfile={setProfile} />
  }

  // 根路径：有身份看房间列表，没有先看落地页
  if (profile) {
    return (
      <Rooms
        profile={profile}
        onEnter={(slug) => navigate(`/r/${encodeURIComponent(slug)}`)}
        onResetProfile={() => {
          // 更换身份（阶段 11）：展示档案和稳定访客 id 一起清，
          // 下次进入重新生成——旧 id 不再算同一个访客
          resetVisitorId()
          setProfile(null)
        }}
      />
    )
  }
  return <Landing onSubmit={setProfile} />
}
