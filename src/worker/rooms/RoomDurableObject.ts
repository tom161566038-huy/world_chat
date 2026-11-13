import type { ClientEvent, ServerEvent } from "../../shared/protocol"
import type { ChatMessage } from "../../shared/types"

interface Session {
  userId: string
  senderName: string
}

/**
 * 单房间 Durable Object：管理 WebSocket 连接并广播消息。
 * DO 单线程串行处理请求，消息 id 和时间戳都在这里生成，
 * 因此所有客户端收到的广播顺序一致。
 */
export class RoomDurableObject implements DurableObject {
  private sessions = new Map<WebSocket, Session>()
  private messageSeq = 0

  constructor(_state: DurableObjectState, _env: unknown) {}

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("Expected WebSocket", { status: 426 })
    }

    const pair = new WebSocketPair()
    const [client, server] = Object.values(pair)
    if (!client || !server) throw new Error("WebSocketPair 创建失败")
    this.attach(server)

    return new Response(null, { status: 101, webSocket: client })
  }

  private attach(server: WebSocket): void {
    server.accept()

    server.addEventListener("message", (event) => {
      const data = typeof event.data === "string" ? event.data : ""
      this.handleEvent(server, data)
    })

    server.addEventListener("close", () => {
      this.sessions.delete(server)
    })
  }

  private handleEvent(socket: WebSocket, raw: string): void {
    let event: ClientEvent
    try {
      event = JSON.parse(raw) as ClientEvent
    } catch {
      this.sendTo(socket, { type: "error", code: "bad_json", message: "消息格式错误" })
      return
    }

    switch (event.type) {
      case "join": {
        const session: Session = {
          userId: crypto.randomUUID(),
          senderName: event.displayName.trim().slice(0, 20) || "无名氏",
        }
        this.sessions.set(socket, session)
        this.sendTo(socket, { type: "joined", roomId: event.roomId, userId: session.userId })
        return
      }
      case "send": {
        const session = this.sessions.get(socket)
        if (!session) {
          this.sendTo(socket, { type: "error", code: "not_joined", message: "请先加入房间" })
          return
        }
        const text = event.text.trim()
        if (!text) return
        // 内容长度上限属于阶段 6 的安全项，这里只做防呆的硬上限
        const message: ChatMessage = {
          id: `${Date.now()}-${this.messageSeq++}`,
          roomId: event.roomId,
          senderId: session.userId,
          senderName: session.senderName,
          sourceLang: event.sourceLang,
          sourceText: text.slice(0, 500),
          createdAt: Date.now(),
        }
        this.broadcast({ type: "message", message })
        return
      }
      case "leave": {
        socket.close()
        return
      }
      case "report": {
        // 举报记录属于阶段 6
        this.sendTo(socket, { type: "error", code: "not_implemented", message: "举报功能未开放" })
        return
      }
    }
  }

  private sendTo(socket: WebSocket, event: ServerEvent): void {
    socket.send(JSON.stringify(event))
  }

  private broadcast(event: ServerEvent): void {
    const payload = JSON.stringify(event)
    for (const socket of this.sessions.keys()) {
      try {
        socket.send(payload)
      } catch {
        this.sessions.delete(socket)
      }
    }
  }
}
