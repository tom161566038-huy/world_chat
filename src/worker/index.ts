import { BUILTIN_ROOM_IDS } from "../shared/rooms"
import { RoomDurableObject } from "./rooms/RoomDurableObject"
import type { TranslateEnv } from "./translate/provider"

export { RoomDurableObject }

export interface Env extends TranslateEnv {
  ROOM: DurableObjectNamespace
  /** 静态资源绑定：/r/<slug>、/privacy、/terms 等前端路由回 index.html。 */
  ASSETS: Fetcher
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
    if (request.method === "GET") {
      // SPA 兜底（阶段 8）：静态资源没命中的路径（/r/<slug>、/privacy、/terms）
      // 统一回 index.html，由前端路由接住；刷新和直接分享链接都能进对页面。
      return env.ASSETS.fetch(new Request(new URL("/", url).toString(), request))
    }
    return new Response("Not Found", { status: 404 })
  },
}
