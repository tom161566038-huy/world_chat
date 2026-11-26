/**
 * 房间主题背景（阶段 16）：内置 8 个手写 SVG 场景的前后端共用白名单。
 * theme 缺省 = 无背景；内置场景不引外链图片，免版权、几 KB。
 * 房主上传的自定义图片不在这里——它是 dataURL，存各房间 DO 的 bg 键。
 */

export type RoomThemeId =
  | "beach"
  | "grassland"
  | "woods"
  | "city"
  | "playground"
  | "classroom"
  | "home"
  | "jail"

/** 白名单（顺序即建房表单/背景面板的展示顺序）。 */
export const ROOM_THEME_IDS: readonly RoomThemeId[] = [
  "beach",
  "grassland",
  "woods",
  "city",
  "playground",
  "classroom",
  "home",
  "jail",
]

const ROOM_THEME_ID_SET: ReadonlySet<string> = new Set(ROOM_THEME_IDS)

/** 校验任意输入是否为合法主题 id（服务端不信任客户端传来的 theme）。 */
export function isRoomThemeId(value: unknown): value is RoomThemeId {
  return typeof value === "string" && ROOM_THEME_ID_SET.has(value)
}
