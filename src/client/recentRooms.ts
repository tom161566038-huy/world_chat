/**
 * 最近去过的房间（本地，冷启动/留存）：独立 key，不塞进 profile——
 * 「换个身份」换的是人不是地点，最近房间应保留。
 * 只存 slug / 标题 / 时间，不存消息、IP 或任何身份信息；
 * 最多 8 条，超过 30 天的读取时直接丢弃。
 */
export interface RecentRoom {
  slug: string
  title: string
  visitedAt: number
}

const KEY = "worldchat:recentRooms"
const MAX_ITEMS = 8
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000

/** 读原始记录：结构不对的条目和过期条目都过滤掉，不抛错。 */
function readValid(): RecentRoom[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const list: unknown = JSON.parse(raw)
    if (!Array.isArray(list)) return []
    const now = Date.now()
    return list.filter(
      (item): item is RecentRoom =>
        !!item &&
        typeof (item as RecentRoom).slug === "string" &&
        typeof (item as RecentRoom).title === "string" &&
        typeof (item as RecentRoom).visitedAt === "number" &&
        now - (item as RecentRoom).visitedAt < MAX_AGE_MS,
    )
  } catch {
    return []
  }
}

/** 最近房间（新的在前，最多 8 条）。 */
export function loadRecentRooms(): RecentRoom[] {
  return readValid()
    .sort((a, b) => b.visitedAt - a.visitedAt)
    .slice(0, MAX_ITEMS)
}

/** 成功进入房间时记录：同 slug 去重置顶，时间刷新。 */
export function recordRecentRoom(slug: string, title: string): void {
  const next: RecentRoom[] = [
    { slug, title, visitedAt: Date.now() },
    ...readValid().filter((item) => item.slug !== slug),
  ].slice(0, MAX_ITEMS)
  try {
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    // 隐私模式等存储不可用：最近房间是锦上添花，失败就算了
  }
}
