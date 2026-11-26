/**
 * 内置房间主题场景（阶段 16）：8 个手写 SVG 矢量场景，免版权、几 KB。
 * 全部浅色系 + 基本形状，聊天页铺满当半透明背景墙，建房表单/背景面板
 * 里复用同一组件当缩略图。viewBox 统一 0 0 800 600、slice 裁切，
 * 容器（.chat-bg / .theme-thumb）负责尺寸与圆角。
 */
import type { RoomThemeId } from "../shared/roomThemes"
import type { LanguageCode } from "../shared/types"
import { t } from "./i18n"

/** 主题名对应的 i18n key（themeDefault 不在选项里，单独处理）。 */
type ThemeLabelKey =
  | "themeBeach"
  | "themeGrassland"
  | "themeWoods"
  | "themeCity"
  | "themePlayground"
  | "themeClassroom"
  | "themeHome"
  | "themeJail"

const SVG_PROPS = {
  viewBox: "0 0 800 600",
  preserveAspectRatio: "xMidYMid slice",
  "aria-hidden": true as const,
}

function BeachScene() {
  return (
    <svg {...SVG_PROPS}>
      <rect width="800" height="600" fill="#e3f1f7" />
      <circle cx="640" cy="110" r="52" fill="#f8e3ad" />
      <path d="M120 96 q14 -12 28 0 q14 12 28 0" fill="none" stroke="#b9d3de" strokeWidth="4" strokeLinecap="round" />
      <path d="M520 70 q14 -12 28 0 q14 12 28 0" fill="none" stroke="#b9d3de" strokeWidth="4" strokeLinecap="round" />
      <rect y="300" width="800" height="140" fill="#bfe3ec" />
      <path d="M0 320 q50 -12 100 0 t100 0 t100 0 t100 0 t100 0 t100 0 t100 0 t100 0 t100 0" fill="none" stroke="#a9d3e0" strokeWidth="5" />
      <path d="M0 380 q60 -12 120 0 t120 0 t120 0 t120 0 t120 0 t120 0 t120 0" fill="none" stroke="#a9d3e0" strokeWidth="5" />
      <path d="M0 440 h800 v160 h-800 z" fill="#f3e6c9" />
      <path d="M0 440 q200 -14 400 0 t400 0 v18 q-200 -12 -400 0 t-400 0 z" fill="#ecd9b4" />
      {/* 沙滩伞 */}
      <path d="M560 300 v-120" stroke="#b78a5a" strokeWidth="8" strokeLinecap="round" />
      <path d="M500 180 q60 -66 120 0 z" fill="#e6a08b" />
      <path d="M540 180 q20 -44 40 -58 q20 24 40 58 z" fill="#f3c9b8" />
      <circle cx="180" cy="510" r="16" fill="#e8d9b6" />
      <circle cx="230" cy="540" r="10" fill="#e6d5ae" />
    </svg>
  )
}

function GrasslandScene() {
  return (
    <svg {...SVG_PROPS}>
      <rect width="800" height="600" fill="#e9f3f8" />
      <circle cx="150" cy="120" r="46" fill="#f8e3ad" />
      <ellipse cx="480" cy="110" rx="64" ry="24" fill="#ffffff" />
      <ellipse cx="530" cy="122" rx="48" ry="19" fill="#f4f8fa" />
      <ellipse cx="660" cy="180" rx="50" ry="18" fill="#ffffff" />
      <path d="M0 340 q200 -70 400 -10 t400 -30 v300 h-800 z" fill="#d7e9c6" />
      <path d="M0 420 q260 -50 520 6 t280 -14 v188 h-800 z" fill="#c8e0b2" />
      <path d="M140 470 q3 -34 8 -44 M148 470 q-6 -30 0 -46 M156 470 q8 -28 4 -44" stroke="#a8c98d" strokeWidth="5" strokeLinecap="round" fill="none" />
      <path d="M600 500 q3 -30 7 -38 M607 500 q-5 -26 0 -40 M614 500 q7 -24 3 -38" stroke="#a8c98d" strokeWidth="5" strokeLinecap="round" fill="none" />
      <circle cx="360" cy="430" r="9" fill="#f2d65f" />
      <circle cx="390" cy="452" r="8" fill="#f2d65f" />
      <circle cx="700" cy="560" r="10" fill="#f2d65f" />
    </svg>
  )
}

function WoodsScene() {
  return (
    <svg {...SVG_PROPS}>
      <rect width="800" height="600" fill="#eef4e7" />
      <rect y="470" width="800" height="130" fill="#dcebcd" />
      <circle cx="170" cy="180" r="86" fill="#cfe2ba" />
      <circle cx="255" cy="215" r="66" fill="#c2d9aa" />
      <rect x="196" y="250" width="22" height="230" rx="8" fill="#cdb79c" />
      <circle cx="620" cy="150" r="76" fill="#cfe2ba" />
      <circle cx="695" cy="195" r="58" fill="#c2d9aa" />
      <rect x="642" y="230" width="20" height="250" rx="8" fill="#cdb79c" />
      <circle cx="410" cy="300" r="60" fill="#d8e7c6" />
      <circle cx="455" cy="330" r="44" fill="#c8dcB0" />
      <rect x="424" y="340" width="16" height="140" rx="7" fill="#cdb79c" />
      <ellipse cx="120" cy="500" rx="70" ry="12" fill="#c5dcae" />
      <ellipse cx="680" cy="540" rx="60" ry="10" fill="#c5dcae" />
      <path d="M60 120 q12 -10 24 0 q12 10 24 0" fill="none" stroke="#bccfae" strokeWidth="4" strokeLinecap="round" />
    </svg>
  )
}

function CityScene() {
  return (
    <svg {...SVG_PROPS}>
      <rect width="800" height="600" fill="#e7edf5" />
      <circle cx="120" cy="120" r="44" fill="#f5deb0" />
      <ellipse cx="560" cy="100" rx="70" ry="22" fill="#f2f5f8" />
      <rect x="40" y="240" width="130" height="360" fill="#c4cfdd" />
      <rect x="190" y="170" width="110" height="430" fill="#aebccf" />
      <rect x="320" y="260" width="150" height="340" fill="#c9d4e0" />
      <rect x="490" y="140" width="120" height="460" fill="#b5c3d6" />
      <rect x="630" y="230" width="130" height="370" fill="#c4cfdd" />
      <rect y="560" width="800" height="40" fill="#bcc7d3" />
      {[
        [62, 270], [102, 270], [62, 320], [102, 320], [62, 370], [102, 370],
        [62, 420], [102, 420], [62, 470], [102, 470],
      ].map(([x, y]) => (
        <rect key={`a${x}${y}`} x={x} y={y} width="22" height="28" rx="3" fill="#e9eff6" />
      ))}
      {[[212, 200], [252, 200], [212, 260], [252, 260], [212, 320], [252, 320], [212, 380], [252, 380]].map(
        ([x, y]) => (
          <rect key={`b${x}${y}`} x={x} y={y} width="20" height="26" rx="3" fill="#e9eff6" />
        ),
      )}
      {[[344, 292], [388, 292], [432, 292], [344, 350], [388, 350], [432, 350], [344, 408], [432, 408]].map(
        ([x, y]) => (
          <rect key={`c${x}${y}`} x={x} y={y} width="24" height="30" rx="3" fill="#eef3f8" />
        ),
      )}
      {[[512, 175], [556, 175], [512, 235], [556, 235], [512, 295], [556, 295], [556, 355]].map(([x, y]) => (
        <rect key={`d${x}${y}`} x={x} y={y} width="22" height="28" rx="3" fill="#e9eff6" />
      ))}
      {[[652, 262], [696, 262], [652, 322], [696, 322], [652, 382], [696, 382]].map(([x, y]) => (
        <rect key={`e${x}${y}`} x={x} y={y} width="24" height="30" rx="3" fill="#eef3f8" />
      ))}
    </svg>
  )
}

function PlaygroundScene() {
  return (
    <svg {...SVG_PROPS}>
      <rect width="800" height="600" fill="#fdf2e4" />
      <circle cx="670" cy="100" r="46" fill="#f8dca4" />
      <path d="M110 100 q14 -12 28 0 q14 12 28 0" fill="none" stroke="#e4cfae" strokeWidth="4" strokeLinecap="round" />
      <rect y="430" width="800" height="170" fill="#dceccb" />
      {/* 滑梯 */}
      <path d="M150 180 h96" stroke="#c98d6b" strokeWidth="10" strokeLinecap="round" />
      <path d="M162 180 v250 M234 180 v250" stroke="#c98d6b" strokeWidth="10" strokeLinecap="round" />
      <path d="M270 210 q40 130 96 220" fill="none" stroke="#de9f7e" strokeWidth="14" strokeLinecap="round" />
      {/* 秋千 */}
      <path d="M480 190 h140" stroke="#8fa3b8" strokeWidth="10" strokeLinecap="round" />
      <path d="M508 190 v180 M592 190 v180" stroke="#8fa3b8" strokeWidth="8" />
      <rect x="492" y="362" width="116" height="12" rx="6" fill="#dfab7e" />
      <path d="M494 368 h112" stroke="#8fa3b8" strokeWidth="6" />
      {/* 皮球 */}
      <circle cx="390" cy="520" r="26" fill="#e2a9a0" />
      <path d="M364 520 a26 26 0 0 0 52 0" fill="#f0c9c2" />
      <circle cx="700" cy="540" r="18" fill="#a9c4b2" />
    </svg>
  )
}

function ClassroomScene() {
  return (
    <svg {...SVG_PROPS}>
      <rect width="800" height="600" fill="#f4eee0" />
      <rect y="470" width="800" height="130" fill="#e6d9c2" />
      {/* 黑板 */}
      <rect x="170" y="110" width="460" height="260" rx="10" fill="#cdb79a" />
      <rect x="186" y="126" width="428" height="228" rx="6" fill="#b9d0b2" />
      <path d="M220 170 h150 M220 200 h220 M220 230 h120" stroke="#7f9a78" strokeWidth="6" strokeLinecap="round" />
      <path d="M560 320 q-20 -30 0 -60 q20 -30 0 -60" fill="none" stroke="#8fb086" strokeWidth="4" />
      <rect x="540" y="146" width="52" height="14" rx="7" fill="#d9c8a8" />
      <rect x="360" y="140" width="80" height="14" rx="7" fill="#d9c8a8" />
      {/* 讲台 */}
      <rect x="330" y="400" width="140" height="16" rx="6" fill="#cfae7f" />
      <rect x="348" y="416" width="12" height="54" fill="#c2a172" />
      <rect x="440" y="416" width="12" height="54" fill="#c2a172" />
      {/* 课桌 */}
      <rect x="80" y="440" width="120" height="12" rx="5" fill="#cfae7f" />
      <rect x="92" y="452" width="10" height="40" fill="#c2a172" />
      <rect x="178" y="452" width="10" height="40" fill="#c2a172" />
      <rect x="600" y="440" width="120" height="12" rx="5" fill="#cfae7f" />
      <rect x="612" y="452" width="10" height="40" fill="#c2a172" />
      <rect x="698" y="452" width="10" height="40" fill="#c2a172" />
      {/* 时钟 */}
      <circle cx="80" cy="80" r="34" fill="#fffcf8" stroke="#d8c9ad" strokeWidth="6" />
      <path d="M80 80 v-20 M80 80 h14" stroke="#8a847a" strokeWidth="4" strokeLinecap="round" />
    </svg>
  )
}

function HomeScene() {
  return (
    <svg {...SVG_PROPS}>
      <rect width="800" height="600" fill="#f7ece0" />
      <rect y="470" width="800" height="130" fill="#e9d9c4" />
      {/* 窗 */}
      <rect x="110" y="110" width="180" height="150" rx="8" fill="#c9b394" />
      <rect x="124" y="124" width="152" height="122" rx="4" fill="#d8ecf4" />
      <path d="M200 124 v122 M124 185 h152" stroke="#c9b394" strokeWidth="10" />
      <circle cx="165" cy="155" r="16" fill="#f5deb0" />
      <path d="M130 232 q18 -10 36 0 t36 0 t36 0 t36 0" fill="none" stroke="#b9dbe8" strokeWidth="5" />
      {/* 沙发 */}
      <rect x="440" y="300" width="240" height="66" rx="18" fill="#dfb98f" />
      <rect x="424" y="336" width="34" height="90" rx="14" fill="#d5ae83" />
      <rect x="662" y="336" width="34" height="90" rx="14" fill="#d5ae83" />
      <rect x="452" y="360" width="216" height="70" rx="12" fill="#e8c8a3" />
      <rect x="474" y="336" width="60" height="26" rx="12" fill="#f0d9bd" />
      <rect x="586" y="336" width="60" height="26" rx="12" fill="#f0d9bd" />
      {/* 落地灯 */}
      <path d="M690 470 v-130" stroke="#b79a76" strokeWidth="8" />
      <path d="M660 340 h60 l-30 -60 z" fill="#f3dcb0" />
      {/* 地毯 */}
      <ellipse cx="560" cy="520" rx="180" ry="26" fill="#e3cdb0" />
      <ellipse cx="560" cy="520" rx="130" ry="17" fill="#ecd9c1" />
      {/* 盆栽 */}
      <path d="M120 430 h64 l-8 60 h-48 z" fill="#cf9a72" />
      <circle cx="152" cy="400" r="34" fill="#b3d0a0" />
      <circle cx="134" cy="420" r="22" fill="#c2dcae" />
    </svg>
  )
}

function JailScene() {
  return (
    <svg {...SVG_PROPS}>
      <rect width="800" height="600" fill="#d3d8de" />
      <rect y="500" width="800" height="100" fill="#c2c8d0" />
      {/* 高窗 */}
      <rect x="310" y="70" width="180" height="120" rx="8" fill="#9aa4b0" />
      <rect x="322" y="82" width="156" height="96" fill="#aebfcc" />
      <path d="M400 82 v96 M322 130 h156" stroke="#9aa4b0" strokeWidth="10" />
      <path d="M352 150 q24 -20 48 0 q24 20 48 0" fill="none" stroke="#93b8cc" strokeWidth="5" />
      {/* 铁栏 */}
      <path d="M80 0 v600 M200 0 v600 M320 0 v600 M440 0 v600 M560 0 v600 M680 0 v600" stroke="#7d8894" strokeWidth="18" />
      <path d="M0 190 h800 M0 400 h800" stroke="#7d8894" strokeWidth="14" />
      {/* 草垫 */}
      <rect x="500" y="470" width="200" height="26" rx="10" fill="#b9a98c" />
      {/* 油灯 */}
      <path d="M180 380 h44" stroke="#8b939e" strokeWidth="8" strokeLinecap="round" />
      <path d="M190 380 v-36 h24 v36" fill="none" stroke="#8b939e" strokeWidth="6" />
      <circle cx="202" cy="342" r="10" fill="#f0d898" />
    </svg>
  )
}

/** 主题选项：展示顺序即 white 顺序，labelKey 对应 i18n 的主题名。 */
export const ROOM_THEME_OPTIONS: ReadonlyArray<{
  id: RoomThemeId
  labelKey: ThemeLabelKey
  Svg: () => React.JSX.Element
}> = [
  { id: "beach", labelKey: "themeBeach", Svg: BeachScene },
  { id: "grassland", labelKey: "themeGrassland", Svg: GrasslandScene },
  { id: "woods", labelKey: "themeWoods", Svg: WoodsScene },
  { id: "city", labelKey: "themeCity", Svg: CityScene },
  { id: "playground", labelKey: "themePlayground", Svg: PlaygroundScene },
  { id: "classroom", labelKey: "themeClassroom", Svg: ClassroomScene },
  { id: "home", labelKey: "themeHome", Svg: HomeScene },
  { id: "jail", labelKey: "themeJail", Svg: JailScene },
]

/** 主题名（本地化）；「默认（无背景）」不在选项里，调用方单独用 themeDefault。 */
export function themeLabel(language: LanguageCode, id: RoomThemeId): string {
  const option = ROOM_THEME_OPTIONS.find((o) => o.id === id)
  return option ? t(language, option.labelKey) : id
}
