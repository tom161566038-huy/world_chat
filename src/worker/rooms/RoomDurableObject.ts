import type { ClientEvent, ProfilePayload, ServerEvent } from "../../shared/protocol"
import { AI_ROOM_AI, AI_SENDER_PREFIX } from "../../shared/rooms"
import type { OccupancyUpdate } from "../../shared/roomDirectory"
import type {
  ChatMessage,
  LanguageCode,
  MessageTranslation,
  RoomMemberProfile,
} from "../../shared/types"
import { findSpam } from "./moderation"
import {
  createTranslateProvider,
  extractChatText,
  normalizeChatText,
  sameLanguage,
  type TranslateEnv,
} from "../translate/provider"
import type { TranslateProvider } from "../translate/types"

/** Room DO 的绑定：翻译环境变量 + 房间目录（在房人数上报，阶段 9）。 */
export interface RoomEnv extends TranslateEnv {
  ROOM_DIRECTORY: DurableObjectNamespace
}

interface Session {
  userId: string
  senderName: string
  /** 界面语言，译文按它定向投递。 */
  language: LanguageCode
  /**
   * 限流键（阶段 10）：与 userId 一致——稳定身份下 visitorId 即 userId，
   * 临时身份下是本连接的随机 id，限流窗口仍跨连接（重连、刷新）生效。
   */
  rateKey: string
  /**
   * 成员档案（游客身份阶段）：头像/国旗/资料卡数据源，随 join 与
   * profile_update 更新；清洗后的紧凑副本，不含任何 IP 信息。
   */
  profile?: RoomMemberProfile
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
 * 阶段 10：窗口从 DO 内存挪到持久存储（键 `sendrate:{rateKey}`），
 * 重连、刷新、DO 重启都不会清零；只保留窗口内的时间戳，过期即删。
 */
const RATE_MAX = 5
const RATE_WINDOW_MS = 10_000

/**
 * 举报频率限制（阶段 10）：每个用户每房间 REPORT_RATE_WINDOW_MS（60 秒）
 * 内最多 REPORT_RATE_MAX（3）次，防止失败重试或恶意刷举报把存储写满。
 */
const REPORT_RATE_MAX = 3
const REPORT_RATE_WINDOW_MS = 60_000

/** 发送限流窗口存储键前缀：值为窗口内的时间戳数组。 */
const SEND_RATE_PREFIX = "sendrate:"

/** 举报限流窗口存储键前缀。 */
const REPORT_RATE_PREFIX = "reportrate:"

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

/**
 * 稳定访客 id 的合法格式（阶段 11）：标准 UUID（crypto.randomUUID 生成）。
 * 过长或任意字符串不接受，避免把脏数据写进消息归属。
 */
const VISITOR_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** 翻译缓存键前缀：`tr:{messageId}:{targetLang}`，同一组合只调用一次接口。 */
const TR_PREFIX = "tr:"

/** 消息 + 它的房间内序号（阶段 11 补拉游标用）。 */
interface MessageWithSeq {
  message: ChatMessage
  seq: number
}

/**
 * 成员档案存储（游客身份阶段）：键 `profile:{userId}`，值带 updatedAt
 * 供滚动清理排序。头像 dataURL 上限约 100KB（base64 后 14 万字符），
 * 与客户端压缩目标一致，防止免费层存储被灌爆。
 */
const PROFILE_PREFIX = "profile:"
const MAX_PROFILES = 100
const MAX_AVATAR_CHARS = 140_000

interface StoredProfile extends RoomMemberProfile {
  updatedAt: number
}

/** 档案字段的合理长度上限（显示名单独走现有的 20 字规则）。 */
const MAX_PROFILE_FIELD = {
  gender: 16,
  job: 40,
  hobbies: 80,
  bio: 200,
} as const

/** 服务端清洗 join / profile_update 带来的档案：长度、格式、取值全不信任客户端。 */
function sanitizeProfile(
  payload: ProfilePayload | undefined,
  userId: string,
): RoomMemberProfile {
  const displayName = (payload?.displayName ?? "").trim().slice(0, 20)
  const profile: RoomMemberProfile = {
    userId,
    displayName: displayName || "无名氏",
  }
  const cc = (payload?.countryCode ?? "").trim().toUpperCase()
  if (/^[A-Z]{2}$/.test(cc) && cc !== "XX" && cc !== "T1") profile.countryCode = cc
  const avatar = payload?.avatar ?? ""
  if (
    (avatar.startsWith("data:image/") || /^#[0-9a-f]{6}$/i.test(avatar)) &&
    avatar.length <= MAX_AVATAR_CHARS
  ) {
    profile.avatar = avatar
  }
  const gender = (payload?.gender ?? "").trim().toLowerCase()
  if (gender === "male" || gender === "female" || gender === "other" || gender === "private") {
    profile.gender = gender
  }
  const age = payload?.age
  if (typeof age === "number" && Number.isInteger(age) && age >= 13 && age <= 120) {
    profile.age = age
  }
  for (const key of ["job", "hobbies", "bio"] as const) {
    const value = (payload?.[key] ?? "")
      .trim()
      .replace(/<[^>]*>/g, "")
      .replace(/[<>]/g, "")
      .slice(0, MAX_PROFILE_FIELD[key])
    if (value) profile[key] = value
  }
  return profile
}

/** 自建房间元数据键：{ closesAt }。内置房间不写这个键、不设 Alarm。 */
const META_KEY = "room:meta"

/** 每房间 AI 回复节流窗口：窗口内最多 1 条（键 `airate:`，复用 loadWindow）。 */
const AI_RATE_WINDOW_MS = 15_000
const AI_RATE_PREFIX = "airate:"

/** 拼进 AI 上下文的近期消息条数。 */
const AI_MAX_HISTORY = 10

/** AI.run 竞速超时：AI binding 不吃 AbortSignal，沿用 provider 的竞速模式。 */
const AI_TIMEOUT_MS = 20_000
const AI_MAX_TOKENS = 400
const AI_TEMPERATURE = 0.8

/** 每房间每 UTC 日 AI 回复条数上限（键 `aiday:{date}:{slug}`），防 Neurons 额度打爆。 */
const AI_DAILY_MAX = 200
const AI_DAY_PREFIX = "aiday:"

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
  private env: RoomEnv
  private provider: TranslateProvider
  /** 消息序号，惰性从存储恢复，避免 DO 重启后错乱。 */
  private seq: number | null = null
  /** 进行中的翻译请求去重：同一消息同一目标语言并发时只发一次接口调用。 */
  private inflight = new Map<string, Promise<MessageTranslation | null>>()
  /** 自建房间关闭时间（毫秒）；内置房间为 null。惰性从存储恢复。 */
  private closesAt: number | null = null
  private metaLoaded = false
  /** 到点关闭后置 true：拒绝 join/send，广播 room_closed。 */
  private closed = false

  constructor(state: DurableObjectState, env: RoomEnv) {
    this.state = state
    this.env = env
    // 阶段 12：每个 provider 的成功/失败在这里记账上报目录（主链条行为不变）
    this.provider = createTranslateProvider(env, (provider, ok, reason) =>
      this.recordTranslateResult(provider, ok, reason),
    )
  }

  async fetch(request: Request): Promise<Response> {
    // 元数据恢复放在 Upgrade 检查之前：Alarm 依赖它尽早设上
    //（Worker 每次转发 /ws 都会带上 closesAt，非 WebSocket 请求也幂等无害）
    await this.ensureRoomMeta(new URL(request.url))
    if (request.headers.get("Upgrade") !== "websocket") {
      // 阶段 10：只读举报导出，仅由 Worker 的管理入口（带密钥校验）转发过来
      if (new URL(request.url).pathname === "/reports" && request.method === "GET") {
        const entries = await this.state.storage.list<ReportRecord>({ prefix: REPORT_PREFIX })
        const reports = [...entries.values()]
        return Response.json({ room: this.state.id.name ?? this.state.id.toString(), reports })
      }
      return new Response("Expected WebSocket", { status: 426 })
    }

    const pair = new WebSocketPair()
    const [client, server] = Object.values(pair)
    if (!client || !server) throw new Error("WebSocketPair 创建失败")
    this.attach(server)

    return new Response(null, { status: 101, webSocket: client })
  }

  /** Alarm 到点：广播关闭事件、断开所有连接、人数清零上报。 */
  async alarm(): Promise<void> {
    if (!this.metaLoaded) await this.ensureRoomMeta(null)
    // 只看有没有关闭时间：ensureRoomMeta 在到点后也会把 closed 置真，
    // 但那不代表「已经广播过关闭」，这里仍要广播并断开连接
    if (this.closesAt === null) return
    this.closed = true
    this.broadcast({ type: "room_closed" })
    for (const socket of this.sessions.keys()) {
      try {
        socket.close(1000, "room closed")
      } catch {
        this.sessions.delete(socket)
      }
    }
    this.sessions.clear()
    this.notifyOccupancy()
    // 关闭即销毁内容（2026-11-26 拍板）：自建房间到期关闭时清空消息、
    // 译文、举报、成员档案与限流窗口，只留 room:meta 让 DO 重启后仍能
    // 认出「已关闭」。内置房间没有 closesAt，不会走到这里。
    await this.wipeRoomContent()
  }

  /** 清空本房全部存储键，仅保留 META_KEY（关闭态自识别）。分批删，遵守单次键数上限。 */
  private async wipeRoomContent(): Promise<void> {
    const keys = [...(await this.state.storage.list()).keys()].filter(
      (key) => key !== META_KEY,
    )
    for (let i = 0; i < keys.length; i += 128) {
      await this.state.storage.delete(keys.slice(i, i + 128))
    }
  }

  /**
   * 首次连接时恢复/写入房间元数据。Worker 转发自建房间的 /ws 时会带上
   * closesAt 参数；存进存储后 DO 重启也能重新设上 Alarm（Alarm 本身持久，
   * 这里幂等重设一次作保险）。已过关闭时间则直接进入关闭态。
   */
  private async ensureRoomMeta(url: URL | null): Promise<void> {
    if (this.metaLoaded) return
    this.metaLoaded = true
    const param = url ? Number(url.searchParams.get("closesAt") ?? "") : Number.NaN
    if (Number.isFinite(param) && param > 0) {
      await this.state.storage.put(META_KEY, { closesAt: param })
    }
    this.closesAt = (await this.state.storage.get<{ closesAt: number }>(META_KEY))?.closesAt ?? null
    if (this.closesAt !== null) {
      if (Date.now() >= this.closesAt) {
        this.closed = true
        // 已过关闭时间（例如 DO 休眠期间到点、Alarm 已消费过）：确保内容已销毁
        await this.wipeRoomContent()
      } else {
        await this.state.storage.setAlarm(this.closesAt)
      }
    }
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
      const wasSession = this.sessions.delete(server)
      if (wasSession) {
        // 在房人数变化：通知房内剩余连接并上报目录
        this.broadcastPresence()
        this.notifyOccupancy()
      }
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
        if (this.closed) {
          this.sendTo(socket, { type: "error", code: "room_closed", message: "房间已关闭" })
          socket.close()
          return
        }
        // 阶段 11：稳定访客身份。visitorId 校验合法即作为 userId——
        // 消息归属、presence、限流键统一，刷新/换标签页/短暂断线后仍是同一个人；
        // 非法或缺省时退回本连接临时随机 id（旧行为）。
        const visitorId = event.visitorId?.trim() ?? ""
        const userId = VISITOR_ID_PATTERN.test(visitorId) ? visitorId : crypto.randomUUID()
        // 游客身份阶段：join 可带档案（头像/国旗/资料），清洗后落一份到
        // 房间存储并广播；旧客户端不带也能加入（退回纯 senderName 行为）。
        const profile = event.profile ? sanitizeProfile(event.profile, userId) : undefined
        const session: Session = {
          userId,
          senderName: profile?.displayName ?? (event.displayName.trim().slice(0, 20) || "无名氏"),
          language: event.language,
          rateKey: userId,
          profile,
        }
        this.sessions.set(socket, session)
        this.sendTo(socket, { type: "joined", roomId: event.roomId, userId: session.userId })
        // 加入后回放消息：带 lastSeq 游标 = 重连补拉断线期间错过的；
        // 不带 = 初次进入，回放最近 N 条历史。已缓存的译文一并带上。
        const lastSeq = Number.isFinite(event.lastSeq) ? event.lastSeq : undefined
        const messages =
          lastSeq !== undefined && lastSeq >= 0
            ? await this.messagesAfter(lastSeq, MAX_HISTORY)
            : await this.recentMessages(MAX_HISTORY)
        const items = await Promise.all(
          messages.map(async ({ message, seq }) => ({
            message,
            seq,
            translation: await this.cachedTranslation(message.id, session.language),
          })),
        )
        this.sendTo(socket, { type: "history", messages: items })
        // 档案批量回放：历史消息的发送者 + 当前在房的人，只发给这条连接，
        // 供历史消息显示头像/国旗与资料卡；查不到档案的发送者就没有（不阻塞）。
        await this.sendMemberProfiles(
          socket,
          new Set([...messages.map(({ message }) => message.senderId), ...[...this.sessions.values()].map((s) => s.userId)]),
        )
        // 历史里缺译文的不阻塞加入，异步补齐后单独推送（同语言的消息本来就不用翻）
        this.state.waitUntil(this.backfillHistory(socket, items, session.language))
        if (profile) {
          await this.saveProfile(profile)
          this.broadcast({ type: "member_profile", member: profile })
        }
        // 在房人数变化：广播 presence 并上报目录（阶段 9）
        this.broadcastPresence()
        this.notifyOccupancy()
        return
      }
      case "send": {
        const session = this.sessions.get(socket)
        if (!session) {
          this.sendTo(socket, { type: "error", code: "not_joined", message: "请先加入房间" })
          return
        }
        if (this.closed) {
          this.sendTo(socket, { type: "error", code: "room_closed", message: "房间已关闭" })
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

        // 阶段 6/10：发送频率限制，超频拒绝（不入库、不广播）。
        // 窗口落在 DO 存储：重连/刷新/重启后未过期记录仍计入。
        const now = Date.now()
        const rateKey = SEND_RATE_PREFIX + session.rateKey
        const window = await this.loadWindow(rateKey, now, RATE_WINDOW_MS)
        if (window.length >= RATE_MAX) {
          this.sendTo(socket, {
            type: "error",
            code: "rate_limited",
            message: "发得太快啦，歇一歇再发",
          })
          return
        }
        await this.state.storage.put(rateKey, [...window, now])

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
        // 热路径：先广播原文（带 seq，客户端记游标用于重连补拉）；
        // 译文异步算好后只发给需要的人
        this.broadcast({ type: "message", message, seq })
        this.state.waitUntil(this.fanOutTranslations(message))
        // AI 场景房（阶段 15）：真人的消息触发 AI 伙伴异步回复。
        // 以 DO 自己的房间名查人设（不信任客户端 event.roomId）；
        // AI 消息以 ai: 前缀开头，不会再触发（防自激）。AI.run 是 IO
        // 等待，不吃 10ms CPU 预算，与 fanOutTranslations 同为 waitUntil。
        const aiRoomId = this.state.id.name ?? ""
        if (!message.senderId.startsWith(AI_SENDER_PREFIX) && AI_ROOM_AI.has(aiRoomId)) {
          this.state.waitUntil(this.maybeAiReply(aiRoomId))
        }
        return
      }
      case "leave": {
        socket.close()
        return
      }
      case "profile_update": {
        // 游客身份阶段：会话中改资料。清洗、更新 session 与存储，
        // 广播 member_profile 让房里其他人尽快看到新昵称/国旗/头像/资料卡。
        const session = this.sessions.get(socket)
        if (!session) {
          this.sendTo(socket, { type: "error", code: "not_joined", message: "请先加入房间" })
          return
        }
        const profile = sanitizeProfile(event.profile, session.userId)
        session.profile = profile
        session.senderName = profile.displayName
        await this.saveProfile(profile)
        this.broadcast({ type: "member_profile", member: profile })
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
        // 阶段 10：举报本身限流，防止失败重试或恶意刷举报把存储写满。
        // 与发送窗口一样落存储，跨连接生效；被拒的举报不落盘。
        const reportRateKey = REPORT_RATE_PREFIX + session.rateKey
        const reportWindow = await this.loadWindow(reportRateKey, Date.now(), REPORT_RATE_WINDOW_MS)
        if (reportWindow.length >= REPORT_RATE_MAX) {
          this.sendTo(socket, {
            type: "error",
            code: "report_rate_limited",
            message: "举报得太频繁了，请稍后再试",
          })
          return
        }
        await this.state.storage.put(reportRateKey, [...reportWindow, Date.now()])
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

  /**
   * 成员档案落存储并滚动清理（游客身份阶段）：键 `profile:{userId}`，
   * 值带 updatedAt；超过 MAX_PROFILES 时删最旧的，控制头像占用的体积。
   */
  private async saveProfile(profile: RoomMemberProfile): Promise<void> {
    const stored: StoredProfile = { ...profile, updatedAt: Date.now() }
    await this.state.storage.put(PROFILE_PREFIX + profile.userId, stored)
    const entries = await this.state.storage.list<StoredProfile>({ prefix: PROFILE_PREFIX })
    if (entries.size <= MAX_PROFILES) return
    const sorted = [...entries.entries()].sort(
      (a, b) => (a[1]?.updatedAt ?? 0) - (b[1]?.updatedAt ?? 0),
    )
    const excess = sorted.slice(0, entries.size - MAX_PROFILES)
    await Promise.all(excess.map(([key]) => this.state.storage.delete(key)))
  }

  /** 批量取档案并只发给这条连接（join 后补齐历史消息发送者的头像/国旗）。 */
  private async sendMemberProfiles(socket: WebSocket, userIds: Set<string>): Promise<void> {
    const members: RoomMemberProfile[] = []
    // 优先用当前会话里的（最新），没有再查存储（历史发送者可能已离线）
    const fromSessions = new Map<string, RoomMemberProfile>()
    for (const session of this.sessions.values()) {
      if (session.profile) fromSessions.set(session.userId, session.profile)
    }
    for (const userId of userIds) {
      if (!userId) continue
      const live = fromSessions.get(userId)
      if (live) {
        members.push(live)
        continue
      }
      const stored = await this.state.storage.get<StoredProfile>(PROFILE_PREFIX + userId)
      if (stored) {
        const { updatedAt: _updatedAt, ...member } = stored
        members.push(member)
      }
    }
    if (members.length > 0) this.sendTo(socket, { type: "member_profiles", members })
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
   * AI 场景房（阶段 15）：有人发言后让 AI 伙伴回一句。全程异步，任何失败
   * 只打日志（不携带消息原文），AI 沉默不影响房间主功能。
   *
   * 上下文：system 人设 + 最近 AI_MAX_HISTORY 条消息；用户消息带 `[名字]`
   * 前缀以便模型区分多个说话人，连续同角色的消息合并成一条。
   * 回复固定英语（人设末段要求），译文走现有翻译链给各用户母语。
   */
  private async maybeAiReply(roomId: string): Promise<void> {
    const ai = AI_ROOM_AI.get(roomId)
    if (!ai || this.closed) return
    if (!this.env.AI) return
    // 房里没人不回：AI 不对着空气说话，也省免费额度
    if (this.sessions.size === 0) return

    try {
      // 每房间 15 秒最多 1 条。窗口戳在生成前写入（乐观占坑），
      // 避免 DO 内两个并发回复竞速双发；失败代价只是窗口内沉默一次。
      const now = Date.now()
      const rateKey = AI_RATE_PREFIX + roomId
      const window = await this.loadWindow(rateKey, now, AI_RATE_WINDOW_MS)
      if (window.length >= 1) return
      await this.state.storage.put(rateKey, [...window, now])

      // 每房间每 UTC 日封顶，防止 Neurons 免费额度被打爆；顺手删前一日键
      const utcDay = (t: number) => new Date(t).toISOString().slice(0, 10)
      const dayKey = `${AI_DAY_PREFIX}${utcDay(now)}:${roomId}`
      const used = (await this.state.storage.get<number>(dayKey)) ?? 0
      if (used >= AI_DAILY_MAX) return
      await this.state.storage.delete(`${AI_DAY_PREFIX}${utcDay(now - 86_400_000)}:${roomId}`)

      // 拼上下文：历史按角色合并，用户消息带名字前缀
      const history = await this.recentMessages(AI_MAX_HISTORY)
      const context: Array<{ role: "user" | "assistant"; content: string }> = []
      for (const { message } of history) {
        const role: "user" | "assistant" = message.senderId.startsWith(AI_SENDER_PREFIX)
          ? "assistant"
          : "user"
        const content =
          role === "assistant"
            ? message.sourceText
            : `[${message.senderName}] ${message.sourceText}`
        const last = context[context.length - 1]
        if (last && last.role === role) last.content += `\n${content}`
        else context.push({ role, content })
      }
      // 没有任何用户消息（例如只剩 AI 自己的存量）就不开口
      if (!context.some((item) => item.role === "user")) return
      // 尾部必须是 user：全 assistant 收尾时丢弃，等下一条真人消息
      while (context.length > 0 && context[context.length - 1]?.role === "assistant") {
        context.pop()
      }
      if (context.length === 0) return

      // AI binding 不吃 AbortSignal，用竞速超时防止远端代理悬死（同 provider）
      const output = await Promise.race([
        this.env.AI.run("@cf/zai-org/glm-4.7-flash", {
          messages: [{ role: "system", content: ai.systemPrompt }, ...context],
          temperature: AI_TEMPERATURE,
          max_tokens: AI_MAX_TOKENS,
          chat_template_kwargs: { enable_thinking: false },
        }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("AI 回复超时")), AI_TIMEOUT_MS),
        ),
      ])
      // 复用翻译链的响应解析与清洗（剥引号/代码块、识别拒答套话），超长截断
      const text = normalizeChatText(extractChatText(output)).slice(0, MAX_TEXT_LENGTH)
      if (!text) return
      // AI 的输出同样过垃圾过滤；closed 在生成后再查一次（等模型期间可能到点关闭）
      if (findSpam(text) || this.closed) return

      const seq = await this.nextSeq()
      const message: ChatMessage = {
        id: crypto.randomUUID(),
        roomId,
        senderId: AI_SENDER_PREFIX + roomId,
        senderName: ai.senderName,
        sourceLang: "en",
        sourceText: text,
        createdAt: Date.now(),
      }
      await this.state.storage.put(this.msgKey(seq), message)
      await this.trimOldMessages()
      // 日额计数只在真的发了消息后累加
      await this.state.storage.put(dayKey, used + 1)
      // AI 档案幂等写入（isAi 标记：前端显示徽章、隐藏举报）
      await this.saveProfile({ userId: message.senderId, displayName: ai.senderName, isAi: true })
      this.broadcast({ type: "member_profile", member: { userId: message.senderId, displayName: ai.senderName, isAi: true } })
      this.broadcast({ type: "message", message, seq })
      this.state.waitUntil(this.fanOutTranslations(message))
    } catch (error) {
      // 不带消息原文，只记房间与错误
      console.error(`[ai] AI 伙伴回复失败: ${roomId}`, error)
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
   * 翻译结果上报目录 DO（阶段 12）：provider id + 成败 + 简短原因。
   * fire-and-forget，失败只打日志，绝不影响翻译本身。
   */
  private recordTranslateResult(provider: string, ok: boolean, reason?: string): void {
    const stub = this.env.ROOM_DIRECTORY.get(this.env.ROOM_DIRECTORY.idFromName("directory"))
    const body = JSON.stringify({ provider: provider.slice(0, 64), ok, ...(ok ? {} : { reason }) })
    this.state.waitUntil(
      stub
        .fetch("https://directory/translate-stats", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body,
        })
        .then(
          () => undefined,
          (error) => console.error("[stats] 翻译结果上报失败", error),
        ),
    )
  }

  /**
   * 举报落盘，键为 `report:{时间戳左补零}:{记录id}`，按前缀 list 即按时间序读出。
   *
   * 怎么查（阶段 10）：Worker 暴露 `/admin/reports` 只读入口，凭
   * `REPORTS_ADMIN_KEY` 密钥访问，内部转发到本 DO 的 `GET /reports`
   * （storage.list({ prefix: "report:" })）。未配置密钥时入口 404。
   * 超出 MAX_REPORTS 的旧记录滚动删除，控制存储体积。
   */
  /**
   * 读滑动窗口内的时间戳（阶段 10）。窗口外的时间戳顺手删掉：
   * 存储里只保留未过期记录，体积有界（每键最多几条）。
   */
  private async loadWindow(key: string, now: number, windowMs: number): Promise<number[]> {
    const stamps = (await this.state.storage.get<number[]>(key)) ?? []
    const inWindow = stamps.filter((t) => now - t < windowMs && Number.isFinite(t))
    if (inWindow.length !== stamps.length) {
      if (inWindow.length === 0) await this.state.storage.delete(key)
      else await this.state.storage.put(key, inWindow)
    }
    return inWindow
  }

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

  /** 最近 limit 条消息，按时间正序返回（带 seq）。 */
  private async recentMessages(limit: number): Promise<MessageWithSeq[]> {
    const entries = await this.state.storage.list<ChatMessage>({
      prefix: MSG_PREFIX,
      reverse: true,
      limit,
    })
    return this.withSeq(entries).reverse()
  }

  /**
   * seq 之后的消息（阶段 11 重连补拉）：从游标之后倒着取最多 limit 条
   * （存储里最多也只有 MAX_HISTORY 条，正常短时断线远用不满），
   * 再正序返回，保证接得上最新现场。
   */
  private async messagesAfter(seq: number, limit: number): Promise<MessageWithSeq[]> {
    const entries = await this.state.storage.list<ChatMessage>({
      prefix: MSG_PREFIX,
      startAfter: this.msgKey(seq),
      reverse: true,
      limit,
    })
    return this.withSeq(entries).reverse()
  }

  /** 存储键（左补零的 seq）剥回数字，与消息配对。 */
  private withSeq(entries: Map<string, ChatMessage>): MessageWithSeq[] {
    const out: MessageWithSeq[] = []
    for (const [key, message] of entries) {
      const seq = Number(key.slice(MSG_PREFIX.length))
      if (Number.isFinite(seq)) out.push({ message, seq })
    }
    return out
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

  /** 在房人数变化时广播给房内所有人（新加入的连接也会立刻知道自己不是一个人）。 */
  private broadcastPresence(): void {
    this.broadcast({ type: "presence", count: this.sessions.size })
  }

  /** 把当前会话数上报给房间目录，大厅列表据此展示在房人数。 */
  private notifyOccupancy(): void {
    const slug = this.state.id.name
    if (!slug) return
    const count = this.sessions.size
    const update: OccupancyUpdate = { slug, count }
    const stub = this.env.ROOM_DIRECTORY.get(this.env.ROOM_DIRECTORY.idFromName("directory"))
    this.state.waitUntil(
      stub
        .fetch("https://directory/occupancy", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(update),
        })
        .then(
          () => undefined,
          (error) => console.error(`[occupancy] 上报失败: ${slug}=${count}`, error),
        ),
    )
  }
}
