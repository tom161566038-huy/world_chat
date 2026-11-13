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
