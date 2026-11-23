/**
 * 尽早捕获 beforeinstallprompt：事件常在首屏 load 前后触发，
 * 若等到 InstallHint 挂载（或从落地页切到大厅后）再听，会丢掉，
 * 已有档案的用户直接进大厅时尤其明显。
 * 本模块在 main.tsx 入口同步导入，只做进程内记录，不读写存储。
 */
export interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>
}

let saved: InstallPromptEvent | null = null
let installed = false
const listeners = new Set<() => void>()

function notify(): void {
  for (const listener of listeners) listener()
}

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault()
    saved = event as InstallPromptEvent
    notify()
  })
  window.addEventListener("appinstalled", () => {
    installed = true
    saved = null
    notify()
  })
}

export function getInstallPrompt(): InstallPromptEvent | null {
  return saved
}

export function wasAppInstalled(): boolean {
  return installed
}

export function subscribeInstallPrompt(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function clearInstallPrompt(): void {
  saved = null
  notify()
}
