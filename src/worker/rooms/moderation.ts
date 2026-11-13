/**
 * 基础文本过滤（阶段 6）：只拦截明显的垃圾信息，规则少而保守——
 * 误伤正常聊天比漏掉垃圾更糟，宁可放过不可错杀。
 *
 * 规则三条：
 * 1. 同一字符连续重复 9 次以上（刷屏、乱码、"aaaaaaa…"）；
 *    上限设 8 是为了放过中文里自然的叠词（如"哈哈哈哈哈哈"）。
 * 2. 单条消息里出现 3 个及以上链接（典型的广告轰炸）。
 * 3. 命中常见垃圾广告关键词（小词表，小写匹配，按需往表里加词即可）。
 *
 * 不引入新依赖、不上大模型审核；命中直接拒绝，不入库、不广播、不翻译。
 */

/** 同一字符允许连续出现的最大次数，超过即视为刷屏。 */
const MAX_CHAR_RUN = 8

/** 单条消息允许包含的链接数量上限。 */
const MAX_LINKS = 2

const LINK_PATTERN = /(?:https?:\/\/|www\.)\S+/gi

/** 常见垃圾广告关键词（小写）。词表刻意保持精简，方便审阅和增删。 */
const SPAM_KEYWORDS = [
  "加微信",
  "加qq",
  "扫码领取",
  "免费领取",
  "点击链接",
  "轻松月入",
  "零投资",
  "兼职刷单",
  "代开发票",
  "办证",
  "viagra",
  "casino bonus",
  "crypto giveaway",
  "buy followers",
  "贷款秒批",
]

/** 命中过滤时返回给用户看的提示；未命中返回 null。日志不记录消息原文。 */
export function findSpam(text: string): string | null {
  // 规则 1：同一字符连续重复
  let run = 1
  for (let i = 1; i < text.length; i++) {
    if (text[i] === text[i - 1]) {
      run += 1
      if (run > MAX_CHAR_RUN) return "消息里有过多重复字符，疑似刷屏"
    } else {
      run = 1
    }
  }

  // 规则 2：链接过多
  const links = text.match(LINK_PATTERN)
  if (links && links.length > MAX_LINKS) return "消息里包含太多链接，疑似广告"

  // 规则 3：垃圾关键词
  const lower = text.toLowerCase()
  for (const keyword of SPAM_KEYWORDS) {
    if (lower.includes(keyword)) return "消息包含疑似垃圾广告内容"
  }

  return null
}
