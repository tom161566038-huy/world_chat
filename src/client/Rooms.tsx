/**
 * 房间列表（阶段 9）：内置房间（始终开放）+ 未关闭的自建房间，
 * 每个房间显示在房人数、可复制 /r/<slug> 链接；可创建限时自建房间。
 * 列表数据来自 GET /api/rooms（目录 DO），进入页面取一次，
 * 之后每 12 秒或窗口重新可见时刷新，不为大厅单独开 WebSocket。
 */
import { useCallback, useEffect, useState } from "react"
import type { RoomThemeId } from "../shared/roomThemes"
import { BUILTIN_ROOMS } from "../shared/rooms"
import type { LanguageCode, Profile, Room } from "../shared/types"
import { createRoom, fetchRooms, getVisitorId } from "./api"
import InstallHint from "./InstallHint"
import LandingIntro from "./LandingIntro"
import LanguageSwitcher from "./LanguageSwitcher"
import { roomMeta, t } from "./i18n"
import { ThemePicker } from "./roomThemes"
import { displayNameOf, flagEmoji } from "./profile"
import { DONATE_CN_URL, DONATE_INTL_URL } from "./links"
import { loadRecentRooms } from "./recentRooms"
import { roomLink } from "./router"
import { copyText } from "./share"

/** 关闭时长预设（分钟），与目录 DO 的 DURATION_PRESETS_MINUTES 一致。 */
const DURATIONS: Array<{
  minutes: number
  labelKey: "duration1h" | "duration3h" | "duration12h" | "duration24h"
}> = [
  { minutes: 60, labelKey: "duration1h" },
  { minutes: 180, labelKey: "duration3h" },
  { minutes: 720, labelKey: "duration12h" },
  { minutes: 1440, labelKey: "duration24h" },
]

interface RoomsProps {
  profile: Profile
  onEnter: (slug: string) => void
  onResetProfile: () => void
  /** 顶部切换语言：上层写回 profile 持久化，整个界面立即跟随。 */
  onLanguageChange: (language: LanguageCode) => void
  /** 打开设置面板（游客身份阶段）。 */
  onOpenSettings: () => void
}

function closesLabel(lang: LanguageCode, closesAt: number): string {
  const minutes = Math.max(1, Math.ceil((closesAt - Date.now()) / 60_000))
  if (minutes < 60) return t(lang, "closesInMinutes", { count: String(minutes) })
  return t(lang, "closesInHours", { count: String(Math.ceil(minutes / 60)) })
}

export default function Rooms({
  profile,
  onEnter,
  onResetProfile,
  onLanguageChange,
  onOpenSettings,
}: RoomsProps) {
  const lang: LanguageCode = profile.language
  const [occupancy, setOccupancy] = useState<Record<string, number>>({})
  const [userRooms, setUserRooms] = useState<Room[]>([])
  const [loadFailed, setLoadFailed] = useState(false)
  const [copiedSlug, setCopiedSlug] = useState<string | null>(null)

  const [showForm, setShowForm] = useState(false)
  const [title, setTitle] = useState("")
  const [topic, setTopic] = useState("")
  const [duration, setDuration] = useState(180)
  /** 房间主题背景（阶段 16）：undefined = 默认（无背景）。 */
  const [theme, setTheme] = useState<RoomThemeId | undefined>(undefined)
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [created, setCreated] = useState<Room | null>(null)
  /** 最近去过的房间（进入房间时写入，大厅只读一次）。 */
  const [recent] = useState(() => loadRecentRooms())

  const load = useCallback(async () => {
    const data = await fetchRooms()
    if (data) {
      setUserRooms(data.rooms)
      setOccupancy(data.occupancy)
      setLoadFailed(false)
    } else {
      setLoadFailed(true)
    }
  }, [])

  useEffect(() => {
    load()
    const timer = setInterval(load, 12_000)
    const onVisible = () => {
      if (document.visibilityState === "visible") load()
    }
    document.addEventListener("visibilitychange", onVisible)
    return () => {
      clearInterval(timer)
      document.removeEventListener("visibilitychange", onVisible)
    }
  }, [load])

  async function copyRoomLink(slug: string) {
    if (await copyText(roomLink(slug))) {
      setCopiedSlug(slug)
      setTimeout(() => setCopiedSlug(null), 2000)
    }
  }

  async function submitCreate(e: React.FormEvent) {
    e.preventDefault()
    if (creating) return
    setCreating(true)
    setCreateError(null)
    const result = await createRoom({
      title: title.trim(),
      topic: topic.trim(),
      durationMinutes: duration,
      creatorId: getVisitorId(),
      creatorName: displayNameOf(profile),
      ...(theme ? { theme } : {}),
    })
    setCreating(false)
    if (result.ok) {
      setCreated(result.room)
      setShowForm(false)
      setTitle("")
      setTopic("")
      setTheme(undefined)
      load()
    } else if (result.code === "rate_limited") {
      setCreateError(t(lang, "errCreateRateLimited"))
    } else if (result.code === "too_many_rooms") {
      setCreateError(t(lang, "errCreateFull"))
    } else if (result.code === "filtered") {
      setCreateError(t(lang, "errCreateFiltered"))
    } else if (result.code === "bad_request" || result.code.startsWith("invalid_")) {
      setCreateError(t(lang, "errCreateInvalid"))
    } else {
      setCreateError(t(lang, "errCreateFallback"))
    }
  }

  function roomRow(room: Room, titleText: string, topicText: string, meta?: string) {
    const count = occupancy[room.slug] ?? 0
    return (
      <li key={room.slug}>
        <div className={count > 0 ? "room-row room-row--occupied" : "room-row"}>
          <button className="room-item" onClick={() => onEnter(room.slug)}>
            <span className="room-title">
              {titleText}
              {room.ai ? <span className="ai-badge">AI</span> : null}
            </span>
            <span className="room-topic">{topicText}</span>
            <span className="room-meta">
              <span
                className={count > 0 ? "occ-badge occ-badge--live" : "occ-badge occ-badge--empty"}
              >
                {count > 0
                  ? t(lang, "occupants", { count: String(count) })
                  : t(lang, "occupantsEmpty")}
              </span>
              {meta ? <span className="closes-at">{meta}</span> : null}
            </span>
          </button>
          {/* 空房间的右侧按钮换成邀请口吻（复制仍是同一条 /r/<slug> 链接） */}
          <button
            className={count > 0 ? "copy-link" : "copy-link copy-link--invite"}
            onClick={() => copyRoomLink(room.slug)}
            title={roomLink(room.slug)}
          >
            {copiedSlug === room.slug
              ? t(lang, "copied")
              : count > 0
                ? t(lang, "copyLink")
                : t(lang, "inviteFriend")}
          </button>
        </div>
      </li>
    )
  }

  // 同一分组内把有人的房间排到前面；排序稳定，同人数的相对顺序不变
  const builtinSorted = [...BUILTIN_ROOMS].sort(
    (a, b) => (occupancy[b.slug] ?? 0) - (occupancy[a.slug] ?? 0),
  )
  const userRoomsSorted = [...userRooms].sort(
    (a, b) => (occupancy[b.slug] ?? 0) - (occupancy[a.slug] ?? 0),
  )

  // 最近去过：内置房始终可进；自建房从目录列表消失（关闭/过期）就不再展示
  const recentRooms = recent
    .flatMap((item) => {
      const room = BUILTIN_ROOMS.find((r) => r.slug === item.slug) ??
        userRooms.find((r) => r.slug === item.slug)
      return room ? [{ slug: item.slug, title: roomMeta(lang, item.slug, room).title }] : []
    })
    .slice(0, 8)

  return (
    <main className="setup">
      <div className="page-top">
        <h1>WorldChat</h1>
        <LanguageSwitcher language={lang} onChange={onLanguageChange} />
      </div>
      {/* 与落地页共用的介绍块：老用户每次进大厅也能第一眼看到卖点 */}
      <LandingIntro language={lang} />
      <p className="subtitle">
        {t(lang, "helloRooms", { name: displayNameOf(profile) })}
        {/* 国旗识别不到就不显示，不用占位旗 */}
        {flagEmoji(profile.countryCode) && (
          <span className="flag"> {flagEmoji(profile.countryCode)}</span>
        )}
      </p>
      {loadFailed && <p className="load-error">{t(lang, "errLoadRooms")}</p>}

      <div className="rooms">
        {recentRooms.length > 0 && (
          <div className="recent-rooms">
            <h2>{t(lang, "recentRoomsHeading")}</h2>
            <div className="recent-chips">
              {recentRooms.map((r) => (
                <button key={r.slug} className="recent-chip" onClick={() => onEnter(r.slug)}>
                  {r.title}
                </button>
              ))}
            </div>
          </div>
        )}

        <h2>{t(lang, "roomsHeading")}</h2>
        <ul>
          {builtinSorted.map((r) => {
            const meta = roomMeta(lang, r.slug, r)
            return roomRow(r, meta.title, meta.topic)
          })}
        </ul>

        <h2>{t(lang, "userRoomsHeading")}</h2>
        {userRoomsSorted.length > 0 && (
          <ul>
            {userRoomsSorted.map((r) =>
              roomRow(
                r,
                r.title,
                r.topic,
                `${r.createdByName ? `${t(lang, "createdBy", { name: r.createdByName })} · ` : ""}${closesLabel(lang, r.closesAt ?? Date.now())}`,
              ),
            )}
          </ul>
        )}
        {!showForm && (
          <button className="link create-link" onClick={() => setShowForm(true)}>
            {t(lang, "createRoom")}
          </button>
        )}

        {showForm && (
          <form className="create-form" onSubmit={submitCreate}>
            <label>
              {t(lang, "roomTitleLabel")}
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={t(lang, "roomTitlePlaceholder")}
                maxLength={40}
                required
              />
            </label>
            <label>
              {t(lang, "roomTopicLabel")}
              <input
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder={t(lang, "roomTopicPlaceholder")}
                maxLength={80}
              />
            </label>
            <label>
              {t(lang, "durationLabel")}
              <select value={duration} onChange={(e) => setDuration(Number(e.target.value))}>
                {DURATIONS.map(({ minutes, labelKey }) => (
                  <option key={minutes} value={minutes}>
                    {t(lang, labelKey)}
                  </option>
                ))}
              </select>
            </label>
            {/* 房间主题背景（阶段 16）：缩略图单选，默认 = 无背景 */}
            <div className="theme-field">
              <span className="theme-field-label">{t(lang, "themeLabel")}</span>
              <ThemePicker language={lang} value={theme} onPick={setTheme} />
            </div>
            {createError && (
              <p className="create-error" role="alert">
                {createError}
              </p>
            )}
            <span className="form-actions">
              <button type="submit" disabled={creating || !title.trim()}>
                {creating ? t(lang, "creating") : t(lang, "createSubmit")}
              </button>
              <button type="button" className="link" onClick={() => setShowForm(false)}>
                {t(lang, "cancel")}
              </button>
            </span>
          </form>
        )}

        {created && (
          <div className="created-panel">
            <p>{t(lang, "roomCreated")}</p>
            <p className="created-link">{roomLink(created.slug)}</p>
            <span className="form-actions">
              <button onClick={() => onEnter(created.slug)}>{t(lang, "continueBtn")}</button>
              <button className="link" onClick={() => copyRoomLink(created.slug)}>
                {copiedSlug === created.slug ? t(lang, "copied") : t(lang, "copyLink")}
              </button>
            </span>
          </div>
        )}

        {/* 设置入口：块级换行，与创建表单/换个身份都分行 */}
        <button className="link settings-link" onClick={onOpenSettings}>
          {t(lang, "settingsBtn")}
        </button>

        {/* 独立间距类：与「创建房间」拉开距离，不影响其它 .link */}
        <button className="link identity-link" onClick={onResetProfile}>
          {t(lang, "changeIdentity")}
        </button>

        {/* 安装到主屏幕入口：已在独立窗口/已关闭时不渲染 */}
        <InstallHint language={lang} />
      </div>

      <footer className="footer-links">
        <a href="/privacy">{t(lang, "privacyLink")}</a>
        <span aria-hidden="true">·</span>
        <a href="/terms">{t(lang, "termsLink")}</a>
        <span aria-hidden="true">·</span>
        <a href={DONATE_CN_URL} target="_blank" rel="noopener noreferrer">
          {t(lang, "donateCnLink")}
        </a>
        <span aria-hidden="true">·</span>
        <a href={DONATE_INTL_URL} target="_blank" rel="noopener noreferrer">
          {t(lang, "donateIntlLink")}
        </a>
      </footer>
    </main>
  )
}
