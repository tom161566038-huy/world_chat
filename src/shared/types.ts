/** 前后端共用的领域类型。实现时不要在 client / worker 各自再定义一份。 */

export type LanguageCode = string

export interface UserProfile {
  id: string
  displayName: string
  language: LanguageCode
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
