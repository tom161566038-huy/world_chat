import type { CreateRoomInput, OccupancyUpdate, RoomApiErrorCode, RoomsListResponse } from "../../shared/roomDirectory"
import { BUILTIN_ROOM_IDS } from "../../shared/rooms"
import type { Room } from "../../shared/types"

/**
 * 自建房间目录（阶段 9）：单一实例（idFromName("directory")）的 SQLite DO。
 *
 * 职责：
 * - 创建自建房间：字段校验、生成 URL 安全 slug、每创建者限流、活跃房间总量上限；
 * - 房间列表：只返回未关闭的自建房间 + 全部房间的在房人数（内置房间由
 *   对应 Room DO 上报，目录只存数字，不持有连接）；
 * - 单房间查询：Worker 的 /ws 放行自建房间前先在这里核对存在与未关闭；
 * - 在房人数：Room DO 在会话数变化时 POST /occupancy。
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

/** 存储键：room:{slug} → 房间记录；occ:{slug} → 在房人数；rate:{creatorId} → 创建时间戳。 */
const ROOM_PREFIX = "room:"
const OCC_PREFIX = "occ:"
const RATE_PREFIX = "rate:"

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
    const roomMatch = /^\/room\/([a-z0-9]+)$/.exec(url.pathname)
    if (request.method === "GET" && roomMatch) return this.getRoom(roomMatch[1] ?? "")
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
    }
    await this.state.storage.put(`${ROOM_PREFIX}${slug}`, room)
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

  private async getRoom(slug: string): Promise<Response> {
    if (!slug || BUILTIN_ROOM_IDS.has(slug)) return errorResponse("not_found", 404)
    const room = await this.state.storage.get<Room>(`${ROOM_PREFIX}${slug}`)
    if (!room) return errorResponse("not_found", 404)
    if (room.closesAt !== undefined && Date.now() >= room.closesAt) {
      return errorResponse("closed", 410)
    }
    return json({ room }, 200)
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

  /** 删除已过期的自建房间记录（及其人数键），返回剩余活跃数。 */
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
          ]),
        ),
      )
    }
    return entries.size - expired.length
  }
}
