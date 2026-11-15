/**
 * 头像组件（游客身份阶段）：
 * - data: 图片（上传压缩后的）→ <img>；
 * - 预设色 "#rrggbb" → 色块 + 显示名首字母；
 * - 缺省 → 由 seed（visitorId/userId）稳定派生的色块，同一人永远同色。
 * 不依赖外链字体或图床；点击行为（打开资料卡）由调用方给 onClick。
 */
import { defaultAvatarColor } from "./profile"

export default function Avatar({
  avatar,
  seed,
  label,
  size = 24,
  onClick,
  title,
}: {
  avatar?: string
  /** 稳定种子：自己用 visitorId，别人用 userId。 */
  seed: string
  /** 取首字母用显示名。 */
  label: string
  size?: number
  onClick?: () => void
  title?: string
}) {
  const initial = (label.trim()[0] ?? "?").toUpperCase()
  const style = { width: size, height: size, fontSize: Math.round(size * 0.45) }

  const inner =
    avatar && avatar.startsWith("data:image/") ? (
      <img className="avatar avatar-img" style={style} src={avatar} alt="" />
    ) : (
      <span
        className="avatar avatar-color"
        style={{
          ...style,
          backgroundColor:
            avatar && /^#[0-9a-f]{6}$/i.test(avatar) ? avatar : defaultAvatarColor(seed),
        }}
        aria-hidden="true"
      >
        {initial}
      </span>
    )

  if (!onClick) return inner
  return (
    <button type="button" className="avatar-btn" onClick={onClick} title={title} aria-label={label}>
      {inner}
    </button>
  )
}
