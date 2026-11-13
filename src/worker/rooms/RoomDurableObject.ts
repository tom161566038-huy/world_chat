import type { ClientEvent, ServerEvent } from "../../shared/protocol"
import type { ChatMessage } from "../../shared/types"

interface Session {
  userId: string
  senderName: string
}

/** 每个房间保留的近期消息条数。 */
const MAX_HISTORY = 100

/** 存储键前缀，序号左补零保证字典序即时间序。 */
const MSG_PREFIX = "msg:"

/**
 * 单房间 Durable Object：管理 WebSocket 连接、广播并持久化近期消息。
 * DO 单线程串行处理请求，消息 id 和时间戳都在这里生成，
 * 因此所有客户端收到的广播顺序一致。
 *
 * 存储选型：用 Durable Object 自带的 SQLite 存储（new_sqlite_classes），
 * 不引入 D1。理由：消息天然按房间分区，DO 存储正好一房一份、免额外绑定，
 * 免费层额度足够；以后要做全站消息检索时再考虑 D1。
 */
export class RoomDurableObject implements DurableObject {
  private sessions = new Map<WebSocket, Session>()
  private state: DurableObjectState
  /** 消息序号，惰性从存储恢复，避免 DO 重启后错乱。 */
  private seq: number | null = null

  constructor(state: DurableObjectState, _env: unknown) {
    this.state = state
  }

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
      void this.handleEvent(server, data)
    })

    server.addEventListener("close", () => {
      this.sessions.delete(server)
    })
  }

  private async handleEvent(socket: WebSocket, raw: string): Promise<void> {
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
        // 加入后回放近期消息，刷新页面也能看到历史
        const messages = await this.recentMessages(MAX_HISTORY)
        this.sendTo(socket, { type: "history", messages: messages.map((message) => ({ message })) })
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
        const seq = await this.nextSeq()
        const message: ChatMessage = {
          id: crypto.randomUUID(),
          roomId: event.roomId,
          senderId: session.userId,
          senderName: session.senderName,
          sourceLang: event.sourceLang,
          sourceText: text.slice(0, 500),
          createdAt: Date.now(),
        }
        await this.state.storage.put(this.msgKey(seq), message)
        await this.trimOldMessages()
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

  /** 取下一个消息序号；首次调用时从存储里最大的序号恢复。 */
  private async nextSeq(): Promise<number> {
    if (this.seq === null) {
      const last = await this.state.storage.list<ChatMessage>({
        prefix: MSG_PREFIX,
        reverse: true,
        limit: 1,
      })
      const lastKey = last.keys().next().value
      this.seq = lastKey ? Number(lastKey.slice(MSG_PREFIX.length)) : -1
    }
    this.seq += 1
    return this.seq
  }

  private msgKey(seq: number): string {
    return `${MSG_PREFIX}${String(seq).padStart(16, "0")}`
  }

  /** 最近 limit 条消息，按时间正序返回。 */
  private async recentMessages(limit: number): Promise<ChatMessage[]> {
    const entries = await this.state.storage.list<ChatMessage>({
      prefix: MSG_PREFIX,
      reverse: true,
      limit,
    })
    return [...entries.values()].reverse()
  }

  /** 超出上限的旧消息直接删掉，控制存储体积。 */
  private async trimOldMessages(): Promise<void> {
    const entries = await this.state.storage.list<ChatMessage>({
      prefix: MSG_PREFIX,
      reverse: true,
      limit: MAX_HISTORY + 1,
    })
    const keys = [...entries.keys()]
    if (keys.length <= MAX_HISTORY) return
    await Promise.all(keys.slice(MAX_HISTORY).map((key) => this.state.storage.delete(key)))
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
