import type { CreateRoomInput, OccupancyUpdate, RoomApiErrorCode, RoomsListResponse } from "../../shared/roomDirectory"
import { isRoomThemeId, type RoomThemeId } from "../../shared/roomThemes"
import { BUILTIN_ROOM_IDS } from "../../shared/rooms"
import type { Room } from "../../shared/types"
import { findSpam } from "./moderation"

/**
 * 自建房间目录（阶段 9）：单一实例（idFromName("directory")）的 SQLite DO。
 *
 * 职责：
 * - 创建自建房间：字段校验、生成 URL 安全 slug、每创建者限流、活跃房间总量上限；
 * - 房间列表：只返回未关闭的自建房间 + 全部房间的在房人数（内置房间由
 *   对应 Room DO 上报，目录只存数字，不持有连接）；
 * - 单房间查询：Worker 的 /ws 放行自建房间前先在这里核对存在与未关闭；
 * - 在房人数：Room DO 在会话数变化时 POST /occupancy；
 * - 翻译统计（阶段 12）：各 Room DO 的 provider 成功/失败 POST /translate-stats，
 *   按日（美国东部时间，与 Cloudflare 免费层重置一致）汇总，GET /stats 导出。
 *
 * 选型：不引入 D1。目录天然是全局单点小数据（上限 50 个活跃房间），
 * SQLite DO 一份存储就够，免额外绑定，也和消息存储的选型一致。
 * 关闭的房间记录在这里被懒清理；历史消息仍留在各自 Room DO 里（本阶段不归档）。
 */

/** 活跃（未关闭）自建房间上限，满了拒绝新创建。 */
const MAX_ACTIVE_ROOMS = 50

/** 同一创建者每小时最多创建的房间数。 */
const CREATE_RATE_MAX = 3
const CREATE_RATE_WINDOW_MS = 60 * 60 * 1000

/** 关闭时长预设（分钟），1 小时 / 3 小时（默认）/ 12 小时 / 24 小时（最长）。 */
export const DURATION_PRESETS_MINUTES: readonly number[] = [60, 180, 720, 1440]

const TITLE_MAX_CHARS = 40
const TOPIC_MAX_CHARS = 80
const NAME_MAX_CHARS = 20
const CREATOR_ID_MAX_CHARS = 64

/**
 * 存储键：room:{slug} → 房间记录；occ:{slug} → 在房人数；rate:{creatorId} → 创建时间戳；
 * creator:{slug} → 创建者访客 id（阶段 16）。creatorId 绝不放进 Room 记录——
 * GET /api/room/:slug 会把 Room 原样发给所有客户端，泄露即可冒充房主；
 * 需要判断身份的场合只在服务端比对，对外只回 isCreator 瞬态布尔。
 */
const ROOM_PREFIX = "room:"
const OCC_PREFIX = "occ:"
const RATE_PREFIX = "rate:"
const CREATOR_PREFIX = "creator:"

/**
 * 翻译统计（阶段 12）：
 * - tstat:{YYYY-MM-DD}:{provider} → { ok, fail }，按日汇总；
 * - tfail:{YYYY-MM-DD}:{时间戳左补零}:{id} → { at, provider, reason }，失败摘要。
 * 日界用美国东部时间（America/New_York）——Cloudflare Workers 免费层按
 * 美东零点重置，和额度对齐，避免与北京时间混用。
 */
const TSTAT_PREFIX = "tstat:"
const TFAIL_PREFIX = "tfail:"

/** 失败摘要滚动保留条数（跨日合计，新的顶掉旧的）。 */
const MAX_FAILURE_RECORDS = 50

/** stats 导出包含最近几天的汇总。 */
const STATS_DAYS = 7

/** 当前美国东部时间的日 key（YYYY-MM-DD，en-CA 格式恰好是这个形状）。 */
function easternDateKey(now = Date.now()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(now)
}

const SLUG_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789"
const SLUG_LENGTH = 6

interface DirectoryEnv {}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  })
}

function errorResponse(code: RoomApiErrorCode, status: number): Response {
  return json({ error: code }, status)
}

/** 字符数按 Unicode 码点算，避免 emoji 顶配额被双倍计费。 */
function charLength(text: string): number {
  return [...text].length
}

function generateSlug(): string {
  let slug = ""
  const bytes = crypto.getRandomValues(new Uint8Array(SLUG_LENGTH))
  for (const byte of bytes) slug += SLUG_ALPHABET[byte % SLUG_ALPHABET.length]
  return slug
}

export class RoomDirectoryDurableObject implements DurableObject {
  private state: DurableObjectState

  constructor(state: DurableObjectState, _env: DirectoryEnv) {
    this.state = state
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)
    if (request.method === "POST" && url.pathname === "/create") return this.create(request)
    if (request.method === "GET" && url.pathname === "/list") return this.list()
    if (request.method === "POST" && url.pathname === "/occupancy") return this.occupancy(request)
    if (request.method === "POST" && url.pathname === "/translate-stats") {
      return this.recordTranslateStats(request)
    }
    if (request.method === "GET" && url.pathname === "/stats") return this.translateStats()
    if (request.method === "POST" && url.pathname === "/theme") return this.setTheme(request)
    if (request.method === "POST" && url.pathname === "/verify-creator") {
      return this.verifyCreator(request)
    }
    const roomMatch = /^\/room\/([a-z0-9]+)$/.exec(url.pathname)
    if (request.method === "GET" && roomMatch) {
      return this.getRoom(roomMatch[1] ?? "", url.searchParams.get("creator") ?? "")
    }
    return errorResponse("not_found", 404)
  }

  private async create(request: Request): Promise<Response> {
    let input: CreateRoomInput
    try {
      input = JSON.parse(await request.text()) as CreateRoomInput
    } catch {
      return errorResponse("bad_request", 400)
    }

    const title = (input.title ?? "").trim()
    if (charLength(title) < 1 || charLength(title) > TITLE_MAX_CHARS) {
      return errorResponse("invalid_title", 400)
    }
    const topic = (input.topic ?? "").trim()
    if (charLength(topic) > TOPIC_MAX_CHARS) {
      return errorResponse("invalid_topic", 400)
    }
    // 阶段 16：标题/话题补跑垃圾过滤——房间名是公开列表里的文字，
    // 和聊天消息一个待遇（命中返回 filtered，不入目录）。
    if (findSpam(title) || findSpam(topic)) return errorResponse("filtered", 400)
    // 阶段 16：主题背景白名单校验（缺省 = 无背景）
    let theme: RoomThemeId | undefined
    if (input.theme !== undefined) {
      if (!isRoomThemeId(input.theme)) return errorResponse("invalid_theme", 400)
      theme = input.theme
    }
    if (!DURATION_PRESETS_MINUTES.includes(input.durationMinutes)) {
      return errorResponse("invalid_duration", 400)
    }
    const creatorName = (input.creatorName ?? "").trim().slice(0, NAME_MAX_CHARS)
    const creatorId = (input.creatorId ?? "").trim().slice(0, CREATOR_ID_MAX_CHARS)
    if (!creatorName || !creatorId) return errorResponse("bad_request", 400)

    const now = Date.now()

    // 创建者限流：滑动窗口记时间戳
    const rateKey = `${RATE_PREFIX}${creatorId}`
    const history = ((await this.state.storage.get<number[]>(rateKey)) ?? []).filter(
      (ts) => now - ts < CREATE_RATE_WINDOW_MS,
    )
    if (history.length >= CREATE_RATE_MAX) return errorResponse("rate_limited", 429)

    // 活跃房间上限（顺带懒清理已过期的记录）
    const active = await this.purgeExpired(now)
    if (active >= MAX_ACTIVE_ROOMS) return errorResponse("too_many_rooms", 409)

    // 生成不与内置/已有房间冲突的 slug
    let slug = ""
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const candidate = generateSlug()
      if (BUILTIN_ROOM_IDS.has(candidate)) continue
      if (await this.state.storage.get(`${ROOM_PREFIX}${candidate}`)) continue
      slug = candidate
      break
    }
    if (!slug) return errorResponse("too_many_rooms", 409)

    const room: Room = {
      id: slug,
      slug,
      title,
      topic,
      createdAt: now,
      kind: "user",
      closesAt: now + input.durationMinutes * 60_000,
      createdByName: creatorName,
      ...(theme ? { theme } : {}),
    }
    await this.state.storage.put(`${ROOM_PREFIX}${slug}`, room)
    // 创建者 id 单独存（不进 Room 记录，见 CREATOR_PREFIX 注释）
    await this.state.storage.put(`${CREATOR_PREFIX}${slug}`, creatorId)
    history.push(now)
    await this.state.storage.put(rateKey, history)
    return json({ room }, 201)
  }

  private async list(): Promise<Response> {
    await this.purgeExpired(Date.now())
    const entries = await this.state.storage.list<Room>({ prefix: ROOM_PREFIX })
    const occupancyEntries = await this.state.storage.list<number>({ prefix: OCC_PREFIX })
    const occupancy: Record<string, number> = {}
    for (const [key, count] of occupancyEntries) {
      if (typeof count === "number" && count > 0) occupancy[key.slice(OCC_PREFIX.length)] = count
    }
    const response: RoomsListResponse = {
      rooms: [...entries.values()].sort((a, b) => b.createdAt - a.createdAt),
      occupancy,
    }
    return json(response)
  }

  private async getRoom(slug: string, creator = ""): Promise<Response> {
    if (!slug || BUILTIN_ROOM_IDS.has(slug)) return errorResponse("not_found", 404)
    const room = await this.state.storage.get<Room>(`${ROOM_PREFIX}${slug}`)
    if (!room) return errorResponse("not_found", 404)
    if (room.closesAt !== undefined && Date.now() >= room.closesAt) {
      return errorResponse("closed", 410)
    }
    // ?creator= 命中时附 isCreator 瞬态布尔（前端显示背景管理入口）。
    // 不命中/不带参数时返回原记录，不泄露任何创建者信息。
    const isCreator =
      creator !== "" && (await this.state.storage.get<string>(`${CREATOR_PREFIX}${slug}`)) === creator
    return json({ room: isCreator ? { ...room, isCreator: true } : room }, 200)
  }

  /**
   * 房主换主题（阶段 16）：Worker 转发 POST /theme，body { slug, theme?, creatorId }。
   * theme 缺省 = 清除主题。鉴权通过才更新 Room 记录；随后 Worker 会再把
   * theme 同步到 Room DO 的 bg 键并广播（目录先写，DO 失败可重试自愈）。
   */
  private async setTheme(request: Request): Promise<Response> {
    let body: { slug?: string; theme?: string | null; creatorId?: string }
    try {
      body = JSON.parse(await request.text()) as typeof body
    } catch {
      return errorResponse("bad_request", 400)
    }
    const slug = (body.slug ?? "").trim()
    const creatorId = (body.creatorId ?? "").trim().slice(0, CREATOR_ID_MAX_CHARS)
    if (!slug || !creatorId || BUILTIN_ROOM_IDS.has(slug)) return errorResponse("bad_request", 400)

    const room = await this.state.storage.get<Room>(`${ROOM_PREFIX}${slug}`)
    if (!room) return errorResponse("not_found", 404)
    if (room.closesAt !== undefined && Date.now() >= room.closesAt) {
      return errorResponse("closed", 410)
    }
    if ((await this.state.storage.get<string>(`${CREATOR_PREFIX}${slug}`)) !== creatorId) {
      return errorResponse("forbidden", 403)
    }

    let theme: RoomThemeId | undefined
    if (body.theme != null) {
      if (!isRoomThemeId(body.theme)) return errorResponse("invalid_theme", 400)
      theme = body.theme
    }
    const next: Room = { ...room }
    if (theme) next.theme = theme
    else delete next.theme
    await this.state.storage.put(`${ROOM_PREFIX}${slug}`, next)
    return new Response(null, { status: 204 })
  }

  /**
   * 房主身份校验（阶段 16）：Worker 转发 POST /verify-creator，
   * body { slug, creatorId }；命中 204，否则 403（房间不存在 404）。
   * 上传自定义背景走这里（图片本体不经过目录，直进 Room DO）。
   */
  private async verifyCreator(request: Request): Promise<Response> {
    let body: { slug?: string; creatorId?: string }
    try {
      body = JSON.parse(await request.text()) as typeof body
    } catch {
      return errorResponse("bad_request", 400)
    }
    const slug = (body.slug ?? "").trim()
    const creatorId = (body.creatorId ?? "").trim().slice(0, CREATOR_ID_MAX_CHARS)
    if (!slug || !creatorId || BUILTIN_ROOM_IDS.has(slug)) return errorResponse("bad_request", 400)
    if (!(await this.state.storage.get<Room>(`${ROOM_PREFIX}${slug}`))) {
      return errorResponse("not_found", 404)
    }
    if ((await this.state.storage.get<string>(`${CREATOR_PREFIX}${slug}`)) !== creatorId) {
      return errorResponse("forbidden", 403)
    }
    return new Response(null, { status: 204 })
  }

  private async occupancy(request: Request): Promise<Response> {
    let update: OccupancyUpdate
    try {
      update = JSON.parse(await request.text()) as OccupancyUpdate
    } catch {
      return errorResponse("bad_request", 400)
    }
    const slug = (update.slug ?? "").trim()
    if (!slug) return errorResponse("bad_request", 400)
    // 只接受内置房间或真实存在的自建房间，防目录被灌垃圾键
    if (!BUILTIN_ROOM_IDS.has(slug) && !(await this.validUserRoom(slug))) {
      return errorResponse("not_found", 404)
    }
    const count = Math.max(0, Math.min(9999, Math.floor(update.count)))
    await this.state.storage.put(`${OCC_PREFIX}${slug}`, count)
    return new Response(null, { status: 204 })
  }

  private async validUserRoom(slug: string): Promise<boolean> {
    return (await this.state.storage.get(`${ROOM_PREFIX}${slug}`)) !== undefined
  }

  /**
   * 翻译结果记账（阶段 12）：{ provider, ok, reason? }。只来自各 Room DO 的
   * 内部上报（Worker 不对外转发这条路由）；provider 限长防灌键，reason 限长
   * 且只存错误摘要（provider 抛错时本身不含消息原文）。
   */
  private async recordTranslateStats(request: Request): Promise<Response> {
    let body: { provider?: string; ok?: boolean; reason?: string }
    try {
      body = JSON.parse(await request.text()) as typeof body
    } catch {
      return errorResponse("bad_request", 400)
    }
    const provider = (body.provider ?? "").trim().slice(0, 64)
    if (!provider || typeof body.ok !== "boolean") return errorResponse("bad_request", 400)

    const date = easternDateKey()
    const key = `${TSTAT_PREFIX}${date}:${provider}`
    const counters = (await this.state.storage.get<{ ok: number; fail: number }>(key)) ?? {
      ok: 0,
      fail: 0,
    }
    if (body.ok) counters.ok += 1
    else counters.fail += 1
    await this.state.storage.put(key, counters)

    if (!body.ok) {
      const at = Date.now()
      const reason = (body.reason ?? "").slice(0, 120)
      const failKey = `${TFAIL_PREFIX}${date}:${String(at).padStart(16, "0")}:${crypto.randomUUID()}`
      await this.state.storage.put(failKey, { at, provider, reason })
      await this.trimFailures()
    }
    return new Response(null, { status: 204 })
  }

  /** 失败摘要只留最近 MAX_FAILURE_RECORDS 条，新的顶掉旧的。 */
  private async trimFailures(): Promise<void> {
    const entries = await this.state.storage.list<{ at: number; provider: string; reason: string }>(
      { prefix: TFAIL_PREFIX, reverse: true, limit: MAX_FAILURE_RECORDS + 1 },
    )
    const keys = [...entries.keys()]
    if (keys.length <= MAX_FAILURE_RECORDS) return
    await Promise.all(keys.slice(MAX_FAILURE_RECORDS).map((key) => this.state.storage.delete(key)))
  }

  /**
   * 导出翻译统计（阶段 12）：最近 STATS_DAYS 天按 provider 的成功/失败汇总
   * + 最近 MAX_FAILURE_RECORDS 条失败摘要（新的在前）。日界为美国东部时间。
   * Workers 请求数没有免费官方用量 API，容量对照写在 DEPLOY.md，不硬接。
   */
  private async translateStats(): Promise<Response> {
    const statEntries = await this.state.storage.list<{ ok: number; fail: number }>({
      prefix: TSTAT_PREFIX,
    })
    // days: { "2026-11-15": { "google-clients5": { ok, fail }, … }, … }
    const days: Record<string, Record<string, { ok: number; fail: number }>> = {}
    for (const [key, counters] of statEntries) {
      const rest = key.slice(TSTAT_PREFIX.length)
      const date = rest.slice(0, rest.indexOf(":"))
      const provider = rest.slice(rest.indexOf(":") + 1)
      if (!date || !provider) continue
      ;(days[date] ??= {})[provider] = counters
    }
    // 最近 STATS_DAYS 天（含今天，可能没数据——照列出来便于对照空档）
    const today = easternDateKey()
    const recentDates = new Set(
      [...Array(STATS_DAYS).keys()].map((i) => easternDateKey(Date.now() - i * 86_400_000)),
    )
    const sortedDays = Object.keys(days)
      .filter((date) => recentDates.has(date))
      .sort()
      .reverse()
      .map((date) => ({
        date,
        providers: days[date] ?? {},
        total: Object.values(days[date] ?? {}).reduce((sum, c) => sum + c.ok + c.fail, 0),
      }))
    // 今天还没有任何记录时也列一行空的，方便对照「当日还没流量」和「当日没失败」
    if (!sortedDays.some((d) => d.date === today)) {
      sortedDays.unshift({ date: today, providers: {}, total: 0 })
    }
    const failEntries = await this.state.storage.list<{
      at: number
      provider: string
      reason: string
    }>({ prefix: TFAIL_PREFIX, reverse: true, limit: MAX_FAILURE_RECORDS })
    const failures = [...failEntries.values()]
    return json({ today, timezone: "America/New_York", days: sortedDays, failures })
  }

  /** 删除已过期的自建房间记录（及其人数键、创建者键），返回剩余活跃数。 */
  private async purgeExpired(now: number): Promise<number> {
    const entries = await this.state.storage.list<Room>({ prefix: ROOM_PREFIX })
    const expired: Room[] = []
    for (const room of entries.values()) {
      if (room.closesAt !== undefined && now >= room.closesAt) expired.push(room)
    }
    if (expired.length > 0) {
      await Promise.all(
        expired.map((room) =>
          Promise.all([
            this.state.storage.delete(`${ROOM_PREFIX}${room.slug}`),
            this.state.storage.delete(`${OCC_PREFIX}${room.slug}`),
            this.state.storage.delete(`${CREATOR_PREFIX}${room.slug}`),
          ]),
        ),
      )
    }
    return entries.size - expired.length
  }
}
