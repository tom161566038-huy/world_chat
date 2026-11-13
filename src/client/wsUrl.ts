/** 开发时连本地 wrangler（8787），生产走同源的 wss。 */
export function wsUrl(roomId: string): string {
  if (import.meta.env.DEV) {
    return `ws://localhost:8787/ws?room=${encodeURIComponent(roomId)}`
  }
  const scheme = window.location.protocol === "https:" ? "wss" : "ws"
  return `${scheme}://${window.location.host}/ws?room=${encodeURIComponent(roomId)}`
}
