import type { Room } from "./types"

/**
 * 第一版内置话题房间，前后端共用。
 * 阶段 3 的房间列表直接来自这里；以后要支持自建房间再改为从存储读取。
 */
export const BUILTIN_ROOMS: Room[] = [
  { id: "lobby", slug: "lobby", title: "大厅", topic: "自由聊天，认识来自世界的朋友", createdAt: 0 },
  { id: "travel", slug: "travel", title: "旅行", topic: "分享目的地、攻略和路上的故事", createdAt: 0 },
  { id: "food", slug: "food", title: "美食", topic: "聊聊各地好吃的和家常菜", createdAt: 0 },
  { id: "language", slug: "language", title: "语言交换", topic: "互相教学，练口语练写作", createdAt: 0 },
]

/** 允许连接的房间 id 集合，Worker 路由时校验用。 */
export const BUILTIN_ROOM_IDS: ReadonlySet<string> = new Set(BUILTIN_ROOMS.map((room) => room.id))
