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

/** worldchat.chat 的香港 Caddy 反代出口公网 IPv4（该机无公网 IPv6）。 */
const HK_CADDY_PROXY_IP = "119.28.55.95"

/** 国家码统一规范化：两位大写字母，排除 XX/T1 等识别失败值。 */
function normalizeCountry(raw: string | null | undefined): string | null {
  const normalized = (raw ?? "").trim().toUpperCase()
  return /^[A-Z]{2}$/.test(normalized) && normalized !== "XX" && normalized !== "T1"
    ? normalized
    : null
}

/** 合法公网 IPv4：排除私网、回环、链路本地、CGNAT、组播与保留段。 */
function isPublicIpv4(ip: string): boolean {
  const parts = ip.split(".")
  if (parts.length !== 4) return false
  const octets: number[] = []
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return false
    if (part.length > 1 && part.startsWith("0")) return false
    const n = Number(part)
    if (n > 255) return false
    octets.push(n)
  }
  const a = octets[0] ?? -1
  const b = octets[1] ?? -1
  if (a === 0 || a === 10 || a === 127) return false
  if (a === 172 && b >= 16 && b <= 31) return false
  if (a === 192 && b === 168) return false
  if (a === 169 && b === 254) return false
  if (a === 100 && b >= 64 && b <= 127) return false
  if (a >= 224) return false
  return true
}

/** 合法公网 IPv6：借 URL 解析校验格式，排除回环、未指定、ULA 与链路本地。 */
function isPublicIpv6(ip: string): boolean {
  let hostname: string
  try {
    hostname = new URL(`http://[${ip}]/`).hostname
  } catch {
    return false
  }
  if (!hostname.startsWith("[") || !hostname.endsWith("]")) return false
  const lower = hostname.slice(1, -1).toLowerCase()
  if (lower === "::" || lower === "::1") return false
  // IPv4 映射地址（::ffff:x.x.x.x 或十六进制 ::ffff:xxxx:xxxx）按内嵌 IPv4 判定
  if (lower.startsWith("::ffff:")) {
    const tail = lower.slice(7)
    if (tail.includes(".")) return isPublicIpv4(tail)
    const groups = tail.split(":")
    const hi = groups.length === 2 ? parseInt(groups[0] ?? "", 16) : NaN
    const lo = groups.length === 2 ? parseInt(groups[1] ?? "", 16) : NaN
    if ([hi, lo].every((n) => !Number.isNaN(n) && n >= 0 && n <= 0xffff)) {
      return isPublicIpv4(`${hi >> 8}.${hi & 0xff}.${lo >> 8}.${lo & 0xff}`)
    }
    return false
  }
  const firstGroup = lower.split("::")[0]?.split(":")[0] ?? ""
  if (firstGroup.length >= 2) {
    const high = parseInt(firstGroup.slice(0, 2), 16)
    if (!Number.isNaN(high)) {
      if ((high & 0xfe) === 0xfc) return false // fc00::/7 ULA
      if (high === 0xfe) return false // fe80::/10 链路本地（含 site-local）
    }
  }
  return true
}

function isValidPublicClientIp(ip: string): boolean {
  return ip.includes(":") ? isPublicIpv6(ip) : isPublicIpv4(ip)
}

/**
 * 反代场景下的客户 IP → 国家码：免费 ipwho.is 为主、api.country.is 兜底，
 * 约 800ms 超时，失败/超时返回 null（绝不退回代理所在的 HK）。
 * 结果按 IP 用 Cache API 缓存（命中数小时、失败数分钟），降低外部依赖。
 * 原始 IP 不写入日志与存储。
 */
async function lookupClientIpCountry(ip: string): Promise<string | null> {
  const cacheKey = new Request(`https://geo.worldchat.internal/${ip}`)
  const cached = await caches.default.match(cacheKey)
  if (cached) {
    return normalizeCountry(((await cached.json()) as { country?: string | null }).country)
  }
  const fetchCountry = async (endpoint: string, pick: (data: unknown) => string | null) => {
    const controller = new AbortController()
    setTimeout(() => controller.abort(), 800)
    const response = await fetch(endpoint, { signal: controller.signal })
    if (!response.ok) return null
    return pick(await response.json())
  }
  let country: string | null = null
  try {
    country = await fetchCountry(
      `https://ipwho.is/${ip}?fields=success,country_code`,
      (data) => {
        const d = data as { success?: boolean; country_code?: string }
        return d.success === true ? d.country_code ?? null : null
      },
    )
    if (!country) {
      country = await fetchCountry(`https://api.country.is/${ip}`, (data) => {
        return (data as { country?: string }).country ?? null
      })
    }
  } catch {
    country = null
  }
  const normalized = normalizeCountry(country)
  await caches.default.put(
    cacheKey,
    new Response(JSON.stringify({ country: normalized }), {
      headers: { "Cache-Control": normalized ? "max-age=21600" : "max-age=300" },
    }),
  )
  return normalized
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

    // 边缘国家码（游客身份阶段）。两条路径：
    // 1. 走 worldchat.chat（香港 Caddy 反代 → workers.dev）：Cloudflare 看到的
    //    连接方一律是香港机（cf.country 恒为 HK），不可信。只认 Cloudflare
    //    自己设置的 CF-Connecting-IP，且仅当它等于已知反代出口时，才读取
    //    Caddy 覆盖写入的 X-WorldChat-Client-IP（客户端伪造不了），校验为
    //    公网 IP 后用免费接口解析国家；失败返回 null，绝不退回 HK。
    //    不读 X-Forwarded-For（客户端可伪造并被追加）。
    // 2. 直连 workers.dev（含本地 wrangler dev，无 CF-Connecting-IP）：
    //    仍用 Cloudflare 请求自带的 country，不接付费 GeoIP。
    // 两种路径识别失败都返回 null，客户端不清已有国家码；
    // 原始 IP 不写入存储、日志或档案。
    if (url.pathname === "/api/geo" && request.method === "GET") {
      let country: string | null = null
      if (request.headers.get("cf-connecting-ip") === HK_CADDY_PROXY_IP) {
        const clientIp = request.headers.get("x-worldchat-client-ip") ?? ""
        if (isValidPublicClientIp(clientIp)) {
          country = await lookupClientIpCountry(clientIp)
        }
      } else {
        const cfCountry = request.cf?.country
        const raw =
          (typeof cfCountry === "string" ? cfCountry : "") ||
          request.headers.get("cf-ipcountry") ||
          ""
        country = normalizeCountry(raw)
      }
      return Response.json({ country })
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

    // 只读翻译统计（阶段 12）：鉴权与 /admin/reports 对齐，未配置即 404。
    if (url.pathname === "/admin/stats" && request.method === "GET") {
      if (!env.REPORTS_ADMIN_KEY) return new Response("Not Found", { status: 404 })
      const provided =
        request.headers.get("x-admin-key") ?? url.searchParams.get("key") ?? ""
      if (provided !== env.REPORTS_ADMIN_KEY) {
        return new Response("Unauthorized", { status: 401 })
      }
      return directoryStub(env).fetch("https://directory/stats")
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
