import { useEffect, useRef, useState } from "react"
import type { ClientEvent, ServerEvent } from "../shared/protocol"
import type { ChatMessage, LanguageCode, MessageTranslation, Room } from "../shared/types"
import { getVisitorId } from "./api"
import { roomMeta, sameLanguage, serverErrorMessage, t } from "./i18n"
import { roomLink } from "./router"
import { copyText } from "./share"
import { wsUrl } from "./wsUrl"

interface ChatProps {
  room: Room
  displayName: string
  language: LanguageCode
  onLeave: () => void
}

type ConnectionState = "connecting" | "open" | "closed"

/** 断线后自动重连的间隔；重连由 attempt 计数触发 effect 重建。 */
const RETRY_DELAY_MS = 3000

/** 单条消息的举报流程状态：隐藏 → 填理由 → 提交中 → 完成/失败。 */
type ReportUiState = "hidden" | "form" | "sending" | "done" | "failed" | "rate_limited"

/** 举报提交结果：成功 / 被服务端拒绝 / 举报太频繁 / 连接问题或超时。 */
type ReportResult = "ok" | "bad" | "rate_limited" | "network"

/** 单条消息：自己发的永远看原文；别人的消息优先显示成自己语言的译文，可展开原文。 */
function MessageRow({
  message,
  mine,
  translation,
  translationFailed,
  myLanguage,
  onReport,
}: {
  message: ChatMessage
  mine: boolean
  translation?: MessageTranslation
  /** 服务端明确通知过「这条译不出来」，UI 给出说明而不是默默显示原文。 */
  translationFailed: boolean
  myLanguage: LanguageCode
  /** 提交举报，返回结果状态；失败时表单保留已填的理由便于重试。 */
  onReport: (reason: string) => Promise<ReportResult>
}) {
  const [showOriginal, setShowOriginal] = useState(false)
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
      <span className="sender">{message.senderName}</span>
      {translated ? (
        <>
          <p className="bubble">{translation.text}</p>
          <button className="toggle" onClick={() => setShowOriginal((v) => !v)}>
            {showOriginal ? t(myLanguage, "hideOriginal") : t(myLanguage, "showOriginal")}
          </button>
          {showOriginal && <p className="original">{message.sourceText}</p>}
        </>
      ) : (
        <>
          <p className="bubble">{message.sourceText}</p>
          {translationNote()}
          {showOriginal && <p className="original">{message.sourceText}</p>}
        </>
      )}

      {!mine && (
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

export default function Chat({ room, displayName, language, onLeave }: ChatProps) {
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

  useEffect(() => {
    let disposed = false
    let retryTimer: number | undefined
    const socket = new WebSocket(wsUrl(room.id))
    socketRef.current = socket

    socket.onopen = () => {
      setStatus("open")
      // visitorId：浏览器本地持久，让服务端的发送/举报限流窗口跨连接生效
      const join: ClientEvent = {
        type: "join",
        roomId: room.id,
        displayName,
        language,
        visitorId: getVisitorId(),
      }
      socket.send(JSON.stringify(join))
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
      } else if (event.type === "history") {
        // 加入时服务端回放的近期消息，刷新页面也能接上；已缓存的译文一并带回
        setMessages(event.messages.map((item) => item.message))
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
        setMessages((prev) => [...prev, event.message])
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

  const roomTitle = roomMeta(language, room.slug, room).title
  const connLabel =
    status === "open"
      ? t(language, "connected")
      : status === "connecting"
        ? t(language, "connecting")
        : t(language, "reconnecting")

  return (
    <main className="chat">
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
            <button className="toggle" onClick={copyInvite}>
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
            onReport={(reason) => reportMessage(msg.id, reason)}
          />
        ))}
      </div>

      {serverError && (
        <div className="error-toast" role="alert">
          {serverError}
        </div>
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
