import type { ClientEvent, ServerEvent } from "../../shared/protocol"
import type { ChatMessage, LanguageCode, MessageTranslation } from "../../shared/types"
import { findSpam } from "./moderation"
import {
  createTranslateProvider,
  sameLanguage,
  type TranslateEnv,
} from "../translate/provider"
import type { TranslateProvider } from "../translate/types"

interface Session {
  userId: string
  senderName: string
  /** 界面语言，译文按它定向投递。 */
  language: LanguageCode
  /** 最近成功发送的时间戳（滑动窗口），用于发送频率限制。 */
  sentAt: number[]
}

/** 每个房间保留的近期消息条数。 */
const MAX_HISTORY = 100

/** 加入房间时异步补译的历史消息条数上限，避免一次性打爆翻译接口。 */
const MAX_BACKFILL = 20

/**
 * 发送频率限制（阶段 6）：每个用户滑动窗口 RATE_WINDOW_MS（10 秒）内
 * 最多成功发送 RATE_MAX（5）条，折合平均 0.5 条/秒，允许短促连发。
 * 正常聊天远低于这个频率；被拒绝的消息不入库、不广播、不翻译，
 * 只回一个 error 事件，所以刷屏耗不了房间和翻译接口的资源。
 * 窗口放在内存里：DO 重启会清零，可接受（重启罕见，且只是多放行 5 条）。
 */
const RATE_MAX = 5
const RATE_WINDOW_MS = 10_000

/** 消息长度上限，与前端输入框 maxLength 一致；超过直接拒绝而不是悄悄截断。 */
const MAX_TEXT_LENGTH = 500

/** 举报理由长度上限。 */
const MAX_REASON_LENGTH = 200

/** 每个房间保留的举报记录条数上限，防止存储被无限制写爆。 */
const MAX_REPORTS = 500

/** 举报存储键前缀：`report:{时间戳左补零}:{记录id}`，字典序即时间序。 */
const REPORT_PREFIX = "report:"

/** 举报记录。管理员侧查看方式见 saveReport 的注释。 */
export interface ReportRecord {
  id: string
  /** 房间号（DO 以房间号命名，冗余存一份便于脱离 DO 上下文排查）。 */
  roomId: string
  /** 被举报的消息 id（举报用户时为空）。 */
  messageId?: string
  /** 被举报的用户 id（举报消息时如有则带上）。 */
  reportedUserId?: string
  /** 举报理由，已限长。 */
  reason: string
  /** 举报人信息，供管理员跟进。 */
  reporterId: string
  reporterName: string
  createdAt: number
}

/** 存储键前缀，序号左补零保证字典序即时间序。 */
const MSG_PREFIX = "msg:"

/** 翻译缓存键前缀：`tr:{messageId}:{targetLang}`，同一组合只调用一次接口。 */
const TR_PREFIX = "tr:"

/**
 * 单房间 Durable Object：管理 WebSocket 连接、广播并持久化近期消息。
 * DO 单线程串行处理请求，消息 id 和时间戳都在这里生成，
 * 因此所有客户端收到的广播顺序一致。
 *
 * 存储选型：用 Durable Object 自带的 SQLite 存储（new_sqlite_classes），
 * 不引入 D1。理由：消息天然按房间分区，DO 存储正好一房一份、免额外绑定，
 * 免费层额度足够；阶段 4 的翻译缓存也顺带放这里（按消息 + 目标语言），
 * 以后要做全站消息检索时再考虑 D1。
 *
 * 翻译不在广播热路径里：先立刻广播原文，fetch 翻译接口是纯 I/O，
 * 异步完成后只把译文发给需要该语言的连接。
 */
export class RoomDurableObject implements DurableObject {
  private sessions = new Map<WebSocket, Session>()
  private state: DurableObjectState
  private provider: TranslateProvider
  /** 消息序号，惰性从存储恢复，避免 DO 重启后错乱。 */
  private seq: number | null = null
  /** 进行中的翻译请求去重：同一消息同一目标语言并发时只发一次接口调用。 */
  private inflight = new Map<string, Promise<MessageTranslation | null>>()

  constructor(state: DurableObjectState, env: TranslateEnv) {
    this.state = state
    this.provider = createTranslateProvider(env)
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
      // waitUntil：生产运行时在消息事件返回后可能取消未受保护的 Promise，
      // 本地 wrangler dev 不会取消，所以这类问题只能在复现（阶段 7 线上修复）。
      this.state.waitUntil(this.handleEvent(server, data))
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
          language: event.language,
          sentAt: [],
        }
        this.sessions.set(socket, session)
        this.sendTo(socket, { type: "joined", roomId: event.roomId, userId: session.userId })
        // 加入后回放近期消息，已缓存的译文直接带上；刷新页面也能看到历史
        const messages = await this.recentMessages(MAX_HISTORY)
        const items = await Promise.all(
          messages.map(async (message) => ({
            message,
            translation: await this.cachedTranslation(message.id, session.language),
          })),
        )
        this.sendTo(socket, { type: "history", messages: items })
        // 历史里缺译文的不阻塞加入，异步补齐后单独推送（同语言的消息本来就不用翻）
        this.state.waitUntil(this.backfillHistory(socket, items, session.language))
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

        // 阶段 6：长度限制（原长度先看，超长直接拒绝，不悄悄截断）
        if (event.text.length > MAX_TEXT_LENGTH) {
          this.sendTo(socket, {
            type: "error",
            code: "too_long",
            message: `消息超过 ${MAX_TEXT_LENGTH} 字，请删减后再发`,
          })
          return
        }

        // 阶段 6：基础文本过滤（重复刷屏 / 链接轰炸 / 垃圾关键词）
        const spamReason = findSpam(text)
        if (spamReason) {
          this.sendTo(socket, { type: "error", code: "filtered", message: spamReason })
          return
        }

        // 阶段 6：发送频率限制，超频拒绝（不入库、不广播）
        const now = Date.now()
        session.sentAt = session.sentAt.filter((t) => now - t < RATE_WINDOW_MS)
        if (session.sentAt.length >= RATE_MAX) {
          this.sendTo(socket, {
            type: "error",
            code: "rate_limited",
            message: "发得太快啦，歇一歇再发",
          })
          return
        }
        session.sentAt.push(now)

        const seq = await this.nextSeq()
        const message: ChatMessage = {
          id: crypto.randomUUID(),
          roomId: event.roomId,
          senderId: session.userId,
          senderName: session.senderName,
          sourceLang: event.sourceLang,
          sourceText: text,
          createdAt: Date.now(),
        }
        await this.state.storage.put(this.msgKey(seq), message)
        await this.trimOldMessages()
        // 热路径：先广播原文；译文异步算好后只发给需要的人
        this.broadcast({ type: "message", message })
        this.state.waitUntil(this.fanOutTranslations(message))
        return
      }
      case "leave": {
        socket.close()
        return
      }
      case "report": {
        // 阶段 6：举报真正落盘。未加入房间不允许举报。
        const session = this.sessions.get(socket)
        if (!session) {
          this.sendTo(socket, { type: "error", code: "not_joined", message: "请先加入房间" })
          return
        }
        const messageId = event.messageId?.trim() || undefined
        const reportedUserId = event.userId?.trim() || undefined
        if (!messageId && !reportedUserId) {
          this.sendTo(socket, {
            type: "error",
            code: "bad_report",
            message: "要举报的消息或用户不能都为空",
          })
          return
        }
        const record: ReportRecord = {
          id: crypto.randomUUID(),
          roomId: this.state.id.name ?? this.state.id.toString(),
          messageId,
          reportedUserId,
          reason: event.reason.trim().slice(0, MAX_REASON_LENGTH),
          reporterId: session.userId,
          reporterName: session.senderName,
          createdAt: Date.now(),
        }
        await this.saveReport(record)
        this.sendTo(socket, { type: "reported", ok: true })
        return
      }
    }
  }

  /** 把消息翻译成房间里每种「与原语言不同」的界面语言，并定向投递译文。 */
  private async fanOutTranslations(message: ChatMessage): Promise<void> {
    const targetLangs = new Set<LanguageCode>()
    for (const session of this.sessions.values()) {
      if (!sameLanguage(session.language, message.sourceLang)) {
        targetLangs.add(session.language.toLowerCase())
      }
    }
    await Promise.all(
      [...targetLangs].map(async (targetLang) => {
        const translation = await this.getTranslation(message, targetLang)
        if (translation) {
          this.sendToLang(targetLang, { type: "translation", translation })
        } else {
          // 阶段 8：整条链失败时明说，前端显示「翻译暂时不可用」而不是只剩原文
          this.sendToLang(targetLang, {
            type: "translation_failed",
            messageId: message.id,
            targetLang,
          })
        }
      }),
    )
  }

  /** 给历史消息补译文：只补最近 MAX_BACKFILL 条，串行避免突发大量接口调用。 */
  private async backfillHistory(
    socket: WebSocket,
    items: Array<{ message: ChatMessage; translation?: MessageTranslation }>,
    targetLang: LanguageCode,
  ): Promise<void> {
    const lang = targetLang.toLowerCase()
    const missing = items
      .filter((item) => !item.translation && !sameLanguage(item.message.sourceLang, lang))
      .slice(-MAX_BACKFILL)
    for (const { message } of missing) {
      const translation = await this.getTranslation(message, lang)
      try {
        if (translation) {
          this.sendTo(socket, { type: "translation", translation })
        } else {
          this.sendTo(socket, {
            type: "translation_failed",
            messageId: message.id,
            targetLang: lang,
          })
        }
      } catch {
        return // 连接已断开，停止补译
      }
    }
  }

  /**
   * 取某条消息某目标语言的译文：缓存命中直接返回；
   * 并发请求同一组合时共享同一个接口调用；失败返回 null（下次可重试）。
   */
  private async getTranslation(
    message: ChatMessage,
    targetLang: LanguageCode,
  ): Promise<MessageTranslation | null> {
    const lang = targetLang.toLowerCase()
    const key = this.trKey(message.id, lang)
    const pending = this.inflight.get(key)
    if (pending) return pending

    const task = this.fetchTranslation(message, lang, key)
    this.inflight.set(key, task)
    try {
      return await task
    } finally {
      this.inflight.delete(key)
    }
  }

  private async fetchTranslation(
    message: ChatMessage,
    targetLang: LanguageCode,
    key: string,
  ): Promise<MessageTranslation | null> {
    const cached = await this.state.storage.get<MessageTranslation>(key)
    if (cached) return cached

    console.log(`[translate] 缓存未命中，调用接口: ${message.id} -> ${targetLang}`)
    try {
      const result = await this.provider.translate({
        text: message.sourceText,
        sourceLang: message.sourceLang,
        targetLang,
      })
      const translation: MessageTranslation = {
        messageId: message.id,
        targetLang,
        text: result.text,
        provider: result.provider,
        createdAt: Date.now(),
      }
      await this.state.storage.put(key, translation)
      return translation
    } catch (error) {
      // 日志不携带消息原文，避免记录超出排查所需的用户内容
      console.error(`[translate] 翻译失败: ${message.id} -> ${targetLang}`, error)
      return null
    }
  }

  private async cachedTranslation(
    messageId: string,
    targetLang: LanguageCode,
  ): Promise<MessageTranslation | undefined> {
    return this.state.storage.get<MessageTranslation>(
      this.trKey(messageId, targetLang.toLowerCase()),
    )
  }

  private trKey(messageId: string, targetLang: string): string {
    return `${TR_PREFIX}${messageId}:${targetLang}`
  }

  /**
   * 举报落盘，键为 `report:{时间戳左补零}:{记录id}`，按前缀 list 即按时间序读出。
   *
   * 怎么查（阶段 6 先不做管理界面）：
   * - 本地：wrangler dev 的 DO 数据在 .wrangler/state/ 下的 sqlite 文件里，
   *   打开对应库按 report: 前缀查 storage 表；
   * - 以后要做管理端时，给这个 DO 加一个仅管理员可调的 HTTP 路由，
   *   内部 storage.list({ prefix: "report:" }) 返回即可。
   * 超出 MAX_REPORTS 的旧记录滚动删除，控制存储体积。
   */
  private async saveReport(record: ReportRecord): Promise<void> {
    const key = `${REPORT_PREFIX}${String(record.createdAt).padStart(16, "0")}:${record.id}`
    await this.state.storage.put(key, record)
    await this.trimReports()
  }

  private async trimReports(): Promise<void> {
    const entries = await this.state.storage.list<ReportRecord>({
      prefix: REPORT_PREFIX,
      reverse: true,
      limit: MAX_REPORTS + 1,
    })
    const keys = [...entries.keys()]
    if (keys.length <= MAX_REPORTS) return
    await Promise.all(keys.slice(MAX_REPORTS).map((key) => this.state.storage.delete(key)))
  }

  /** 只把译文/翻译失败信号发给界面语言匹配的连接。 */
  private sendToLang(targetLang: string, event: ServerEvent): void {
    const payload = JSON.stringify(event)
    for (const [socket, session] of this.sessions) {
      if (session.language.toLowerCase() !== targetLang) continue
      try {
        socket.send(payload)
      } catch {
        this.sessions.delete(socket)
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

  /** 超出上限的旧消息直接删掉，连同它的翻译缓存，控制存储体积。 */
  private async trimOldMessages(): Promise<void> {
    const entries = await this.state.storage.list<ChatMessage>({
      prefix: MSG_PREFIX,
      reverse: true,
      limit: MAX_HISTORY + 1,
    })
    const keys = [...entries.keys()]
    if (keys.length <= MAX_HISTORY) return
    await Promise.all(
      keys.slice(MAX_HISTORY).map(async (key) => {
        const message = entries.get(key)
        await this.state.storage.delete(key)
        if (message) {
          const translations = await this.state.storage.list<MessageTranslation>({
            prefix: `${TR_PREFIX}${message.id}:`,
          })
          await Promise.all([...translations.keys()].map((k) => this.state.storage.delete(k)))
        }
      }),
    )
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
