/**
 * 房间主题背景（阶段 16，2026-11-26 定稿）：内置主题 = 80 张打包进仓库的
 * 真实照片（世界各地的风景与室内，授权见 public/themes/CREDITS.md，
 * 由静态资源同源伺服，不依赖外链）。theme 缺省 = 无背景；
 * 房主上传的自定义图片是 dataURL，存各房间 DO 的 bg 键。
 */

export type RoomThemeId =
  // 中国与世界名胜（外景）
  | "jiuzhaigou"
  | "snowmountain"
  | "beach"
  | "bund"
  | "nyc"
  | "santorini"
  | "greatwall"
  | "guilin"
  | "zhangjiajie"
  | "westlake"
  | "huangshan"
  | "desert"
  | "hongkong"
  // 东亚
  | "kyoto"
  | "tokyo"
  | "mountfuji"
  | "tatami"
  | "cherryblossom"
  | "bamboo"
  | "seoul"
  // 欧美城市
  | "paris"
  | "london"
  | "venice"
  | "rome"
  | "prague"
  | "vienna"
  | "amsterdam"
  | "barcelona"
  | "istanbul"
  | "sydney"
  | "dubai"
  // 室内（城市感）
  | "cafe"
  | "library"
  | "bedroom"
  // 自然奇观
  | "alps"
  | "fjord"
  | "iceland"
  | "aurora"
  | "milkyway"
  | "waterfall"
  | "lakereflect"
  | "autumn"
  | "snowvillage"
  | "forest"
  | "lavender"
  | "maldives"
  | "reef"
  | "savanna"
  // 世界地标与奇景
  | "rio"
  | "cairo"
  | "machu"
  | "petra"
  | "angkor"
  | "bali"
  | "bangkok"
  | "singapore"
  | "morocco"
  | "capetown"
  | "glacier"
  | "antelope"
  | "grandcanyon"
  | "volcano"
  | "uyuni"
  | "danxia"
  // 室内（家与温馨）
  | "home"
  | "villa"
  | "castle"
  | "farmhouse"
  | "chinagarden"
  | "chinaroom"
  | "dinner"
  | "bonfire"
  | "fireplace"
  | "kitchen"
  | "loft"
  | "onsen"
  | "arctic"
  | "tulip"
  | "terraces"
  | "lighthouse"

/** 白名单（顺序即建房表单/背景面板的展示顺序）。 */
export const ROOM_THEME_IDS: readonly RoomThemeId[] = [
  "jiuzhaigou",
  "snowmountain",
  "beach",
  "bund",
  "nyc",
  "santorini",
  "greatwall",
  "guilin",
  "zhangjiajie",
  "westlake",
  "huangshan",
  "desert",
  "hongkong",
  "kyoto",
  "tokyo",
  "mountfuji",
  "tatami",
  "cherryblossom",
  "bamboo",
  "seoul",
  "paris",
  "london",
  "venice",
  "rome",
  "prague",
  "vienna",
  "amsterdam",
  "barcelona",
  "istanbul",
  "sydney",
  "dubai",
  "cafe",
  "library",
  "bedroom",
  "alps",
  "fjord",
  "iceland",
  "aurora",
  "milkyway",
  "waterfall",
  "lakereflect",
  "autumn",
  "snowvillage",
  "forest",
  "lavender",
  "maldives",
  "reef",
  "savanna",
  "rio",
  "cairo",
  "machu",
  "petra",
  "angkor",
  "bali",
  "bangkok",
  "singapore",
  "morocco",
  "capetown",
  "glacier",
  "antelope",
  "grandcanyon",
  "volcano",
  "uyuni",
  "danxia",
  "home",
  "villa",
  "castle",
  "farmhouse",
  "chinagarden",
  "chinaroom",
  "dinner",
  "bonfire",
  "fireplace",
  "kitchen",
  "loft",
  "onsen",
  "arctic",
  "tulip",
  "terraces",
  "lighthouse",
]

const ROOM_THEME_ID_SET: ReadonlySet<string> = new Set(ROOM_THEME_IDS)

/** 校验任意输入是否为合法主题 id（服务端不信任客户端传来的 theme）。 */
export function isRoomThemeId(value: unknown): value is RoomThemeId {
  return typeof value === "string" && ROOM_THEME_ID_SET.has(value)
}
