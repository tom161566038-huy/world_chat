/** 复制文本到剪贴板：优先 Clipboard API，旧环境退回 execCommand。 */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    // 非安全上下文 / 旧浏览器：隐藏输入框兜底
    try {
      const input = document.createElement("textarea")
      input.value = text
      input.style.position = "fixed"
      input.style.opacity = "0"
      document.body.appendChild(input)
      input.select()
      const ok = document.execCommand("copy")
      input.remove()
      return ok
    } catch {
      return false
    }
  }
}
