import { useState } from "react"
import type { LanguageCode } from "../shared/types"

/** 第一版支持的界面语言，先列一小批，后续按需扩展。 */
const LANGUAGES: Array<{ code: LanguageCode; label: string }> = [
  { code: "zh", label: "中文" },
  { code: "en", label: "English" },
  { code: "ja", label: "日本語" },
  { code: "es", label: "Español" },
  { code: "fr", label: "Français" },
]

/** 阶段 3 才有真实房间，这里先放占位话题。 */
const ROOM_PLACEHOLDERS = ["旅行", "美食", "学语言"] as const

export default function App() {
  const [displayName, setDisplayName] = useState("")
  const [language, setLanguage] = useState<LanguageCode>("zh")

  return (
    <main className="setup">
      <h1>WorldChat</h1>
      <p className="subtitle">用自己的语言聊天，看到大家的语言。</p>

      <form
        className="entry"
        onSubmit={(e) => {
          e.preventDefault()
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
      </form>

      <section className="rooms">
        <h2>房间（即将开放）</h2>
        <ul>
          {ROOM_PLACEHOLDERS.map((topic) => (
            <li key={topic} className="room-placeholder">
              # {topic}
            </li>
          ))}
        </ul>
      </section>
    </main>
  )
}
