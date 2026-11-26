/**
 * 房间目录（阶段 9）前后端共用类型。
 * 目录是单一实例的 SQLite Durable Object（RoomDirectoryDurableObject），
 * Worker 通过同源 HTTP API 暴露给前端，Room DO 通过内部 fetch 上报在房人数。
 */
import type { RoomThemeId } from "./roomThemes"
import type { Room } from "./types"

/** POST /api/rooms 的请求体。 */
export interface CreateRoomInput {
  title: string
  topic?: string
  /** 开放时长（分钟），只能是 60/180/720/1440 之一。 */
  durationMinutes: number
  /** 匿名访客 id（前端生成的 UUID，存 localStorage），用于创建限流。 */
  creatorId: string
  /** 创建者显示名，仅随房间记录展示。 */
  creatorName: string
  /** 房间主题背景（阶段 16）：白名单内的主题 id，缺省 = 无背景。 */
  theme?: RoomThemeId
}

/** GET /api/rooms 的响应。 */
export interface RoomsListResponse {
  /** 尚未关闭的自建房间（closesAt 在未来）。 */
  rooms: Room[]
  /** slug -> 当前在房人数，内置房间与自建房间都在内。 */
  occupancy: Record<string, number>
}

/** Room DO → 目录 DO 的在房人数上报。 */
export interface OccupancyUpdate {
  slug: string
  count: number
}

/** 创建/查询接口的错误码（前端据此映射本地化文案）。 */
export type RoomApiErrorCode =
  | "invalid_title"
  | "invalid_topic"
  | "invalid_duration"
  | "rate_limited"
  | "too_many_rooms"
  | "not_found"
  | "closed"
  | "bad_request"
  /** 阶段 16：标题/话题命中垃圾过滤 */
  | "filtered"
  /** 阶段 16：theme 不在白名单 */
  | "invalid_theme"
  /** 阶段 16：只有房主可以改房间背景 */
  | "forbidden"
  /** 阶段 16：上传图片超长 */
  | "bg_too_large"
  /** 阶段 16：上传图片格式不合法 */
  | "bg_invalid"
