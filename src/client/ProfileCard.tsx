/**
 * 轻量资料卡（游客身份阶段）：点聊天里的头像或名字打开，
 * 展示对方已填的资料；没填的字段不摆空壳。
 */
import type { LanguageCode, RoomMemberProfile } from "../shared/types"
import Avatar from "./Avatar"
import { flagEmoji } from "./profile"
import { t } from "./i18n"

function genderLabel(lang: LanguageCode, gender?: string): string {
  if (gender === "male") return t(lang, "genderMale")
  if (gender === "female") return t(lang, "genderFemale")
  if (gender === "other") return t(lang, "genderOther")
  if (gender === "private") return t(lang, "genderPrivate")
  return ""
}

export default function ProfileCard({
  member,
  language,
  onClose,
}: {
  member: RoomMemberProfile
  language: LanguageCode
  onClose: () => void
}) {
  const flag = flagEmoji(member.countryCode)
  // 只展示已填的字段（没填的不摆一排空壳）
  const rows: Array<[string, string]> = []
  const gender = genderLabel(language, member.gender)
  if (gender) rows.push([t(language, "genderLabel"), gender])
  if (member.age !== undefined) rows.push([t(language, "ageLabel"), String(member.age)])
  if (member.job) rows.push([t(language, "jobLabel"), member.job])
  if (member.hobbies) rows.push([t(language, "hobbiesLabel"), member.hobbies])
  if (member.bio) rows.push([t(language, "bioLabel"), member.bio])

  return (
    <div className="overlay" onClick={onClose} role="presentation">
      <div
        className="profile-card"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={member.displayName}
      >
        <div className="profile-head">
          <Avatar avatar={member.avatar} seed={member.userId} label={member.displayName} size={48} />
          <span className="profile-name">
            {member.displayName}
            {flag ? <span className="flag"> {flag}</span> : null}
          </span>
        </div>
        {rows.length > 0 ? (
          <dl className="profile-fields">
            {rows.map(([k, v]) => (
              <div className="profile-field" key={k}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="profile-empty">{t(language, "profileCardEmpty")}</p>
        )}
        <button type="button" className="link" onClick={onClose}>
          {t(language, "closeBtn")}
        </button>
      </div>
    </div>
  )
}
