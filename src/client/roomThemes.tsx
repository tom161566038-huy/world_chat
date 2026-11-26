/**
 * 房间主题背景（阶段 16，2026-11-26 定稿）：80 个真实照片主题，
 * 图片打包在 public/themes/（大图 {id}.jpg / 缩略图 {id}-thumb.jpg），
 * 由静态资源同源伺服，授权见 public/themes/CREDITS.md。
 * 本地化名称（兼作缩略图下的一行描述）在 themeNames.ts。
 */
import type { RoomThemeId } from "../shared/roomThemes"
import { ROOM_THEME_IDS } from "../shared/roomThemes"
import type { LanguageCode } from "../shared/types"
import { t } from "./i18n"
import { themeName } from "./themeNames"

export interface RoomThemeOption {
  id: RoomThemeId
  photo: string
  thumb: string
}

const optionOf = (id: RoomThemeId): RoomThemeOption => ({
  id,
  photo: `/themes/${id}.jpg`,
  thumb: `/themes/${id}-thumb.jpg`,
})

/** 主题选项，顺序与 shared 白名单一致。 */
export const ROOM_THEME_OPTIONS: ReadonlyArray<RoomThemeOption> = ROOM_THEME_IDS.map(optionOf)

/**
 * 主题选择器（公共控件）：建房表单与聊天页背景面板共用。
 * value = undefined 表示默认（无背景）；onPick 回传选中的 id 或 undefined。
 * 每张缩略图下方带一行本地化描述（超长由 CSS 截为最多两行）。
 */
export function ThemePicker({
  language,
  value,
  onPick,
}: {
  language: LanguageCode
  value: RoomThemeId | undefined
  onPick: (id: RoomThemeId | undefined) => void
}) {
  return (
    <div className="theme-picker" role="radiogroup" aria-label={t(language, "themeLabel")}>
      <button
        type="button"
        className={value === undefined ? "theme-thumb theme-thumb--active" : "theme-thumb"}
        role="radio"
        aria-checked={value === undefined}
        title={t(language, "themeDefault")}
        onClick={() => onPick(undefined)}
      >
        <span className="theme-thumb-none" aria-hidden="true">
          —
        </span>
        <span className="theme-thumb-caption">{t(language, "themeDefault")}</span>
      </button>
      {ROOM_THEME_OPTIONS.map(({ id, thumb }) => (
        <button
          type="button"
          key={id}
          className={value === id ? "theme-thumb theme-thumb--active" : "theme-thumb"}
          role="radio"
          aria-checked={value === id}
          title={themeName(language, id)}
          onClick={() => onPick(id)}
        >
          <img src={thumb} alt={themeName(language, id)} loading="lazy" />
          <span className="theme-thumb-caption">{themeName(language, id)}</span>
        </button>
      ))}
    </div>
  )
}
