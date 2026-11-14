/**
 * 房间目录 HTTP API（阶段 9）：创建/查询自建房间、拉房间列表与在房人数。
 * 匿名访客 id（创建限流用）：随机 UUID 存 localStorage，与身份档案分开。
 */
import type { CreateRoomInput, RoomApiErrorCode, RoomsListResponse } from "../shared/roomDirectory"
import type { Room } from "../shared/types"

const VISITOR_KEY = "worldchat:visitorId"

export function getVisitorId(): string {
  let id = localStorage.getItem(VISITOR_KEY)
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem(VISITOR_KEY, id)
  }
  return id
}

/**
 * 「更换身份」时一并清掉访客 id（阶段 11）：下次调用 getVisitorId 会重新生成，
 * 旧 id 不再算同一个访客（稳定身份与展示档案同生共死）。
 */
export function resetVisitorId(): void {
  localStorage.removeItem(VISITOR_KEY)
}

/** 拉列表：内置 + 自建房间的在房人数都在 occupancy 里；失败返回 null（UI 提示重试）。 */
export async function fetchRooms(): Promise<RoomsListResponse | null> {
  try {
    const res = await fetch("/api/rooms")
    if (!res.ok) return null
    return (await res.json()) as RoomsListResponse
  } catch {
    return null
  }
}

export type RoomLookup =
  | { status: "ok"; room: Room }
  | { status: "closed" }
  | { status: "not_found" }

/** 查单个自建房间：/r/<slug> 进入时先核对，关掉的房间明确提示而不是连不上。 */
export async function lookupRoom(slug: string): Promise<RoomLookup> {
  try {
    const res = await fetch(`/api/room/${encodeURIComponent(slug)}`)
    if (res.ok) {
      const body = (await res.json()) as { room?: Room }
      if (body.room) return { status: "ok", room: body.room }
      return { status: "not_found" }
    }
    if (res.status === 410) return { status: "closed" }
    const body = (await res.json().catch(() => null)) as { error?: RoomApiErrorCode } | null
    return body?.error === "closed" ? { status: "closed" } : { status: "not_found" }
  } catch {
    return { status: "not_found" }
  }
}

export type CreateResult = { ok: true; room: Room } | { ok: false; code: RoomApiErrorCode }

export async function createRoom(input: CreateRoomInput): Promise<CreateResult> {
  try {
    const res = await fetch("/api/rooms", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    })
    const body = (await res.json().catch(() => null)) as
      | { room?: Room; error?: RoomApiErrorCode }
      | null
    if (res.ok && body?.room) return { ok: true, room: body.room }
    return { ok: false, code: body?.error ?? "bad_request" }
  } catch {
    return { ok: false, code: "bad_request" }
  }
}
