import { useEffect, useRef, useState } from "react"
import { BUILTIN_ROOMS } from "../shared/rooms"
import type { Profile, Room } from "../shared/types"
import { fetchCountryCode, getVisitorId, lookupRoom, resetVisitorId } from "./api"
import Chat from "./Chat"
import Docs from "./Docs"
import Landing from "./Landing"
import Rooms from "./Rooms"
import Settings from "./Settings"
import { detectLanguage, htmlLangOf, roomMeta, t } from "./i18n"
import { clearProfile, createGuestProfile, loadProfile, saveProfile } from "./profile"
import { navigate, useRoute } from "./router"

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
 * 关闭的房间给明确「已关闭」页，不存在的按旧逻辑提示。
 * 游客身份阶段：没有档案时自动以游客身份进入该房间（房间仍要先解析是否关闭）。
 */
function RoomRoute({
  slug,
  profile,
  onProfile,
  onOpenSettings,
}: {
  slug: string
  profile: Profile | null
  onProfile: (profile: Profile) => void
  onOpenSettings: () => void
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
    // 带上访客 id：目录命中创建者时 room.isCreator 为真，
    // 聊天页据此显示「背景」管理入口（阶段 16）。房主判定只在服务端。
    lookupRoom(slug, getVisitorId()).then((result) => {
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

  const room = builtin ?? userRoom
  // 房间存在且已解析，但本地还没有档案：自动建游客档案进入（不必先起名）。
  // 房间关闭/不存在的判断仍在前面，不会带人进错房间。
  useEffect(() => {
    if (lookupState === "ok" && room && !profile) {
      onProfile(createGuestProfile(uiLang))
    }
  }, [lookupState, room, profile, uiLang, onProfile])

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
  if (!room || !profile) return null
  return (
    <Chat
      key={room.id}
      room={room}
      profile={profile}
      onLanguageChange={(language) => onProfile({ ...profile, language })}
      onLeave={() => navigate("/")}
      onOpenSettings={onOpenSettings}
    />
  )
}

export default function App() {
  const route = useRoute()
  const [profile, setProfile] = useState<Profile | null>(() => loadProfile())
  const [settingsOpen, setSettingsOpen] = useState(false)
  /** 国家码只在每次拿到档案后拉一次；识别失败不清已有国家码。 */
  const geoFetched = useRef(false)

  useEffect(() => {
    if (profile) saveProfile(profile)
    else clearProfile()
  }, [profile])

  // 边缘国家码：有档案后拉一次 /api/geo，有效才写入（无效不动已有值）。
  // 换身份清空档案后允许重拉一次。
  useEffect(() => {
    if (!profile) {
      geoFetched.current = false
      return
    }
    if (geoFetched.current) return
    geoFetched.current = true
    void fetchCountryCode().then((country) => {
      if (!country) return
      setProfile((prev) =>
        prev && prev.countryCode !== country ? { ...prev, countryCode: country } : prev,
      )
    })
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
    return (
      <>
        <RoomRoute
          slug={route.slug}
          profile={profile}
          onProfile={setProfile}
          onOpenSettings={() => setSettingsOpen(true)}
        />
        {settingsOpen && profile && (
          <Settings
            profile={profile}
            onSave={setProfile}
            onClose={() => setSettingsOpen(false)}
          />
        )}
      </>
    )
  }

  // 根路径：有身份看房间列表，没有先看落地页（昵称可选，不填就是游客）
  if (profile) {
    return (
      <>
        <Rooms
          profile={profile}
          onEnter={(slug) => navigate(`/r/${encodeURIComponent(slug)}`)}
          onLanguageChange={(language) => setProfile({ ...profile, language })}
          onOpenSettings={() => setSettingsOpen(true)}
          onResetProfile={() => {
            // 更换身份（游客身份阶段）：档案 + 稳定访客 id 一起清，
            // 头像与资料字段随档案清空，下次进入重新生成新游客名
            resetVisitorId()
            clearProfile()
            setProfile(null)
          }}
        />
        {settingsOpen && (
          <Settings
            profile={profile}
            onSave={setProfile}
            onClose={() => setSettingsOpen(false)}
          />
        )}
      </>
    )
  }
  return (
    <Landing
      onSubmit={(result) =>
        setProfile({ ...createGuestProfile(result.language), nickname: result.nickname })
      }
    />
  )
}
