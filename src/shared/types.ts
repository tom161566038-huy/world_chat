/** 前后端共用的领域类型。实现时不要在 client / worker 各自再定义一份。 */

export type LanguageCode = string

/**
 * 本地身份档案（游客身份阶段）：存浏览器 localStorage，不上服务器。
 * - guestSuffix：由 visitorId 稳定派生的 4 位短号，同一身份不变；
 *   未自定义昵称时显示名 = 本地化「游客」前缀 + 短号，切语言只换前缀。
 * - 老档案只有 displayName：加载时迁移为 nickname，不改叫游客名。
 */
export interface Profile {
  language: LanguageCode
  guestSuffix: string
  /** 自定义昵称；空/缺省时用当前语言的游客名。 */
  nickname?: string
  /** ISO 3166-1 alpha-2 国家码（Cloudflare 边缘推断，客户端拉 /api/geo 写入）。 */
  countryCode?: string
  /** 头像：data: 图片 URL（已压缩）或预设色 "#rrggbb"；缺省由 visitorId 稳定生成色块。 */
  avatar?: string
  /** 性别码（male/female/other/private），展示时按观看者语言本地化。 */
  gender?: string
  /** 13–120 的整数，选填。 */
  age?: number
  job?: string
  hobbies?: string
  bio?: string
}

/**
 * 广播给同房间其他人的紧凑档案（按 userId 存一份，不嵌进每条消息）：
 * 历史消息用发送者的档案来显示头像和国旗。
 */
export interface RoomMemberProfile {
  userId: string
  displayName: string
  countryCode?: string
  avatar?: string
  gender?: string
  age?: number
  job?: string
  hobbies?: string
  bio?: string
  /** AI 场景房里的 AI 伙伴（阶段 15）：前端据此显示 AI 徽章、隐藏举报入口。 */
  isAi?: boolean
}

/** AI 场景房的伙伴人设（阶段 15）：senderName 展示用，systemPrompt 为英文人设。 */
export interface RoomAi {
  senderName: string
  systemPrompt: string
}

export interface Room {
  id: string
  slug: string
  title: string
  topic: string
  createdAt: number
  /** builtin = 内置常开房间；user = 用户自建、限时开放（阶段 9）。缺省视为 builtin。 */
  kind?: "builtin" | "user"
  /** 自建房间的关闭时间（毫秒时间戳）；已过此刻即关闭。内置房间无此字段。 */
  closesAt?: number
  /** 自建房间创建者的显示名，仅展示用，不构成任何管理权限。 */
  createdByName?: string
  /** 当前在房人数（列表/标题展示用，随连接变化、可能短暂滞后）。 */
  occupantCount?: number
  /** AI 场景房的人设（阶段 15）：有此字段的内置房会有 AI 伙伴参与对话。 */
  ai?: RoomAi
}

export interface ChatMessage {
  id: string
  roomId: string
  senderId: string
  senderName: string
  sourceLang: LanguageCode
  sourceText: string
  createdAt: number
}

export interface MessageTranslation {
  messageId: string
  targetLang: LanguageCode
  text: string
  provider: string
  createdAt: number
}
