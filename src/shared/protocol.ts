/** WebSocket 协议。阶段 2 实现时按此扩展，保持向后兼容的字段名。 */

import type { ChatMessage, LanguageCode, MessageTranslation } from "./types"

export type ClientEvent =
  | { type: "join"; roomId: string; displayName: string; language: LanguageCode }
  | { type: "leave"; roomId: string }
  | { type: "send"; roomId: string; text: string; sourceLang: LanguageCode }
  | { type: "report"; messageId?: string; userId?: string; reason: string }

export type ServerEvent =
  | { type: "joined"; roomId: string; userId: string }
  | { type: "message"; message: ChatMessage }
  | {
      type: "history"
      messages: Array<{ message: ChatMessage; translation?: MessageTranslation }>
    }
  /** 译文在原文广播后异步送达：只发给需要该目标语言的连接。 */
  | { type: "translation"; translation: MessageTranslation }
  /**
   * 翻译失败信号（阶段 8）：整条 Provider 链都失败时发给对应语言的连接，
   * 前端据此显示「翻译暂时不可用」而不是默默只剩原文。
   */
  | { type: "translation_failed"; messageId: string; targetLang: LanguageCode }
  | { type: "error"; code: string; message: string }
  | { type: "reported"; ok: true }
