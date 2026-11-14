// WorldChat 基础离线壳（阶段 5）：
// - 页面导航：网络优先，断网时回退到缓存的应用壳，再不行给离线页
// - 静态资源（/assets/、图标等带哈希/不变的文件）：缓存优先 + 后台更新
// - 不缓存 WebSocket 和跨域请求；离线发消息/翻译不在本阶段范围
const CACHE = "worldchat-shell-v1"
// Workers 静态资源会把 /offline.html 307 到 /offline（pretty URL），
// 这里直接用 /offline，避免预缓存到重定向响应
const SHELL = ["/", "/offline"]

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener("fetch", (event) => {
  const { request } = event
  if (request.method !== "GET") return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  if (request.mode === "navigate") {
    // 网络优先：在线时永远拿最新版本，同时刷新缓存。
    // 只缓存 2xx 响应——错误状态码（如限流页、5xx）进缓存会在离线时被当应用壳回放。
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) cachePut(request, response)
          return response
        })
        .catch(() =>
          caches
            .match(request)
            .then((hit) => hit ?? caches.match("/"))
            .then((hit) => hit ?? caches.match("/offline")),
        ),
    )
    return
  }

  // 静态资源：缓存优先，命中后后台刷新
  event.respondWith(
    caches.match(request).then((hit) => {
      const fetching = fetch(request)
        .then((response) => {
          if (response.ok) cachePut(request, response)
          return response
        })
        .catch(() => hit)
      return hit ?? fetching
    }),
  )
})

function cachePut(request, response) {
  const copy = response.clone()
  void caches.open(CACHE).then((cache) => cache.put(request, copy))
}
