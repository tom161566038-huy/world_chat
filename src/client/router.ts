/**
 * 极简前端路由（阶段 8）：不引入路由库，直接解析 location.pathname。
 * - `/` 落地页 / 房间列表
 * - `/r/<slug>` 可分享的房间链接
 * - `/privacy`、`/terms` 隐私说明与服务条款
 * 服务端把非静态、非 /ws 的 GET 一律回 index.html（见 src/worker/index.ts），
 * 所以这些路径刷新后也能由前端路由接住。
 */
import { useEffect, useState } from "react"

export type Route =
  | { name: "home" }
  | { name: "room"; slug: string }
  | { name: "privacy" }
  | { name: "terms" }

export function parseRoute(pathname: string): Route {
  const match = /^\/r\/([^/]+)\/?$/.exec(pathname)
  if (match) return { name: "room", slug: decodeURIComponent(match[1] ?? "") }
  if (pathname === "/privacy") return { name: "privacy" }
  if (pathname === "/terms") return { name: "terms" }
  return { name: "home" }
}

/** 站内跳转：pushState 后派发 popstate，让 useRoute 的监听统一生效。 */
export function navigate(path: string): void {
  window.history.pushState(null, "", path)
  window.dispatchEvent(new PopStateEvent("popstate"))
}

/** 房间链接（分享给别人的地址）。 */
export function roomLink(slug: string): string {
  return `${window.location.origin}/r/${encodeURIComponent(slug)}`
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseRoute(window.location.pathname))
  useEffect(() => {
    const onPopState = () => setRoute(parseRoute(window.location.pathname))
    window.addEventListener("popstate", onPopState)
    return () => window.removeEventListener("popstate", onPopState)
  }, [])
  return route
}
