/** WebSocket 协议。阶段 2 实现时按此扩展，保持向后兼容的字段名。 */

import type { ChatMessage, LanguageCode, MessageTranslation } from "./types"

export type ClientEvent =
  | {
      type: "join"
      roomId: string
      displayName: string
      language: LanguageCode
      /**
       * 浏览器本地持久的访客 id（阶段 10）：仅用作发送/举报限流的跨连接键，
       * 不参与消息归属；缺省时服务端退回按连接隔离。
       */
      visitorId?: string
    }
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
  /**
   * 在房人数（阶段 9）：有人 join/离开/断开时广播给房内所有人，
   * 人数以该房间 DO 当前 WebSocket 会话数为准；新加入的连接也会先收到一条。
   */
  | { type: "presence"; count: number }
  /** 自建房间到点关闭（阶段 9）：收到后不能再发言，服务端随后会断开连接。 */
  | { type: "room_closed" }
  | { type: "error"; code: string; message: string }
  | { type: "reported"; ok: true }
