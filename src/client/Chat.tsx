import { useEffect, useRef, useState } from "react"
import type { ClientEvent, ServerEvent } from "../shared/protocol"
import type { ChatMessage, LanguageCode } from "../shared/types"
import { wsUrl } from "./wsUrl"

interface ChatProps {
  roomId: string
  displayName: string
  language: LanguageCode
  onLeave: () => void
}

type ConnectionState = "connecting" | "open" | "closed"

export default function Chat({ roomId, displayName, language, onLeave }: ChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [draft, setDraft] = useState("")
  const [status, setStatus] = useState<ConnectionState>("connecting")
  const [myUserId, setMyUserId] = useState<string | null>(null)
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
        // 加入时服务端回放的近期消息，刷新页面也能接上
        setMessages(event.messages.map((item) => item.message))
      } else if (event.type === "message") {
        setMessages((prev) => [...prev, event.message])
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

  function send() {
    const text = draft.trim()
    if (!text || status !== "open") return
    const event: ClientEvent = { type: "send", roomId, text, sourceLang: language }
    socketRef.current?.send(JSON.stringify(event))
    setDraft("")
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

      <div className="messages" ref={listRef}>
        {messages.length === 0 && <p className="empty">还没有消息，打个招呼吧~</p>}
        {messages.map((msg) => (
          <div key={msg.id} className={msg.senderId === myUserId ? "mine" : "others"}>
            <span className="sender">{msg.senderName}</span>
            <p className="bubble">{msg.sourceText}</p>
          </div>
        ))}
      </div>

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
