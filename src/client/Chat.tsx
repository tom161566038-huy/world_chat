import { useEffect, useRef, useState } from "react"
import type { ClientEvent, ServerEvent } from "../shared/protocol"
import type { RoomThemeId } from "../shared/roomThemes"
import { AI_SENDER_PREFIX } from "../shared/rooms"
import type {
  ChatMessage,
  LanguageCode,
  MessageTranslation,
  Profile,
  Room,
  RoomMemberProfile,
} from "../shared/types"
import Avatar from "./Avatar"
import ProfileCard from "./ProfileCard"
import ProfileHome from "./ProfileHome"
import { getVisitorId, updateRoomTheme, uploadRoomBackground } from "./api"
import LanguageSwitcher from "./LanguageSwitcher"
import { roomMeta, sameLanguage, serverErrorMessage, t } from "./i18n"
import { ROOM_THEME_OPTIONS } from "./roomThemes"
import { compressBackground, displayNameOf, flagEmoji, memberOf, profilePayloadOf } from "./profile"
import { recordRecentRoom } from "./recentRooms"
import { roomLink } from "./router"
import { copyText } from "./share"
import { wsUrl } from "./wsUrl"

interface ChatProps {
  room: Room
  profile: Profile
  onLeave: () => void
  /** 顶部切换语言：上层写回 profile，language prop 变化会触发下方重连。 */
  onLanguageChange: (language: LanguageCode) => void
  /** 打开设置面板（游客身份阶段）：顶栏随时可进。 */
  onOpenSettings: () => void
}

type ConnectionState = "connecting" | "open" | "closed"

/** 断线后自动重连的间隔；重连由 attempt 计数触发 effect 重建。 */
const RETRY_DELAY_MS = 3000

/** 单条消息的举报流程状态：隐藏 → 填理由 → 提交中 → 完成/失败。 */
type ReportUiState = "hidden" | "form" | "sending" | "done" | "failed" | "rate_limited"

/** 举报提交结果：成功 / 被服务端拒绝 / 举报太频繁 / 连接问题或超时。 */
type ReportResult = "ok" | "bad" | "rate_limited" | "network"

/** 发送者一行：头像 + 名字 + 国旗，点开资料卡（游客身份阶段）。 */
function SenderLine({
  name,
  member,
  senderId,
  onOpenCard,
}: {
  name: string
  member?: RoomMemberProfile
  senderId: string
  onOpenCard: (userId: string) => void
}) {
  const flag = flagEmoji(member?.countryCode)
  return (
    <span className="sender-line">
      <Avatar
        avatar={member?.avatar}
        seed={senderId}
        label={name}
        size={20}
        onClick={() => onOpenCard(senderId)}
        title={name}
      />
      <button type="button" className="sender sender-btn" onClick={() => onOpenCard(senderId)}>
        {name}
      </button>
      {member?.isAi ? <span className="ai-badge">AI</span> : null}
      {flag ? <span className="flag">{flag}</span> : null}
    </span>
  )
}

/** 单条消息：自己发的永远看原文；别人的消息优先显示成自己语言的译文，可展开原文。
 * AI 场景房例外（阶段 15 修订）：AI 的消息英文原文为主、译文点开才显示，保住练习价值。 */
function MessageRow({
  message,
  mine,
  translation,
  translationFailed,
  myLanguage,
  member,
  aiMessage,
  onOpenCard,
  onReport,
}: {
  message: ChatMessage
  mine: boolean
  translation?: MessageTranslation
  /** 服务端明确通知过「这条译不出来」，UI 给出说明而不是默默显示原文。 */
  translationFailed: boolean
  myLanguage: LanguageCode
  /** AI 伙伴的消息（房间带 ai 人设且 senderId 为 ai: 前缀）：英文为主展示。 */
  aiMessage: boolean
  /** 发送者档案（头像/国旗/资料卡数据源）；旧消息查不到就没有。 */
  member?: RoomMemberProfile
  onOpenCard: (userId: string) => void
  /** 提交举报，返回结果状态；失败时表单保留已填的理由便于重试。 */
  onReport: (reason: string) => Promise<ReportResult>
}) {
  const [showOriginal, setShowOriginal] = useState(false)
  const [showTranslation, setShowTranslation] = useState(false)
  const [reportUi, setReportUi] = useState<ReportUiState>("hidden")
  const [reason, setReason] = useState("")
  const translated =
    !mine &&
    translation !== undefined &&
    translation.targetLang === myLanguage &&
    translation.text !== message.sourceText
  // 与原语言相同本来就不翻译；不同语言但译文还没到时给「翻译中/失败」提示
  const needsTranslation = !mine && !sameLanguage(message.sourceLang, myLanguage)

  async function submitReport() {
    setReportUi("sending")
    const result = await onReport(reason)
    // 失败/被限流都保留 reason，重试不必重填（阶段 10）
    if (result === "ok") setReportUi("done")
    else if (result === "rate_limited") setReportUi("rate_limited")
    else setReportUi("failed")
  }

  function translationNote() {
    if (translated || !needsTranslation) return null
    if (translationFailed) {
      return (
        <button className="tr-failed" onClick={() => setShowOriginal(true)}>
          {t(myLanguage, "translationFailed")}
        </button>
      )
    }
    return <span className="tr-pending">{t(myLanguage, "translating")}</span>
  }

  return (
    <div className={mine ? "mine" : "others"}>
      <SenderLine
        name={message.senderName}
        member={member}
        senderId={message.senderId}
        onOpenCard={onOpenCard}
      />
      {translated ? (
        aiMessage ? (
          <>
            <p className="bubble">{message.sourceText}</p>
            <button className="toggle" onClick={() => setShowTranslation((v) => !v)}>
              {showTranslation
                ? t(myLanguage, "hideTranslation")
                : t(myLanguage, "showTranslation")}
            </button>
            {showTranslation && <p className="original">{translation.text}</p>}
          </>
        ) : (
          <>
            <p className="bubble">{translation.text}</p>
            <button className="toggle" onClick={() => setShowOriginal((v) => !v)}>
              {showOriginal ? t(myLanguage, "hideOriginal") : t(myLanguage, "showOriginal")}
            </button>
            {showOriginal && <p className="original">{message.sourceText}</p>}
          </>
        )
      ) : (
        <>
          <p className="bubble">{message.sourceText}</p>
          {translationNote()}
          {showOriginal && <p className="original">{message.sourceText}</p>}
        </>
      )}

      {/* AI 伙伴的消息不提供举报（成员档案带 isAi 标记，阶段 15） */}
      {!mine && !member?.isAi && (
        <span className="report-area">
          {reportUi === "hidden" && (
            <button className="toggle" onClick={() => setReportUi("form")}>
              {t(myLanguage, "report")}
            </button>
          )}
          {(reportUi === "form" || reportUi === "sending") && (
            <>
              <input
                className="report-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder={t(myLanguage, "reportPlaceholder")}
                maxLength={200}
                disabled={reportUi === "sending"}
              />
              <button className="toggle" disabled={reportUi === "sending"} onClick={submitReport}>
                {reportUi === "sending" ? t(myLanguage, "submitting") : t(myLanguage, "submitBtn")}
              </button>
              <button
                className="toggle"
                disabled={reportUi === "sending"}
                onClick={() => setReportUi("hidden")}
              >
                {t(myLanguage, "cancel")}
              </button>
            </>
          )}
          {reportUi === "done" && (
            <span className="report-done">{t(myLanguage, "reportDone")}</span>
          )}
          {(reportUi === "failed" || reportUi === "rate_limited") && (
            <>
              <span className="report-failed">
                {t(
                  myLanguage,
                  reportUi === "rate_limited" ? "errReportRateLimited" : "reportFailed",
                )}
              </span>
              <button className="toggle" onClick={submitReport}>
                {t(myLanguage, "retryReport")}
              </button>
            </>
          )}
        </span>
      )}
    </div>
  )
}

export default function Chat({
  room,
  profile,
  onLeave,
  onLanguageChange,
  onOpenSettings,
}: ChatProps) {
  const language = profile.language
  const displayName = displayNameOf(profile)
  const profilePayload = profilePayloadOf(profile, displayName)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  /** messageId -> 译文，原文广播后服务端会异步推送过来。 */
  const [translations, setTranslations] = useState<Record<string, MessageTranslation>>({})
  /** 服务端通知过「翻译失败」的消息 id（按我的语言），用于显示失败说明。 */
  const [failedTranslations, setFailedTranslations] = useState<Set<string>>(new Set())
  const [draft, setDraft] = useState("")
  const [status, setStatus] = useState<ConnectionState>("connecting")
  const [myUserId, setMyUserId] = useState<string | null>(null)
  /** 服务端 error 事件（按 code 本地化），短暂展示后自动消失。 */
  const [serverError, setServerError] = useState<string | null>(null)
  const [inviteCopied, setInviteCopied] = useState(false)
  /** 在房人数（阶段 9）：join 后和每次变化时服务端都会推 presence。 */
  const [occupantCount, setOccupantCount] = useState<number | null>(null)
  /** 自建房间到点关闭（阶段 9）：停止重连、禁用输入、显示关闭横幅。 */
  const [roomClosed, setRoomClosed] = useState(false)
  const roomClosedRef = useRef(false)
  /** 断线后 +1 触发 effect 重建 WebSocket，实现自动重连。 */
  const [attempt, setAttempt] = useState(0)
  const socketRef = useRef<WebSocket | null>(null)
  const listRef = useRef<HTMLDivElement | null>(null)
  /** 已收到的最大消息 seq（阶段 11）：重连 join 带上它补拉断线期间错过的消息。 */
  const lastSeqRef = useRef(-1)
  /** 房间成员档案（游客身份阶段）：userId -> 档案，头像/国旗/资料卡的数据源。 */
  const [members, setMembers] = useState<Record<string, RoomMemberProfile>>({})
  /** 点开的资料卡对应的 userId；null = 关着。 */
  const [cardUserId, setCardUserId] = useState<string | null>(null)
  /** 打开的用户主页对应的 userId（应用内视图状态，不新增路由）；null = 关着。 */
  const [homeUserId, setHomeUserId] = useState<string | null>(null)
  /** 最近一次上报给服务端的档案（JSON）：避免 join 后重复发 profile_update。 */
  const lastSentProfileRef = useRef<string | null>(null)
  /**
   * 房间背景（阶段 16）：bgTheme = 内置 SVG 场景、bgImage = 房主上传的
   * dataURL（优先于主题显示）。先用 room.theme 即时上墙（房间记录带着），
   * joined 事件的 background 再校正为 Room DO bg 键里的权威值；
   * room_theme / room_background 广播实时跟进房主的修改。
   */
  const [bgTheme, setBgTheme] = useState<RoomThemeId | undefined>(room.theme)
  const [bgImage, setBgImage] = useState<string | null>(null)
  /** 背景管理面板（仅房主，room.isCreator 由目录判定）。 */
  const [bgPanelOpen, setBgPanelOpen] = useState(false)
  const [bgUploading, setBgUploading] = useState(false)
  const [bgError, setBgError] = useState<string | null>(null)

  // 切换语言（界面小修复）：清掉旧语言的译文缓存并把游标重置为 -1，
  // 随后 socket effect（依赖 language）重连时 join 不带 lastSeq，
  // 服务端回放整套新语言的历史译文；消息本体在 history 合并里按 id
  // 去重，聊天现场保留、不刷空。此 effect 需声明在 socket effect 之前。
  useEffect(() => {
    setTranslations({})
    setFailedTranslations(new Set())
    lastSeqRef.current = -1
  }, [language])

  // 未自定义昵称的游客：切语言只换前缀、短号不变 → 显示名变化触发重连，
  // join 会带上新语言前缀的游客名（displayNameOf 在每次渲染时重算）。
  useEffect(() => {
    let disposed = false
    let retryTimer: number | undefined
    const socket = new WebSocket(wsUrl(room.id))
    socketRef.current = socket
    const joinPayloadJson = JSON.stringify(profilePayload)

    socket.onopen = () => {
      setStatus("open")
      // visitorId：浏览器本地持久，服务端把它当稳定 userId（阶段 11）；
      // lastSeq：重连时告诉服务端补拉这之后的消息，聊天现场不断；
      // profile：头像/国旗/资料卡（游客身份阶段）
      const join: ClientEvent = {
        type: "join",
        roomId: room.id,
        displayName,
        language,
        visitorId: getVisitorId(),
        profile: profilePayload,
        ...(lastSeqRef.current >= 0 ? { lastSeq: lastSeqRef.current } : {}),
      }
      socket.send(JSON.stringify(join))
      // join 已带最新档案，避免 profile_update 效果重复上报
      lastSentProfileRef.current = joinPayloadJson
    }

    socket.onmessage = (e: MessageEvent) => {
      let event: ServerEvent
      try {
        event = JSON.parse(String(e.data)) as ServerEvent
      } catch {
        return
      }
      if (event.type === "joined") {
        setMyUserId(event.userId)
        if (event.background) {
          setBgTheme(event.background.theme)
          setBgImage(event.background.image ?? null)
        }
      } else if (event.type === "room_theme") {
        setBgTheme(event.theme)
      } else if (event.type === "room_background") {
        setBgImage(event.image)
      } else if (event.type === "history") {
        // 服务端回放的消息（初次进入 = 近期历史，重连 = 补拉错过的）。
        // 去重合并：重连时本地已有一部分，只 append 没见过的（按 id），
        // 聊天现场保持连续、不重复插一遍。
        setMessages((prev) => {
          const known = new Set(prev.map((m) => m.id))
          const fresh = event.messages
            .filter((item) => !known.has(item.message.id))
            .map((item) => item.message)
          return fresh.length > 0 ? [...prev, ...fresh] : prev
        })
        for (const item of event.messages) {
          if (item.seq > lastSeqRef.current) lastSeqRef.current = item.seq
        }
        const cached = event.messages
          .map((item) => item.translation)
          .filter((t): t is MessageTranslation => t !== undefined)
        if (cached.length > 0) {
          setTranslations((prev) => {
            const next = { ...prev }
            for (const item of cached) next[item.messageId] = item
            return next
          })
        }
      } else if (event.type === "message") {
        if (event.seq > lastSeqRef.current) lastSeqRef.current = event.seq
        setMessages((prev) =>
          prev.some((m) => m.id === event.message.id) ? prev : [...prev, event.message],
        )
      } else if (event.type === "translation") {
        setTranslations((prev) => ({
          ...prev,
          [event.translation.messageId]: event.translation,
        }))
        setFailedTranslations((prev) => {
          if (!prev.has(event.translation.messageId)) return prev
          const next = new Set(prev)
          next.delete(event.translation.messageId)
          return next
        })
      } else if (event.type === "translation_failed") {
        // 只关心发给「我的语言」的失败信号
        if (sameLanguage(event.targetLang, language)) {
          setFailedTranslations((prev) => new Set(prev).add(event.messageId))
        }
      } else if (event.type === "presence") {
        setOccupantCount(event.count)
      } else if (event.type === "member_profile") {
        // 房里有人改了资料/新人进来：更新本地缓存（自己的回执也走这里）
        setMembers((prev) => ({ ...prev, [event.member.userId]: event.member }))
      } else if (event.type === "member_profiles") {
        // 加入时的批量回放：历史消息发送者 + 当前在房的人
        setMembers((prev) => {
          const next = { ...prev }
          for (const member of event.members) next[member.userId] = member
          return next
        })
      } else if (event.type === "room_closed") {
        roomClosedRef.current = true
        setRoomClosed(true)
      } else if (event.type === "error") {
        setServerError(serverErrorMessage(language, event.code))
      }
    }

    socket.onclose = () => {
      setStatus("closed")
      // 自动重连：稍等片刻重建连接（离开房间、房间到点关闭时不重连）
      if (!disposed && !roomClosedRef.current) {
        retryTimer = window.setTimeout(() => setAttempt((n) => n + 1), RETRY_DELAY_MS)
      }
    }
    socket.onerror = () => setStatus("closed")

    return () => {
      disposed = true
      if (retryTimer !== undefined) clearTimeout(retryTimer)
      socket.onclose = null
      socket.close()
      socketRef.current = null
    }
  }, [room.id, displayName, language, attempt])

  // 设置里改了资料（且没引起重连，例如只改了简介）：尽快广播给同房间的人。
  // join 时带过的档案记在 lastSentProfileRef，避免重复上报。
  const profilePayloadJson = JSON.stringify(profilePayload)
  useEffect(() => {
    if (!myUserId || status !== "open") return
    if (lastSentProfileRef.current === profilePayloadJson) return
    lastSentProfileRef.current = profilePayloadJson
    socketRef.current?.send(
      JSON.stringify({ type: "profile_update", profile: profilePayload } satisfies ClientEvent),
    )
  }, [profilePayloadJson, profilePayload, myUserId, status])

  // 新消息时滚到底部
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight })
  }, [messages])

  // 服务端错误提示 4 秒后自动消失
  useEffect(() => {
    if (!serverError) return
    const timer = setTimeout(() => setServerError(null), 4000)
    return () => clearTimeout(timer)
  }, [serverError])

  function send() {
    const text = draft.trim()
    if (!text || status !== "open" || roomClosed) return
    const event: ClientEvent = { type: "send", roomId: room.id, text, sourceLang: language }
    socketRef.current?.send(JSON.stringify(event))
    setDraft("")
  }

  async function copyInvite() {
    if (await copyText(roomLink(room.slug))) {
      setInviteCopied(true)
      setTimeout(() => setInviteCopied(false), 2000)
    }
  }

  /** 提交举报：等 reported / error 回执或超时，把结果告诉消息行（阶段 10 区分限流）。 */
  function reportMessage(messageId: string, reason: string): Promise<ReportResult> {
    return new Promise((resolve) => {
      const socket = socketRef.current
      if (!socket || status !== "open") {
        resolve("network")
        return
      }
      let settled = false
      const finish = (result: ReportResult) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        socket.removeEventListener("message", onReply)
        resolve(result)
      }
      const onReply = (e: MessageEvent) => {
        try {
          const ev = JSON.parse(String(e.data)) as ServerEvent
          if (ev.type === "reported") finish("ok")
          else if (ev.type === "error" && ev.code === "bad_report") finish("bad")
          else if (ev.type === "error" && ev.code === "report_rate_limited") {
            finish("rate_limited")
          }
        } catch {
          // 忽略坏帧
        }
      }
      const timer = setTimeout(() => finish("network"), 5000)
      socket.addEventListener("message", onReply)
      const event: ClientEvent = { type: "report", messageId, reason }
      socket.send(JSON.stringify(event))
    })
  }

  /** 资料卡数据：优先房内档案缓存；自己退回本地档案。 */
  function memberForCard(userId: string): RoomMemberProfile | null {
    if (userId === myUserId) return members[userId] ?? memberOf(profile, userId)
    return members[userId] ?? null
  }

  /** 背景操作错误码 → 本地化提示（阶段 16）。 */
  function bgErrorText(code: string): string {
    if (code === "forbidden") return t(language, "errBgForbidden")
    if (code === "bg_too_large") return t(language, "errBgTooLarge")
    if (code === "bg_invalid") return t(language, "errBgFormat")
    if (code === "rate_limited") return t(language, "errRateLimited")
    return t(language, "errBgSave")
  }

  /** 房主换主题 / 恢复默认；成功后本地即时跟进（广播也会回一份，幂等）。 */
  async function applyTheme(next: RoomThemeId | undefined) {
    setBgError(null)
    const result = await updateRoomTheme(room.slug, next ?? null, getVisitorId())
    if (result.ok) setBgTheme(next)
    else setBgError(bgErrorText(result.code))
  }

  /** 房主上传自定义背景：先压缩到 ≤300k dataURL，再走鉴权路由。 */
  async function pickBackground(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    // 清掉 value，同一张图删掉重传也能触发 change
    e.target.value = ""
    if (!file) return
    setBgUploading(true)
    setBgError(null)
    const data = await compressBackground(file)
    if (!data) {
      setBgUploading(false)
      setBgError(t(language, "errBgFormat"))
      return
    }
    const result = await uploadRoomBackground(room.slug, data, getVisitorId())
    setBgUploading(false)
    if (result.ok) setBgImage(data)
    else setBgError(bgErrorText(result.code))
  }

  /** 房主删除自定义图片：回落主题（或无背景）。 */
  async function clearBackgroundImage() {
    setBgError(null)
    const result = await uploadRoomBackground(room.slug, null, getVisitorId())
    if (result.ok) setBgImage(null)
    else setBgError(bgErrorText(result.code))
  }

  const roomTitle = roomMeta(language, room.slug, room).title

  // 成功打开房间（大厅进入或直链都会挂载到这里）：记进「最近去过」，
  // 标题用当前语言看到的房间名；换语言重进只是刷新时间，无副作用。
  useEffect(() => {
    recordRecentRoom(room.slug, roomTitle)
  }, [room.slug, roomTitle])
  const cardMember = cardUserId !== null ? memberForCard(cardUserId) : null
  const homeMember = homeUserId !== null ? memberForCard(homeUserId) : null
  const connLabel =
    status === "open"
      ? t(language, "connected")
      : status === "connecting"
        ? t(language, "connecting")
        : t(language, "reconnecting")
  const hasBackground = bgTheme !== undefined || bgImage !== null
  const ThemeSvg = ROOM_THEME_OPTIONS.find((o) => o.id === bgTheme)?.Svg

  return (
    <main className={hasBackground ? "chat has-bg" : "chat"}>
      {hasBackground && (
        <div className={bgImage ? "chat-bg chat-bg--photo" : "chat-bg"} aria-hidden="true">
          {bgImage ? <img src={bgImage} alt="" /> : ThemeSvg ? <ThemeSvg /> : null}
        </div>
      )}
      <header className="chat-header">
        <button className="link" onClick={onLeave}>
          {t(language, "leave")}
        </button>
        <span className="chat-title">
          {roomTitle}
          {occupantCount !== null && (
            <span className="occ-badge">
              {t(language, "occupants", { count: String(occupantCount) })}
            </span>
          )}
        </span>
        <span className="header-right">
          <LanguageSwitcher language={language} onChange={onLanguageChange} />
          {room.isCreator && (
            <button className="toggle invite" onClick={() => setBgPanelOpen(true)}>
              {t(language, "bgChangeBtn")}
            </button>
          )}
          <button className="toggle invite" onClick={onOpenSettings}>
            {t(language, "settingsBtn")}
          </button>
          <button className="toggle invite" onClick={copyInvite}>
            {inviteCopied ? t(language, "inviteCopied") : t(language, "inviteBtn")}
          </button>
          <span className={`conn conn-${status}`}>{connLabel}</span>
        </span>
      </header>

      {roomClosed ? (
        <div className="offline-banner closed-banner" role="alert">
          {t(language, "roomClosedBanner")}
        </div>
      ) : (
        status === "closed" && (
          <div className="offline-banner" role="alert">
            {t(language, "offlineBanner")}
          </div>
        )
      )}

      <div className="messages" ref={listRef}>
        {messages.length === 0 && (
          <p className="empty">
            {status === "open" ? t(language, "emptyRoom") : t(language, "joiningRoom")}
          </p>
        )}
        {!roomClosed && occupantCount !== null && occupantCount <= 1 && (
          <div className="invite-hint">
            <span>{t(language, "inviteHint")}</span>
            <button className="invite-hint-btn" onClick={copyInvite}>
              {inviteCopied ? t(language, "inviteCopied") : t(language, "inviteBtn")}
            </button>
          </div>
        )}
        {messages.map((msg) => (
          <MessageRow
            key={msg.id}
            message={msg}
            mine={msg.senderId === myUserId}
            translation={translations[msg.id]}
            translationFailed={failedTranslations.has(msg.id)}
            myLanguage={language}
            member={members[msg.senderId]}
            aiMessage={room.ai !== undefined && msg.senderId.startsWith(AI_SENDER_PREFIX)}
            onOpenCard={setCardUserId}
            onReport={(reason) => reportMessage(msg.id, reason)}
          />
        ))}
      </div>

      {serverError && (
        <div className="error-toast" role="alert">
          {serverError}
        </div>
      )}

      {/* 房主的背景管理面板（阶段 16）：换主题 / 上传图 / 恢复默认 / 合规提示 */}
      {bgPanelOpen && room.isCreator && (
        <div
          className="overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget) setBgPanelOpen(false)
          }}
        >
          <div className="settings-panel">
            <h2>{t(language, "themeLabel")}</h2>
            <div className="theme-picker" role="radiogroup" aria-label={t(language, "themeLabel")}>
              <button
                type="button"
                className={bgTheme === undefined ? "theme-thumb theme-thumb--active" : "theme-thumb"}
                role="radio"
                aria-checked={bgTheme === undefined}
                onClick={() => applyTheme(undefined)}
              >
                <span className="theme-thumb-none">{t(language, "themeDefault")}</span>
              </button>
              {ROOM_THEME_OPTIONS.map(({ id, labelKey, Svg }) => (
                <button
                  type="button"
                  key={id}
                  className={bgTheme === id ? "theme-thumb theme-thumb--active" : "theme-thumb"}
                  role="radio"
                  aria-checked={bgTheme === id}
                  title={t(language, labelKey)}
                  onClick={() => applyTheme(id)}
                >
                  <Svg />
                </button>
              ))}
            </div>
            <div className="bg-upload-row">
              <label className="bg-upload">
                <input
                  type="file"
                  accept="image/*"
                  disabled={bgUploading}
                  onChange={pickBackground}
                />
                {bgUploading ? t(language, "bgUploading") : t(language, "bgUploadLabel")}
              </label>
              {bgImage !== null && (
                <button type="button" className="link" onClick={clearBackgroundImage}>
                  {t(language, "bgClearBtn")}
                </button>
              )}
            </div>
            <p className="settings-hint">{t(language, "bgUploadNote")}</p>
            {bgError && (
              <p className="settings-error" role="alert">
                {bgError}
              </p>
            )}
            <div className="form-actions">
              <button type="button" className="link" onClick={() => setBgPanelOpen(false)}>
                {t(language, "closeBtn")}
              </button>
            </div>
          </div>
        </div>
      )}

      {cardMember && (
        <ProfileCard
          member={cardMember}
          language={language}
          onClose={() => setCardUserId(null)}
          onOpenHome={(userId) => {
            setCardUserId(null)
            setHomeUserId(userId)
          }}
        />
      )}

      {homeMember && homeUserId !== null && (
        <ProfileHome
          member={homeMember}
          language={language}
          isSelf={homeUserId === myUserId}
          onBack={() => setHomeUserId(null)}
          onEditProfile={() => {
            // 打开已有设置面板前先收起主页，保存后仍在房间里
            setHomeUserId(null)
            onOpenSettings()
          }}
        />
      )}

      <form
        className="composer"
        onSubmit={(e) => {
          e.preventDefault()
          send()
        }}
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={t(language, "inputPlaceholder")}
          maxLength={500}
          disabled={roomClosed}
        />
        <button type="submit" disabled={roomClosed || status !== "open" || !draft.trim()}>
          {t(language, "sendBtn")}
        </button>
      </form>
    </main>
  )
}
