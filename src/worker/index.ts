import { RoomDurableObject } from "./rooms/RoomDurableObject"

export { RoomDurableObject }

export interface Env {
  ROOM: DurableObjectNamespace
}

/** 阶段 2 只有单一房间，用固定 id；阶段 3 改为按房间 slug 分配。 */
const DEFAULT_ROOM_ID = "lobby"

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    if (url.pathname === "/ws") {
      const roomId = url.searchParams.get("room") ?? DEFAULT_ROOM_ID
      const id = env.ROOM.idFromName(roomId)
      return env.ROOM.get(id).fetch(request)
    }
    return new Response("Not Found", { status: 404 })
  },
}
