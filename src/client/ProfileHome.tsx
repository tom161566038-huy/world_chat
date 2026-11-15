/**
 * 用户主页（应用内视图状态，不新增路由）：比资料卡更从容的完整资料页 ——
 * 更大头像、显示名 + 国旗、全部已填字段与完整简介。盖在聊天现场之上，
 * 关掉即回到房间（连接与消息不中断）。数据来自房间已有的成员档案。
 */
import type { LanguageCode, RoomMemberProfile } from "../shared/types"
import Avatar from "./Avatar"
import { flagEmoji, profileFieldRows } from "./profile"
import { t } from "./i18n"

export default function ProfileHome({
  member,
  language,
  isSelf,
  onBack,
  onEditProfile,
}: {
  member: RoomMemberProfile
  language: LanguageCode
  /** 看的是自己：额外给「编辑资料」入口，打开已有设置面板。 */
  isSelf: boolean
  onBack: () => void
  onEditProfile: () => void
}) {
  const flag = flagEmoji(member.countryCode)
  const rows = profileFieldRows(language, member)

  return (
    <div className="profile-home" role="dialog" aria-label={member.displayName}>
      <div className="profile-home-inner">
        <div className="profile-head">
          <Avatar
            avatar={member.avatar}
            seed={member.userId}
            label={member.displayName}
            size={96}
          />
          <span className="profile-name profile-name-lg">
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
        <div className="form-actions profile-home-actions">
          {isSelf && (
            <button type="button" className="link" onClick={onEditProfile}>
              {t(language, "editProfile")}
            </button>
          )}
          <button type="button" className="profile-home-back" onClick={onBack}>
            {t(language, "backToChat")}
          </button>
        </div>
      </div>
    </div>
  )
}
