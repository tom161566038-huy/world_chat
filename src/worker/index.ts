import { BUILTIN_ROOM_IDS } from "../shared/rooms"
import { RoomDurableObject } from "./rooms/RoomDurableObject"
import type { TranslateEnv } from "./translate/provider"

export { RoomDurableObject }

export interface Env extends TranslateEnv {
  ROOM: DurableObjectNamespace
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    if (url.pathname === "/ws") {
      const roomId = url.searchParams.get("room") ?? ""
      if (!BUILTIN_ROOM_IDS.has(roomId)) {
        return new Response("Unknown room", { status: 404 })
      }
      // 每个房间一个 Durable Object 实例，天然隔离连接与消息
      const id = env.ROOM.idFromName(roomId)
      return env.ROOM.get(id).fetch(request)
    }
    return new Response("Not Found", { status: 404 })
  },
}
