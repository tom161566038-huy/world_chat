import { BUILTIN_ROOM_IDS } from "../shared/rooms"
import { RoomDirectoryDurableObject } from "./rooms/RoomDirectoryDurableObject"
import { RoomDurableObject } from "./rooms/RoomDurableObject"
import type { TranslateEnv } from "./translate/provider"

export { RoomDurableObject, RoomDirectoryDurableObject }

export interface Env extends TranslateEnv {
  ROOM: DurableObjectNamespace
  ROOM_DIRECTORY: DurableObjectNamespace
  /** 静态资源绑定：/r/<slug>、/privacy、/terms 等前端路由回 index.html。 */
  ASSETS: Fetcher
}

/** 目录 DO 是单一实例，固定名字即可。 */
function directoryStub(env: Env): DurableObjectStub {
  return env.ROOM_DIRECTORY.get(env.ROOM_DIRECTORY.idFromName("directory"))
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)

    if (url.pathname === "/ws") {
      const roomId = url.searchParams.get("room") ?? ""
      let closesAt: number | undefined
      if (BUILTIN_ROOM_IDS.has(roomId)) {
        // 内置房间始终开放，直接放行
      } else {
        // 自建房间：查目录，未知/已关闭一律拒绝（不依赖前端判断）
        const dirResponse = await directoryStub(env).fetch(
          `https://directory/room/${encodeURIComponent(roomId)}`,
        )
        if (!dirResponse.ok) {
          return new Response(dirResponse.status === 410 ? "Room closed" : "Unknown room", {
            status: 404,
          })
        }
        const room = ((await dirResponse.json()) as { room?: { closesAt?: number } }).room
        if (!room || typeof room.closesAt !== "number" || Date.now() >= room.closesAt) {
          return new Response("Room closed", { status: 404 })
        }
        closesAt = room.closesAt
      }
      // 每个房间一个 Durable Object 实例，天然隔离连接与消息；
      // 自建房间把 closesAt 一并带给 DO（它据此设 Alarm、到点关闭）
      const id = env.ROOM.idFromName(roomId)
      const forwardUrl = new URL(request.url)
      if (closesAt !== undefined) forwardUrl.searchParams.set("closesAt", String(closesAt))
      return env.ROOM.get(id).fetch(new Request(forwardUrl, request))
    }

    // 房间目录 API（阶段 9）：同源 HTTP，创建限流在目录 DO 里做
    if (url.pathname === "/api/rooms" && request.method === "POST") {
      return directoryStub(env).fetch("https://directory/create", request)
    }
    if (url.pathname === "/api/rooms" && request.method === "GET") {
      return directoryStub(env).fetch("https://directory/list")
    }
    const roomMatch = /^\/api\/room\/([a-z0-9]+)$/.exec(url.pathname)
    if (roomMatch && request.method === "GET") {
      return directoryStub(env).fetch(`https://directory/room/${roomMatch[1] ?? ""}`)
    }

    if (request.method === "GET") {
      // SPA 兜底（阶段 8）：静态资源没命中的路径（/r/<slug>、/privacy、/terms）
      // 统一回 index.html，由前端路由接住；刷新和直接分享链接都能进对页面。
      return env.ASSETS.fetch(new Request(new URL("/", url).toString(), request))
    }
    return new Response("Not Found", { status: 404 })
  },
}
