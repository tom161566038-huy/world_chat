/**
 * 轻量资料卡（免费，永远可看）：点聊天里的头像或名字打开，
 * 展示对方已填资料的简略版（简介截断，完整版在主页）；
 * 「查看主页」入口经过统一门禁 canOpenProfileHome。
 */
import type { LanguageCode, RoomMemberProfile } from "../shared/types"
import Avatar from "./Avatar"
import { flagEmoji, profileFieldRows } from "./profile"
import { t } from "./i18n"
import { canOpenProfileHome } from "./profileHomeGate"

export default function ProfileCard({
  member,
  language,
  onClose,
  onOpenHome,
}: {
  member: RoomMemberProfile
  language: LanguageCode
  onClose: () => void
  onOpenHome: (userId: string) => void
}) {
  const flag = flagEmoji(member.countryCode)
  // 简略版：已填字段摘要，长简介统一截断（完整简介在主页）
  const rows = profileFieldRows(language, member, { summarizeBio: true })
  const homeAccess = canOpenProfileHome(member.userId)

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
        <div className="profile-card-actions">
          <button type="button" className="link" onClick={onClose}>
            {t(language, "closeBtn")}
          </button>
          {homeAccess.allowed ? (
            <button
              type="button"
              className="profile-home-btn"
              onClick={() => onOpenHome(member.userId)}
            >
              {t(language, "viewProfileHome")}
            </button>
          ) : (
            // 门禁拒绝时的不可打开状态（现阶段走不到）
            <span className="profile-home-locked" role="note">
              {t(language, "profileHomeLocked")}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
