/**
 * 设置面板（游客身份阶段）：随时可改的选填资料——头像、昵称、性别、年龄、
 * 工作、喜好、简介。不填也能聊天；昵称清空回到当前语言的游客名（短号不变）。
 * 全部存本地档案，保存后由上层广播给同房间的人。
 */
import { useRef, useState } from "react"
import type { LanguageCode, Profile } from "../shared/types"
import Avatar from "./Avatar"
import { getVisitorId } from "./api"
import { AVATAR_PRESET_COLORS, compressAvatar, displayNameOf, guestName, stripHtml } from "./profile"
import { t } from "./i18n"

const GENDER_OPTIONS = ["", "male", "female", "other", "private"] as const

function genderOptionLabel(lang: LanguageCode, value: string): string {
  if (value === "male") return t(lang, "genderMale")
  if (value === "female") return t(lang, "genderFemale")
  if (value === "other") return t(lang, "genderOther")
  if (value === "private") return t(lang, "genderPrivate")
  return t(lang, "unsetOption")
}

export default function Settings({
  profile,
  onSave,
  onClose,
}: {
  profile: Profile
  onSave: (next: Profile) => void
  onClose: () => void
}) {
  const lang = profile.language
  const [nickname, setNickname] = useState(profile.nickname ?? "")
  const [gender, setGender] = useState(profile.gender ?? "")
  const [age, setAge] = useState(profile.age !== undefined ? String(profile.age) : "")
  const [job, setJob] = useState(profile.job ?? "")
  const [hobbies, setHobbies] = useState(profile.hobbies ?? "")
  const [bio, setBio] = useState(profile.bio ?? "")
  const [avatar, setAvatar] = useState(profile.avatar ?? "")
  const [avatarError, setAvatarError] = useState(false)
  const [ageError, setAgeError] = useState<"invalid" | "too_young" | null>(null)
  const fileRef = useRef<HTMLInputElement | null>(null)

  const fallbackName = guestName(lang, profile.guestSuffix)

  async function pickAvatarFile(file: File | undefined) {
    if (!file) return
    setAvatarError(false)
    // 客户端压缩裁切：最长边 ≤192px、约 100KB 以内（免费额度友好）
    const data = await compressAvatar(file)
    if (data) setAvatar(data)
    else setAvatarError(true)
  }

  function submit(e: React.FormEvent) {
    e.preventDefault()
    // 年龄：可空；填写则必须是 13–120 的整数，小于 13 不给保存
    const trimmedAge = age.trim()
    let ageValue: number | undefined
    if (trimmedAge !== "") {
      ageValue = Number(trimmedAge)
      if (!Number.isInteger(ageValue) || ageValue < 13 || ageValue > 120) {
        setAgeError(ageValue < 13 && Number.isFinite(ageValue) ? "too_young" : "invalid")
        return
      }
    }
    setAgeError(null)
    const next: Profile = {
      ...profile,
      nickname: nickname.trim() ? nickname.trim().slice(0, 20) : undefined,
      gender: gender || undefined,
      age: ageValue,
      job: stripHtml(job).trim().slice(0, 40) || undefined,
      hobbies: stripHtml(hobbies).trim().slice(0, 80) || undefined,
      bio: stripHtml(bio).trim().slice(0, 200) || undefined,
      avatar: avatar || undefined,
    }
    onSave(next)
    onClose()
  }

  return (
    <div className="overlay" onClick={onClose} role="presentation">
      <form
        className="settings-panel"
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
        role="dialog"
        aria-label={t(lang, "settingsTitle")}
      >
        <h2>{t(lang, "settingsTitle")}</h2>

        <div className="settings-row avatar-row">
          <span className="settings-label">{t(lang, "avatarLabel")}</span>
          <div className="avatar-editor">
            <Avatar avatar={avatar} seed={getVisitorId()} label={displayNameOf(profile)} size={48} />
            <div className="avatar-presets">
              {AVATAR_PRESET_COLORS.map((color) => (
                <button
                  type="button"
                  key={color}
                  className={`swatch${avatar.toLowerCase() === color ? " selected" : ""}`}
                  style={{ backgroundColor: color }}
                  onClick={() => setAvatar(color)}
                  aria-label={color}
                />
              ))}
            </div>
            <div className="avatar-actions">
              <button type="button" className="toggle" onClick={() => fileRef.current?.click()}>
                {t(lang, "avatarUpload")}
              </button>
              <button type="button" className="toggle" onClick={() => setAvatar("")}>
                {t(lang, "avatarReset")}
              </button>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => {
                void pickAvatarFile(e.target.files?.[0])
                e.target.value = ""
              }}
            />
          </div>
        </div>
        {avatarError && <p className="settings-error">{t(lang, "avatarTooLarge")}</p>}
        <p className="settings-hint">{t(lang, "avatarHint")}</p>

        <label className="settings-row">
          <span className="settings-label">{t(lang, "nicknameLabel")}</span>
          <input
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            placeholder={fallbackName}
            maxLength={20}
          />
        </label>
        <p className="settings-hint">{t(lang, "nicknameHint", { name: fallbackName })}</p>

        <label className="settings-row">
          <span className="settings-label">{t(lang, "genderLabel")}</span>
          <select value={gender} onChange={(e) => setGender(e.target.value)}>
            {GENDER_OPTIONS.map((value) => (
              <option key={value} value={value}>
                {genderOptionLabel(lang, value)}
              </option>
            ))}
          </select>
        </label>

        <label className="settings-row">
          <span className="settings-label">{t(lang, "ageLabel")}</span>
          <input
            value={age}
            onChange={(e) => setAge(e.target.value)}
            placeholder={t(lang, "agePlaceholder")}
            inputMode="numeric"
          />
        </label>
        {ageError && (
          <p className="settings-error">
            {t(lang, ageError === "too_young" ? "errAgeTooYoung" : "errAgeInvalid")}
          </p>
        )}

        <label className="settings-row">
          <span className="settings-label">{t(lang, "jobLabel")}</span>
          <input value={job} onChange={(e) => setJob(e.target.value)} maxLength={40} />
        </label>

        <label className="settings-row">
          <span className="settings-label">{t(lang, "hobbiesLabel")}</span>
          <input value={hobbies} onChange={(e) => setHobbies(e.target.value)} maxLength={80} />
        </label>

        <label className="settings-row settings-bio">
          <span className="settings-label">{t(lang, "bioLabel")}</span>
          <textarea value={bio} onChange={(e) => setBio(e.target.value)} maxLength={200} rows={3} />
        </label>

        <span className="form-actions">
          <button type="submit">{t(lang, "saveBtn")}</button>
          <button type="button" className="link" onClick={onClose}>
            {t(lang, "cancel")}
          </button>
        </span>
      </form>
    </div>
  )
}
