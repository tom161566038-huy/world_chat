/** WebSocket 协议。阶段 2 实现时按此扩展，保持向后兼容的字段名。 */

import type { ChatMessage, LanguageCode, MessageTranslation } from "./types"

export type ClientEvent =
  | {
      type: "join"
      roomId: string
      displayName: string
      language: LanguageCode
      /**
       * 浏览器本地持久的访客 id（阶段 10 引入、阶段 11 升格为稳定身份）：
       * 校验合法后作为该访客的 userId（消息归属、presence、限流统一），
       * 缺省或非法时服务端退回本连接的临时随机 id。
       */
      visitorId?: string
      /**
       * 重连补拉游标（阶段 11）：客户端已收到的最大消息 seq，
       * 服务端下发 seq 大于它的消息；缺省时回退为「最近 N 条历史」。
       */
      lastSeq?: number
    }
  | { type: "leave"; roomId: string }
  | { type: "send"; roomId: string; text: string; sourceLang: LanguageCode }
  | { type: "report"; messageId?: string; userId?: string; reason: string }

export type ServerEvent =
  | { type: "joined"; roomId: string; userId: string }
  | { type: "message"; message: ChatMessage; seq: number }
  | {
      type: "history"
      messages: Array<{
        message: ChatMessage
        translation?: MessageTranslation
        /** 消息序号（阶段 11）：客户端记下最大的作为重连补拉游标。 */
        seq: number
      }>
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
