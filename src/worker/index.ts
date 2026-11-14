import { BUILTIN_ROOMS, BUILTIN_ROOM_IDS } from "../shared/rooms"
import { RoomDirectoryDurableObject } from "./rooms/RoomDirectoryDurableObject"
import { RoomDurableObject } from "./rooms/RoomDurableObject"
import type { TranslateEnv } from "./translate/provider"

export { RoomDurableObject, RoomDirectoryDurableObject }

export interface Env extends TranslateEnv {
  ROOM: DurableObjectNamespace
  ROOM_DIRECTORY: DurableObjectNamespace
  /** 静态资源绑定：/r/<slug>、/privacy、/terms 等前端路由回 index.html。 */
  ASSETS: Fetcher
  /**
   * 只读举报查看入口的密钥（阶段 10，wrangler secret，不入仓库）。
   * 未配置时 /admin/reports 直接 404，等同入口不存在。
   */
  REPORTS_ADMIN_KEY?: string
}

/** 目录 DO 是单一实例，固定名字即可。 */
function directoryStub(env: Env): DurableObjectStub {
  return env.ROOM_DIRECTORY.get(env.ROOM_DIRECTORY.idFromName("directory"))
}

/**
 * 取单个房间的只读举报快照：转发到该房间 DO 的 GET /reports。
 * 标题尽力而为——内置房间用内置名，自建房间查目录（已过期清理的查不到，
 * 返回 null），查不到不影响举报本身。
 */
async function adminRoomReports(
  env: Env,
  slug: string,
): Promise<{ slug: string; kind: "builtin" | "user" | "unknown"; title: string | null; reports: unknown[] }> {
  let kind: "builtin" | "user" | "unknown" = "unknown"
  let title: string | null = null
  if (BUILTIN_ROOM_IDS.has(slug)) {
    kind = "builtin"
    title = BUILTIN_ROOMS.find((room) => room.slug === slug)?.title ?? null
  } else {
    const dirResponse = await directoryStub(env).fetch(
      `https://directory/room/${encodeURIComponent(slug)}`,
    )
    if (dirResponse.ok) {
      const room = (
        (await dirResponse.json()) as { room?: { title?: string } }
      ).room
      kind = "user"
      title = room?.title ?? null
    }
  }
  const stub = env.ROOM.get(env.ROOM.idFromName(slug))
  const response = await stub.fetch(`https://room/reports`)
  const reports = response.ok
    ? ((await response.json()) as { reports?: unknown[] }).reports ?? []
    : []
  return { slug, kind, title, reports }
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

    // 只读举报查看（阶段 10）：凭 REPORTS_ADMIN_KEY 访问，未配置即 404。
    // GET /admin/reports            → 内置房间 + 目录里仍活跃的自建房间
    // GET /admin/reports?room=slug  → 单房间（支持已从目录过期清理的自建房间）
    if (url.pathname === "/admin/reports" && request.method === "GET") {
      if (!env.REPORTS_ADMIN_KEY) return new Response("Not Found", { status: 404 })
      const provided =
        request.headers.get("x-admin-key") ?? url.searchParams.get("key") ?? ""
      if (provided !== env.REPORTS_ADMIN_KEY) {
        return new Response("Unauthorized", { status: 401 })
      }
      const roomParam = url.searchParams.get("room")
      if (roomParam !== null) {
        if (!/^[a-z0-9]{1,64}$/.test(roomParam)) {
          return new Response("Bad room", { status: 400 })
        }
        return Response.json({
          generatedAt: Date.now(),
          rooms: [await adminRoomReports(env, roomParam)],
        })
      }
      // 默认列出内置 + 目录里活跃的自建房间（无举报的房间也占一行，方便扫一眼）
      const dirResponse = await directoryStub(env).fetch("https://directory/list")
      const dirData = dirResponse.ok
        ? ((await dirResponse.json()) as { rooms?: Array<{ slug?: string }> })
        : { rooms: [] }
      const slugs = [
        ...BUILTIN_ROOMS.map((room) => room.slug),
        ...(dirData.rooms ?? [])
          .map((room) => room.slug ?? "")
          .filter((slug) => slug !== "" && !BUILTIN_ROOM_IDS.has(slug)),
      ]
      return Response.json({
        generatedAt: Date.now(),
        rooms: await Promise.all(slugs.map((slug) => adminRoomReports(env, slug))),
      })
    }

    if (request.method === "GET") {
      // SPA 兜底（阶段 8）：静态资源没命中的路径（/r/<slug>、/privacy、/terms）
      // 统一回 index.html，由前端路由接住；刷新和直接分享链接都能进对页面。
      return env.ASSETS.fetch(new Request(new URL("/", url).toString(), request))
    }
    return new Response("Not Found", { status: 404 })
  },
}
