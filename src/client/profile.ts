/**
 * 游客身份档案（本地）：游客名规则、国旗 emoji、头像派生、
 * localStorage 读写与老档案迁移。显示名 = 昵称 || 当前语言游客前缀 + 稳定短号。
 */
import type { LanguageCode, Profile, RoomMemberProfile } from "../shared/types"
import type { ProfilePayload } from "../shared/protocol"
import { getVisitorId } from "./api"
import { t } from "./i18n"

const PROFILE_KEY = "worldchat:profile"

/** FNV-1a：短号与默认头像色都从它派生，同一 visitorId 永远一致。 */
function hash32(input: string): number {
  let h = 2166136261
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/** 游客短号：visitorId 稳定派生的 1000–9999，刷新/重连不变；「换个身份」才换。 */
export function guestSuffixOf(visitorId: string): string {
  return String(1000 + (hash32(`suffix:${visitorId}`) % 9000))
}

/** 各语言的「游客」前缀（zh/ja 不带空格，拉丁字母带空格）。 */
const GUEST_PREFIX: Record<string, string> = {
  zh: "游客",
  en: "Guest ",
  ja: "ゲスト",
  es: "Invitado ",
  fr: "Invité ",
}

/** 当前语言的游客名：游4821 / Guest 4821 / ゲスト4821 / Invitado 4821 / Invité 4821。 */
export function guestName(language: LanguageCode, suffix: string): string {
  return `${GUEST_PREFIX[language] ?? GUEST_PREFIX.zh ?? ""}${suffix}`
}

/** 有效显示名：昵称（≤20 字）优先，否则游客名。国旗不拼进 name 字符串。 */
export function displayNameOf(profile: Profile): string {
  const nickname = profile.nickname?.trim()
  if (nickname) return nickname.slice(0, 20)
  return guestName(profile.language, profile.guestSuffix)
}

/** ISO 3166-1 alpha-2 → 地区旗帜 emoji；无效/缺省返回空串（不显示占位旗）。 */
export function flagEmoji(countryCode?: string): string {
  if (!countryCode || !/^[A-Za-z]{2}$/.test(countryCode)) return ""
  const upper = countryCode.toUpperCase()
  if (upper === "XX" || upper === "T1") return ""
  return String.fromCodePoint(
    ...[...upper].map((ch) => 0x1f1e6 + ch.charCodeAt(0) - 65),
  )
}

/** 预设头像色板：低饱和、与暖纸底协调的八色。 */
export const AVATAR_PRESET_COLORS = [
  "#2c4a6e",
  "#3e6b4f",
  "#8a5a1e",
  "#a0432f",
  "#5c574f",
  "#6b4a7a",
  "#2f6b6b",
  "#7a5a3e",
]

/** visitorId 稳定派生的默认头像色（未选预设、未上传时）。 */
export function defaultAvatarColor(seed: string): string {
  const list = AVATAR_PRESET_COLORS
  return list[hash32(`avatar:${seed}`) % list.length] ?? list[0] ?? "#2c4a6e"
}

/** 纯文本：剥掉 HTML 标签与尖括号，资料字段入库前统一过一遍。 */
export function stripHtml(text: string): string {
  return text.replace(/<[^>]*>/g, "").replace(/[<>]/g, "")
}

/**
 * 读本地档案并迁移老结构：
 * - 老档案 { displayName, language } → nickname = displayName（保留原名）；
 * - 新档案缺 guestSuffix 时按当前 visitorId 补一个（短号跟身份走）；
 * - 解析失败/为空返回 null（调用方会按游客流程新建）。
 */
export function loadProfile(): Profile | null {
  try {
    const raw = localStorage.getItem(PROFILE_KEY)
    if (!raw) return null
    const data = JSON.parse(raw) as Partial<Profile> & { displayName?: string }
    const language =
      typeof data.language === "string" && data.language ? data.language : undefined
    if (!language) return null
    const profile: Profile = {
      language,
      guestSuffix:
        typeof data.guestSuffix === "string" && data.guestSuffix
          ? data.guestSuffix
          : guestSuffixOf(getVisitorId()),
    }
    // 老用户：已有 displayName 的不改成游客名，迁移为昵称
    const legacyName = typeof data.displayName === "string" ? data.displayName.trim() : ""
    const nickname = (data.nickname ?? "").toString().trim() || legacyName
    if (nickname) profile.nickname = nickname.slice(0, 20)
    for (const key of ["countryCode", "avatar", "gender", "job", "hobbies", "bio"] as const) {
      const value = data[key]
      if (typeof value === "string" && value) profile[key] = value
    }
    if (typeof data.age === "number" && Number.isInteger(data.age)) profile.age = data.age
    return profile
  } catch {
    return null
  }
}

export function saveProfile(profile: Profile): void {
  localStorage.setItem(PROFILE_KEY, JSON.stringify(profile))
}

/** 新建游客档案：语言 + 稳定短号（头像/资料字段全部留空）。 */
export function createGuestProfile(language: LanguageCode): Profile {
  return { language, guestSuffix: guestSuffixOf(getVisitorId()) }
}

/** 「换个身份」：档案与访客 id 一起清，下次进入重新生成。 */
export function clearProfile(): void {
  localStorage.removeItem(PROFILE_KEY)
}

/** 本地档案 → 上报给房间的紧凑载荷（显示名单独传，避免老结构里塞国旗）。 */
export function profilePayloadOf(profile: Profile, displayName: string): ProfilePayload {
  const payload: ProfilePayload = { displayName }
  if (profile.countryCode) payload.countryCode = profile.countryCode
  if (profile.avatar) payload.avatar = profile.avatar
  if (profile.gender) payload.gender = profile.gender
  if (profile.age !== undefined) payload.age = profile.age
  if (profile.job) payload.job = profile.job
  if (profile.hobbies) payload.hobbies = profile.hobbies
  if (profile.bio) payload.bio = profile.bio
  return payload
}

/** 本地档案转展示用成员档案（自己看自己）。 */
export function memberOf(profile: Profile, userId: string): RoomMemberProfile {
  return { userId, ...profilePayloadOf(profile, displayNameOf(profile)) }
}

/** 性别字段 → 界面语言文案（未填/未知返回空串，不摆空壳）。 */
export function genderLabel(language: LanguageCode, gender?: string): string {
  if (gender === "male") return t(language, "genderMale")
  if (gender === "female") return t(language, "genderFemale")
  if (gender === "other") return t(language, "genderOther")
  if (gender === "private") return t(language, "genderPrivate")
  return ""
}

/** 成员档案 → [label, value] 行列表（资料卡与主页共用；没填的字段不出现）。 */
export function profileFieldRows(
  language: LanguageCode,
  member: RoomMemberProfile,
  opts?: { summarizeBio?: boolean },
): Array<[string, string]> {
  const rows: Array<[string, string]> = []
  const gender = genderLabel(language, member.gender)
  if (gender) rows.push([t(language, "genderLabel"), gender])
  if (member.age !== undefined) rows.push([t(language, "ageLabel"), String(member.age)])
  if (member.job) rows.push([t(language, "jobLabel"), member.job])
  if (member.hobbies) rows.push([t(language, "hobbiesLabel"), member.hobbies])
  if (member.bio) {
    rows.push([
      t(language, "bioLabel"),
      opts?.summarizeBio ? summarizeBio(member.bio) : member.bio,
    ])
  }
  return rows
}

/** 简略资料卡里的简介摘要：约 80 字（按码点）截断 + 统一省略号；完整简介在主页。 */
export function summarizeBio(bio: string, max = 80): string {
  const chars = Array.from(bio)
  if (chars.length <= max) return bio
  return `${chars.slice(0, max).join("")}…`
}

/**
 * 上传头像的客户端压缩：最长边压到 192px，质量分档下探，
 * 直到 dataURL ≤ 约 100KB（与服务的 MAX_AVATAR_CHARS 对齐）；失败返回 null。
 */
export async function compressAvatar(file: File): Promise<string | null> {
  if (!file.type.startsWith("image/")) return null
  const bitmap = await new Promise<HTMLImageElement | null>((resolve) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      resolve(null)
    }
    img.src = url
  })
  if (!bitmap) return null

  const MAX_CHARS = 140_000 // ≈100KB 二进制 base64 后的长度
  const sizes = [192, 160, 128]
  const qualities = [0.85, 0.7, 0.55, 0.4]
  for (const size of sizes) {
    const scale = Math.min(1, size / Math.max(bitmap.width, bitmap.height))
    const w = Math.max(1, Math.round(bitmap.width * scale))
    const h = Math.max(1, Math.round(bitmap.height * scale))
    const canvas = document.createElement("canvas")
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext("2d")
    if (!ctx) return null
    ctx.drawImage(bitmap, 0, 0, w, h)
    for (const q of qualities) {
      const type = canvas.toDataURL("image/webp", q).startsWith("data:image/webp")
        ? "image/webp"
        : "image/jpeg"
      const data = canvas.toDataURL(type, q)
      if (data.length <= MAX_CHARS && data.startsWith("data:image/")) return data
    }
  }
  return null
}
