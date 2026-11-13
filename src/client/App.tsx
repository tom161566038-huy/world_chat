import { useEffect, useState } from "react"
import { BUILTIN_ROOMS } from "../shared/rooms"
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

const PROFILE_KEY = "worldchat:profile"
const ROOM_KEY = "worldchat:room"

interface Profile {
  displayName: string
  language: LanguageCode
}

/** 刷新后恢复房间和身份，配合服务端历史消息，回到刚才的聊天现场。 */
function loadStoredState(): { profile: Profile | null; roomId: string | null } {
  try {
    const profile = JSON.parse(localStorage.getItem(PROFILE_KEY) ?? "null") as Profile | null
    const roomId = localStorage.getItem(ROOM_KEY)
    if (profile && typeof profile.displayName === "string" && profile.displayName.trim()) {
      return { profile, roomId }
    }
  } catch {
    // 存储损坏就当没存过
  }
  return { profile: null, roomId: null }
}

export default function App() {
  const stored = loadStoredState()
  const [profile, setProfile] = useState<Profile | null>(stored.profile)
  const [roomId, setRoomId] = useState<string | null>(
    stored.profile ? stored.roomId : null,
  )
  const [displayName, setDisplayName] = useState(stored.profile?.displayName ?? "")
  const [language, setLanguage] = useState<LanguageCode>(stored.profile?.language ?? "zh")

  useEffect(() => {
    if (profile) localStorage.setItem(PROFILE_KEY, JSON.stringify(profile))
  }, [profile])

  useEffect(() => {
    if (roomId) localStorage.setItem(ROOM_KEY, roomId)
    else localStorage.removeItem(ROOM_KEY)
  }, [roomId])

  const room = roomId ? BUILTIN_ROOMS.find((r) => r.id === roomId) : undefined

  if (profile && room) {
    return (
      <Chat
        roomId={room.id}
        displayName={profile.displayName}
        language={profile.language}
        onLeave={() => setRoomId(null)}
      />
    )
  }

  if (profile) {
    return (
      <main className="setup">
        <h1>WorldChat</h1>
        <p className="subtitle">
          你好，{profile.displayName}！挑个房间开聊吧。
        </p>
        <div className="rooms">
          <h2>房间</h2>
          <ul>
            {BUILTIN_ROOMS.map((r) => (
              <li key={r.id}>
                <button className="room-item" onClick={() => setRoomId(r.id)}>
                  <span className="room-title">{r.title}</span>
                  <span className="room-topic">{r.topic}</span>
                </button>
              </li>
            ))}
          </ul>
          <button className="link" onClick={() => setProfile(null)}>
            换个身份
          </button>
        </div>
      </main>
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
          if (!displayName.trim()) return
          setProfile({ displayName: displayName.trim(), language })
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

        <button type="submit">继续</button>
      </form>
    </main>
  )
}
