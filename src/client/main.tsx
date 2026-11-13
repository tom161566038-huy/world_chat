import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import App from "./App"
import "./index.css"

const rootElement = document.getElementById("root")
if (!rootElement) throw new Error("找不到 #root 挂载点")

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// 离线壳：只在生产构建注册 service worker；开发时 vite 资源路径不固定，注册反而会缓存脏数据
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // 注册失败不影响正常聊天
    })
  })
}
