import { useEffect, useRef, useState } from "react"
import type { ClientEvent, ServerEvent } from "../shared/protocol"
import type { ChatMessage, LanguageCode, MessageTranslation } from "../shared/types"
import { wsUrl } from "./wsUrl"

interface ChatProps {
  roomId: string
  displayName: string
  language: LanguageCode
  onLeave: () => void
}

type ConnectionState = "connecting" | "open" | "closed"

/** 单条消息的举报流程状态：隐藏 → 填理由 → 提交中 → 完成/失败。 */
type ReportUiState = "hidden" | "form" | "sending" | "done" | "failed"

/** 单条消息：自己发的永远看原文；别人的消息优先显示成自己语言的译文，可展开原文。 */
function MessageRow({
  message,
  mine,
  translation,
  myLanguage,
  onReport,
}: {
  message: ChatMessage
  mine: boolean
  translation?: MessageTranslation
  myLanguage: LanguageCode
  /** 提交举报，resolve true 表示服务端已记录。 */
  onReport: (reason: string) => Promise<boolean>
}) {
  const [showOriginal, setShowOriginal] = useState(false)
  const [reportUi, setReportUi] = useState<ReportUiState>("hidden")
  const [reason, setReason] = useState("")
  const translated =
    !mine &&
    translation !== undefined &&
    translation.targetLang === myLanguage &&
    translation.text !== message.sourceText

  async function submitReport() {
    setReportUi("sending")
    const ok = await onReport(reason)
    setReportUi(ok ? "done" : "failed")
  }

  return (
    <div className={mine ? "mine" : "others"}>
      <span className="sender">{message.senderName}</span>
      {translated ? (
        <>
          <p className="bubble">{translation.text}</p>
          <button className="toggle" onClick={() => setShowOriginal((v) => !v)}>
            {showOriginal ? "收起原文" : "查看原文"}
          </button>
          {showOriginal && <p className="original">{message.sourceText}</p>}
        </>
      ) : (
        <p className="bubble">{message.sourceText}</p>
      )}

      {!mine && (
        <span className="report-area">
          {reportUi === "hidden" && (
            <button className="toggle" onClick={() => setReportUi("form")}>
              举报
            </button>
          )}
          {(reportUi === "form" || reportUi === "sending") && (
            <>
              <input
                className="report-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="举报理由（选填）"
                maxLength={200}
                disabled={reportUi === "sending"}
              />
              <button className="toggle" disabled={reportUi === "sending"} onClick={submitReport}>
                {reportUi === "sending" ? "提交中…" : "提交"}
              </button>
              <button
                className="toggle"
                disabled={reportUi === "sending"}
                onClick={() => setReportUi("hidden")}
              >
                取消
              </button>
            </>
          )}
          {reportUi === "done" && <span className="report-done">已收到举报，感谢反馈</span>}
          {reportUi === "failed" && <span className="report-failed">提交失败，请稍后重试</span>}
        </span>
      )}
    </div>
  )
}

export default function Chat({ roomId, displayName, language, onLeave }: ChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  /** messageId -> 译文，原文广播后服务端会异步推送过来。 */
  const [translations, setTranslations] = useState<Record<string, MessageTranslation>>({})
  const [draft, setDraft] = useState("")
  const [status, setStatus] = useState<ConnectionState>("connecting")
  const [myUserId, setMyUserId] = useState<string | null>(null)
  /** 服务端 error 事件的提示（限频/超长/被过滤等），短暂展示后自动消失。 */
  const [serverError, setServerError] = useState<string | null>(null)
  const socketRef = useRef<WebSocket | null>(null)
  const listRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const socket = new WebSocket(wsUrl(roomId))
    socketRef.current = socket

    socket.onopen = () => {
      setStatus("open")
      const join: ClientEvent = { type: "join", roomId, displayName, language }
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
            for (const t of cached) next[t.messageId] = t
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
      } else if (event.type === "error") {
        setServerError(event.message)
      }
    }

    socket.onclose = () => setStatus("closed")
    socket.onerror = () => setStatus("closed")

    return () => {
      socket.close()
      socketRef.current = null
    }
  }, [roomId, displayName, language])

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
    if (!text || status !== "open") return
    const event: ClientEvent = { type: "send", roomId, text, sourceLang: language }
    socketRef.current?.send(JSON.stringify(event))
    setDraft("")
  }

  /** 提交举报：等 reported / error 回执或超时，告诉消息行成功与否。 */
  function reportMessage(messageId: string, reason: string): Promise<boolean> {
    return new Promise((resolve) => {
      const socket = socketRef.current
      if (!socket || status !== "open") {
        resolve(false)
        return
      }
      let settled = false
      const finish = (ok: boolean) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        socket.removeEventListener("message", onReply)
        resolve(ok)
      }
      const onReply = (e: MessageEvent) => {
        try {
          const ev = JSON.parse(String(e.data)) as ServerEvent
          if (ev.type === "reported") finish(true)
          else if (ev.type === "error" && ev.code === "bad_report") finish(false)
        } catch {
          // 忽略坏帧
        }
      }
      const timer = setTimeout(() => finish(false), 5000)
      socket.addEventListener("message", onReply)
      const event: ClientEvent = { type: "report", messageId, reason }
      socket.send(JSON.stringify(event))
    })
  }

  return (
    <main className="chat">
      <header className="chat-header">
        <button className="link" onClick={onLeave}>
          ← 离开
        </button>
        <span className={`conn conn-${status}`}>
          {status === "open" ? "已连接" : status === "connecting" ? "连接中…" : "已断开"}
        </span>
      </header>

      {status === "closed" && (
        <div className="offline-banner" role="alert">
          网络断开，消息暂时发不出去；恢复网络后请刷新或重新进入房间。
        </div>
      )}

      <div className="messages" ref={listRef}>
        {messages.length === 0 && <p className="empty">还没有消息，打个招呼吧~</p>}
        {messages.map((msg) => (
          <MessageRow
            key={msg.id}
            message={msg}
            mine={msg.senderId === myUserId}
            translation={translations[msg.id]}
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
          placeholder="输入消息…"
          maxLength={500}
        />
        <button type="submit" disabled={status !== "open" || !draft.trim()}>
          发送
        </button>
      </form>
    </main>
  )
}
