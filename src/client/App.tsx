import { useState } from "react"
import type { LanguageCode } from "../shared/types"
import Chat from "./Chat"

/** 第一版支持的界面语言，先列一小批，后续按需扩展。 */
const LANGUAGES: Array<{ code: LanguageCode; label: string }> = [
  { code: "zh", label: "中文" },
  { code: "en", label: "English" },
  { code: "ja", label: "日本語" },
  { code: "es", label: "Español" },
  { code: "fr", label: "Français" },
]

/** 阶段 2 只有单一房间；阶段 3 再做房间列表。 */
const LOBBY_ROOM_ID = "lobby"

export default function App() {
  const [displayName, setDisplayName] = useState("")
  const [language, setLanguage] = useState<LanguageCode>("zh")
  const [entered, setEntered] = useState(false)

  if (entered) {
    return (
      <Chat roomId={LOBBY_ROOM_ID} displayName={displayName} language={language} />
    )
  }

  return (
    <main className="setup">
      <h1>WorldChat</h1>
      <p className="subtitle">用自己的语言聊天，看到大家的语言。</p>

      <form
        className="entry"
        onSubmit={(e) => {
          e.preventDefault()
          if (displayName.trim()) setEntered(true)
        }}
      >
        <label>
          显示名称
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="给自己起个名字"
            maxLength={20}
            required
          />
        </label>

        <label>
          我的语言
          <select value={language} onChange={(e) => setLanguage(e.target.value)}>
            {LANGUAGES.map(({ code, label }) => (
              <option key={code} value={code}>
                {label}
              </option>
            ))}
          </select>
        </label>

        <button type="submit">进入大厅</button>
      </form>
    </main>
  )
}
