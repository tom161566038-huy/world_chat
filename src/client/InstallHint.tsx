/**
 * 安装到主屏幕入口（PWA）：
 * - 已在独立窗口（display-mode: standalone / iOS navigator.standalone）：不渲染
 * - 能收到 beforeinstallprompt（Android/桌面 Chrome 等）：一键安装按钮
 * - iOS Safari：给「分享 → 添加到主屏幕」步骤说明
 * - 其它浏览器：一句「用浏览器菜单添加到主屏幕」
 * 关闭状态存独立 key（worldchat:installHintDismissed），克制不打扰。
 */
import { useEffect, useState } from "react"
import type { LanguageCode } from "../shared/types"
import { t } from "./i18n"

const DISMISS_KEY = "worldchat:installHintDismissed"

/** beforeinstallprompt 不在标准 DOM 类型里，只声明用到的成员。 */
interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>
}

function isStandalone(): boolean {
  const nav = navigator as Navigator & { standalone?: boolean }
  return window.matchMedia("(display-mode: standalone)").matches || nav.standalone === true
}

/** iOS Safari（含 iPadOS 桌面 UA 的 iPad）：不能编程式触发安装。 */
function isIosSafari(): boolean {
  return (
    /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  )
}

export default function InstallHint({ language }: { language: LanguageCode }) {
  const [standalone] = useState(isStandalone)
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(DISMISS_KEY) === "1")
  const [installed, setInstalled] = useState(false)
  const [promptEvent, setPromptEvent] = useState<InstallPromptEvent | null>(null)

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault()
      setPromptEvent(e as InstallPromptEvent)
    }
    const onInstalled = () => setInstalled(true)
    window.addEventListener("beforeinstallprompt", onPrompt)
    window.addEventListener("appinstalled", onInstalled)
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt)
      window.removeEventListener("appinstalled", onInstalled)
    }
  }, [])

  if (standalone || installed || dismissed) return null

  function dismiss() {
    try {
      localStorage.setItem(DISMISS_KEY, "1")
    } catch {
      // 存不了就算了，本次会话内也不再显示
    }
    setDismissed(true)
  }

  async function install() {
    if (!promptEvent) return
    await promptEvent.prompt()
    const choice = await promptEvent.userChoice.catch(() => null)
    // 每个事件只能 prompt 一次；装好了整条隐藏，拒绝了收起按钮留文字指引
    if (choice?.outcome === "accepted") setInstalled(true)
    setPromptEvent(null)
  }

  const text = promptEvent
    ? t(language, "installHintText")
    : isIosSafari()
      ? t(language, "installIosHint")
      : t(language, "installMenuHint")

  return (
    <aside className="install-hint">
      <p>{text}</p>
      {promptEvent && (
        <button type="button" className="install-btn" onClick={install}>
          {t(language, "installBtn")}
        </button>
      )}
      <button
        type="button"
        className="install-close"
        aria-label={t(language, "closeBtn")}
        onClick={dismiss}
      >
        ×
      </button>
    </aside>
  )
}
