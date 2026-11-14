import type { Room } from "./types"

/**
 * 内置话题房间，前后端共用：始终开放、不限时、不可关闭（阶段 9 拍板）。
 * 自建房间不在这里，由 RoomDirectoryDurableObject 管理。
 */
export const BUILTIN_ROOMS: Room[] = [
  { id: "lobby", slug: "lobby", title: "大厅", topic: "自由聊天，认识来自世界的朋友", createdAt: 0, kind: "builtin" },
  { id: "travel", slug: "travel", title: "旅行", topic: "分享目的地、攻略和路上的故事", createdAt: 0, kind: "builtin" },
  { id: "food", slug: "food", title: "美食", topic: "聊聊各地好吃的和家常菜", createdAt: 0, kind: "builtin" },
  { id: "language", slug: "language", title: "语言交换", topic: "互相教学，练口语练写作", createdAt: 0, kind: "builtin" },
]

/** 允许连接的房间 id 集合，Worker 路由时校验用。 */
export const BUILTIN_ROOM_IDS: ReadonlySet<string> = new Set(BUILTIN_ROOMS.map((room) => room.id))
