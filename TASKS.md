# 任务列表

按顺序完成。未完成当前阶段前，不要开始下一阶段。

## 阶段 0：仓库与文档（已完成）

- [x] 总纲、任务、Claude 约定和目录骨架入库
- [x] GitHub 远程：`git@github.com:tom161566038-huy/world_chat.git`

## 阶段 1：前端脚手架能跑起来（已完成）

- [x] 用 Vite + React + TypeScript 初始化前端（入口在 `src/client`）
- [x] 配好 `package.json`、`tsconfig`、`vite.config.ts`
- [x] 一个极简页面：显示名称、语言、房间占位
- [x] `npm run dev` 可在本地打开

完成标准：浏览器能打开页面，代码能通过 TypeScript 检查。

## 阶段 2：Worker 与单房间文字聊天（先不做翻译）（已完成）

- [x] 补齐 `wrangler.toml`，本地 `wrangler dev` 可运行
- [x] Durable Object 管理一个房间的连接和消息广播
- [x] 前端连上 WebSocket，能发、能收、消息有顺序
- [x] 消息结构使用 `src/shared` 里的类型

完成标准：两个浏览器窗口进入同一房间，互相能看到对方刚发的原文消息。

## 阶段 3：多房间（已完成）

- [x] 房间列表（先内置几个话题房间即可）
- [x] 进入 / 离开房间
- [x] 刷新后房间和近期消息还在（D1 或 Durable Object 存储，选型写进代码注释）

完成标准：至少两个房间互相隔离，刷新后能看到最近消息。

## 阶段 4：翻译适配器、缓存、查看原文（已完成）

- [x] 实现 `TranslateProvider` 和缓存（按消息 ID + 目标语言）
- [x] 同语言跳过翻译
- [x] 界面显示译文，并可展开原文
- [x] 接上一个免费或可自托管的 Provider，密钥不入库

完成标准：两个不同界面语言的窗口，能看到翻译后的消息，并能查看原文；重复消息不会重复调用翻译接口。

## 阶段 5：PWA（已完成）

- [x] 可添加到手机或桌面主屏
- [x] 移动端布局可用
- [x] 基础离线壳（断线时有提示，不要求离线发消息）

完成标准：手机浏览器能添加到主屏，全屏打开后可进出房间聊天。

## 阶段 6：基础安全（已完成）

- [x] 发送频率和内容长度限制
- [x] 简单过滤
- [x] 举报入口，并留下可查询的记录

完成标准：超频或超长消息会被拒绝；举报能被记录。

阶段 6 落地说明：

- 发送限频：每用户滑动窗口 10 秒内最多成功发 5 条（平均 0.5 条/秒，允许短促连发），
  超出返回 `error code: "rate_limited"`，不入库、不广播；窗口在 DO 内存里，重启清零（可接受）。
- 长度：服务端上限 500 字（与前端 maxLength 一致），超长返回 `too_long`，不再悄悄截断。
- 过滤（`src/worker/rooms/moderation.ts`）：同一字符连续 9 次以上、单条 3 个及以上链接、
  常见垃圾广告关键词小词表；命中返回 `filtered`，不入库、不广播、不翻译。
- 举报：聊天页每条别人的消息有「举报」入口（理由选填，上限 200 字）；服务端要求已加入
  房间且目标非空，记录写入该房间 DO 存储，键 `report:{时间戳}:{id}`，滚动保留最近 500 条。
  查询：DO 内按 `report:` 前缀 `storage.list`（本地开发可开 `.wrangler/state/v3/do/` 下的
  sqlite 查 `_cf_KV` 表）；管理界面以后需要时再加。

## 阶段 7：部署到 Cloudflare 免费层

- [x] 部署 Worker 与前端
- [x] 文档中写清部署步骤和免费层注意点
- [x] 用正式链接完成一次跨语言对聊检查（2026-11-14 已从可访问网络按
  DEPLOY.md 清单验收通过，译文 provider 为 workers-ai-glm-4.7-flash）

完成标准：不依赖本机，用公开 URL 能完成阶段 4 的体验。

进度备注（2026-11-14）：

- 已部署：正式 URL `https://world-chat.world-chat.workers.dev`。步骤与免费层
  注意点见 `docs/DEPLOY.md`。
- 线上对聊验收（第一次，版本 f0963269）：静态资源、/ws、join、history、原文
  广播均正常，**译文 20 秒以上始终未到**。原因：MyMemory 匿名额度按出站 IP
  计算，Workers 共享出口 IP 上额度常年耗尽/被拒，provider 抛错后在缓存层被
  吞成 null，于是原文照发、译文永不到、缓存为空。
- 修复一（版本 `15498aa2-f622-4bda-b224-e316924fdffd`）：默认 Provider 改为
  「Google gtx（免密钥，Workers 出站可用）优先 + MyMemory 兜底」的 FallbackProvider。
  本机 wrangler dev 已验证：google 在本机超时后自动落到 MyMemory，译文正常
  推送，重连后历史能带出缓存译文。
- 线上复验（版本 15498aa2）：译文仍 25 秒以上未到，provider 切换不是唯一原因。
- 修复二（版本 `aeb6d613-5034-46eb-8a16-3de4351a3147`）：DO 里三处
  fire-and-forget 异步（handleEvent、fanOutTranslations、backfillHistory 原为
  `void` 挂起）全部改为 `this.state.waitUntil(...)`。生产运行时在事件处理
  返回后会取消未受 waitUntil 保护的 Promise（本地 wrangler dev 不取消，因此
  本地能出译文、线上原文到而译文永不到）。改后 typecheck 通过，本地回归
  翻译链路正常。
- 第三项待复验：本机（国内网络）无法访问 `*.workers.dev`（DNS 污染 + SNI
  阻断），wrangler tail 日志流也连不上；线上验收只能由可访问网络完成，
  按 `docs/DEPLOY.md` 的 5 步清单重测，译文到达后勾选。
- 修复三（版本 `de40c9c7-3df4-4374-96c2-51d0a67e8382`）：waitUntil 已在线上
  但译文仍不到，复测确认两个免费接口在共享/云出站 IP 上都失败——
  translate.googleapis.com gtx 返回 429 HTML，MyMemory 返回 429 额度用尽。
  本次把默认 Provider 改成三棒链条：① clients5.google.com 的
  dict-chrome-ex 入口（带浏览器 UA，gtx 已弃用）；② Workers AI
  `@cf/meta/m2m100-1.2b`（wrangler.toml 增加 `[ai]` binding，Free 计划每天
  10,000 Neurons 免费额度，不绑卡不开付费）；③ MyMemory 末端兜底，并把
  「额度用尽」文案和 responseStatus≠200 显式当失败处理。AI binding 不吃
  AbortSignal，用竞速超时防止本地/边缘悬死整条链。每一棒的失败都带
  provider id + HTTP 状态码打进日志。本地回归：Google 出口超时、AI 远端
  代理超时后自动落到 MyMemory，双语译文均正常到达；`wrangler dev --remote`
  隧道在国内网络连不通，生产路径待可访问网络按 DEPLOY.md 清单复测。
- 译文自然度（版本 `828d80f8-24c2-4c79-ad21-fd8fd4e08e51`）：m2m100 译文生硬
  （「夜间验收你好」→ "Welcome to you at night"），产品负责人批准有限例外后，
  Workers AI 主模型换成 `@cf/zai-org/glm-4.7-flash`（Free 计划免费额度内、
  不绑卡；glm-5.x 需 Workers Paid 不用），链条变为 clients5 → glm-4.7-flash
  → m2m100 → MyMemory。glm 一棒用 chat messages 强约束「只输出译文」、
  temperature 0、max_tokens 按原文长度收紧、尝试关 thinking，响应解析兼容
  choices/message/response 形状并剥引号/代码块、拒答套话当失败。外部付费
  翻译/大模型 API 仍然禁止。本地用 mock AI 验证了四种响应形状、拒答识别、
  参数与整条链条（google 超时后落到 glm）；本机 wrangler dev 因 AI 远端
  代理认证刷新失败起不来，真实 glm 译文质量待可访问网络按 DEPLOY.md 清单复测。

## 阶段 8：可对外分享

目标：把正式链接发给一个新用户，对方能打开、看懂、进房间聊天。
继续用现有 workers.dev 地址，不强制注册，不接支付，不绑自定义域名。

- [x] A. 落地页：根路径先说明这是什么、怎么用，文案跟随界面语言
- [x] B. 可分享房间链接 `/r/<slug>`：点开进对应房间（需要时先收集名称和
      语言，不进错房间）；房间列表与聊天内提供复制邀请链接
- [x] C. 界面铬跟随用户语言（至少 zh/en/ja/es/fr）；聊天标题显示房间名；
      大厅/设置/聊天补 safe-area；空房间/未加入有空状态；
      修 Service Worker 不缓存错误状态码的导航响应
- [x] D. PWA 名称/图标/主题色完善；落地页与房间链接补 Open Graph 等分享元数据
- [x] E. 连不上 WebSocket / 重连中 / 翻译暂时不可用时有明确提示；
      不暴露密钥或内部错误细节
- [x] F. 简短且与产品相符的隐私说明和条款草稿页（页脚/设置可打开，
      不虚构法律主体）
- [x] 部署到正式 Workers，更新本文档的落地说明（版本、commit、验收限制）

完成标准：新用户在可访问 workers.dev 的网络上打开正式链接，能看懂产品、
选定语言进入房间聊天；分享 `/r/<slug>` 链接可直接进对应房间；断网或翻译
失败时界面有明确提示。

落地说明（版本 `e28cacad-3ba1-4e18-9692-b63c7f52efaf`）：

- 路由：不引入路由库，`src/client/router.ts` 解析 `/`、`/r/<slug>`、
  `/privacy`、`/terms`；服务端加 `[assets] binding = "ASSETS"`，
  Worker 把非静态、非 `/ws` 的 GET 统一回 index.html（SPA 兜底），
  分享链接刷新/直达都能进对页面；房间不再存 localStorage，URL 即现场。
- 落地页（`Landing.tsx`）：这是什么 + 三步怎么用 + 名称/语言表单，
  全部文案按语言渲染；浏览器语言自动预选（zh/en/ja/es/fr，默认 zh）。
  从房间链接进入且无身份时先收名称/语言再进房（提示将进入哪个房间）。
- i18n（`i18n.ts`）：zh/en/ja/es/fr 全量界面文案；房间名/话题、隐私/
  条款正文也在其中；服务端 error 按 code 映射本地化文案，不透出服务端
  中文 message；`<html lang>` 与 `document.title`（房间名 · WorldChat）
  跟随语言/视图。
- 翻译状态（E）：协议新增 `translation_failed` 事件，DO 在整条 Provider
  链失败时按目标语言定向通知（fanOut 与 backfill 两处，主链条未动）；
  前端对别人的消息显示「翻译中…/翻译暂时不可用（点击看原文）」，
  不再默默只剩原文。WebSocket 断开后每 3 秒自动重连，横幅提示
  「正在重新连接…」，离开房间不重连。
- SW 修复：导航响应仅 `response.ok` 才进缓存，错误状态码不再被离线
  回放当应用壳。
- PWA/分享（D）：manifest 名称/描述完善；index.html 补 description、
  og:title/description/type/url/image/locale×5、twitter:card
  （og:url 指向 workers.dev，换域名时同步改）。
- 隐私/条款（F）：`/privacy`、`/terms` 五语言草稿，内容只描述产品真实
  行为（消息经第三方翻译、房间保留约 100 条、举报记录、本地存储），
  不虚构法律主体；落地页与房间列表页脚可打开。
- 本地验证：typecheck 通过；`vite preview` 确认 `/`、`/r/*`、`/privacy`、
  `/terms`、未知房间均返回 SPA 壳且 OG 元数据在位；mock 环境驱动真实
  Worker fetch handler 验证 `/r/*` 兜底、`/ws` 校验与非 GET 404。
  本机国内网络无法访问 workers.dev（且 wrangler dev 因 AI 远端代理认证
  刷新失败起不来），线上体验按 DEPLOY.md 清单待可访问网络复测。

## 阶段 9：房间产品化（已完成）

- [x] 自建房间（房主创建话题房间，替代只有内置房间）
- [x] 限时开放（房间到点关闭，不再常开）
- [x] 在房人数展示

完成标准：用户可以自己创建房间并分享链接，房间列表显示在房人数，
房间可按时关闭。

落地说明（版本 `ed25d153-b56f-4adb-90b3-48ba595f3a4e`）：

- 房间目录：新增单一实例 SQLite DO `RoomDirectoryDurableObject`
  （`idFromName("directory")`，wrangler 迁移 tag `v9_room_directory`）。
  不引入 D1——目录是全局单点小数据（活跃上限 50 个），DO 存储免额外绑定，
  与消息存储选型一致。键：`room:{slug}` 房间记录、`occ:{slug}` 在房人数、
  `rate:{creatorId}` 创建限流时间戳。
- 创建（A）：`POST /api/rooms` → 目录 DO `/create`。标题 1–40 字、话题
  0–80 字（按 Unicode 码点计），时长预设 1/3（默认）/12/24 小时；服务端生成
  6 位小写字母数字 slug（避开内置房间与冲突）；同一创建者每小时最多 3 个、
  全站活跃房间上限 50，超了分别返回 `rate_limited` / `too_many_rooms`。
  创建者记录展示名 + 前端生成的访客 id（无账号体系）。
- 限时关闭（B）：目录存 `closesAt`；Worker `/ws` 放行自建房间前先查目录，
  未知/已关闭一律 404（不信任前端），放行时把 `closesAt` 带给房间 DO；
  房间 DO 首次连接写入 `room:meta` 并设 Alarm，到点广播 `room_closed`、
  断开全部连接、人数上报清零；之后 join/send 被拒（error code `room_closed`）。
  列表/查询单房时已过期记录懒清理；历史消息原设计保留在各自房间 DO，
  2026-11-26 改为「关闭即销毁」（见下方修订）。
- 在房人数（C）：以房间 DO 的 WebSocket 会话为准，join/leave/关闭时向目录
  上报 `POST /occupancy`；前端大厅列表 12 秒轮询 + 页面切回可见时刷新；
  聊天标题显示「N 人在房」（协议新增 `presence` 事件，join 后即推）。
- 空房引导（D）：房内只有自己时显示邀请链接复制横幅；「更换身份」现在会
  清掉 localStorage 的 `worldchat:profile`（阶段 8 遗留问题顺手修复）。
- 前端：大厅显示「内置房间 + 自建房间」两段列表，自建房间行显示创建者与
  关闭倒计时；创建成功面板给链接 + 进入/复制；打开已关闭房间链接显示
  「房间已关闭」页；全部新文案进 i18n ×5 语言。
- 本地验证：typecheck 通过；mock DurableObjectState + tsx 跑真实 DO/Worker
  代码——目录（创建/字段校验/限流/上限/列表/单查 200/410/404/人数写入与
  防灌键）、房间 DO（到点 Alarm 广播关闭 + 人数清零上报、fetch 带 closesAt
  设 Alarm、meta 持久化）、Worker 路由（内置直接放行、自建带 closesAt 转发、
  已关闭/未知 404、/api/rooms 代理、SPA 兜底）全部通过。顺带发现并修复
  一个真 bug：alarm() 原会在已过关闭时间时提前 return，导致休眠 DO 被唤醒后
  不广播 room_closed、连接吊死。本机国内网络无法访问 workers.dev，线上
  按 DEPLOY.md 清单待可访问网络复测。

## 阶段 10：信任与安全加固（已完成）

- [x] 举报提交失败可重试
- [x] 发送限流不因重连清零（窗口落到 DO 存储）
- [x] 简单的举报查看入口（管理侧只读）

完成标准：举报失败有重试路径；换连接刷不掉限流窗口；管理员能在线看举报。

落地说明（版本 `ee0edcc6-5b55-43b3-ade5-1d4cd2733072`）：

- 举报重试 + 限流：举报失败（网络/超时）后界面出现「重试」按钮，已填理由保留
  不必重填；被限流时给单独文案（`errReportRateLimited`，i18n ×5）。服务端
  举报限流：每用户每房间每分钟最多 3 次（`reportrate:{身份}` 滑动窗口，同样
  落 DO 存储），超限返回 `report_rate_limited`，被拒的举报不落盘。
- 发送限流持久化：窗口从 DO 内存挪到存储键 `sendrate:{身份}`，仍按用户、
  仍是 RATE_MAX=5 / 10 秒（数值未动）。重连、刷新、DO 重启后未过期记录仍
  计入；存储里只保留窗口内时间戳，过期的读时即删（每键最多 5 条，体积有界）。
  跨连接的身份键用 join 新增的可选 `visitorId`（前端 localStorage 的
  `worldchat:visitorId`，阶段 9 已有），未带时退回按连接隔离——只用于限流，
  不动消息归属的 userId，不提前做阶段 11 的身份体系。
- 只读举报查看：`GET /admin/reports`（凭 wrangler secret `REPORTS_ADMIN_KEY`，
  header `x-admin-key` 或 `?key=`），未配密钥一律 404、密钥错 401。默认列出
  内置房间 + 目录里仍活跃的自建房间；`?room=<slug>` 支持已从目录过期清理的
  自建房间（直查该房间 DO 的 `GET /reports`，历史举报仍在）。只读，无删除/
  封禁。密钥已写入生产 secret，本机副本在 `.dev.vars`（gitignored）。
- 本地验证：typecheck 通过；mock DO state + 假 WebSocket 驱动真实代码——
  发送窗口（第 6 条拒绝 / 重启+重连同身份仍计入 / 换身份独立 / 过期修剪）、
  举报限流（3 次成功第 4 次 `report_rate_limited` / 落盘 3 条 / 别人不连坐 /
  DO `/reports` 升序导出）、Worker `/admin/reports`（未配 404 / 错钥 401 /
  对钥列表含内置+自建 / 过期房间可查 / 非法 slug 400）全部通过；阶段 9
  mock 测试回归通过。本机国内网络无法访问 workers.dev，线上按 DEPLOY.md
  清单待可访问网络复测。

## 阶段 11：轻量留存（已完成）

- [x] 稳定访客身份（本地身份随重连保持，替代每连接随机 userId）
- [x] 断线重连不断消息（重连补拉错过的消息）

完成标准：刷新/断网重连后身份与聊天现场保持连续。

落地说明（版本 `f93b1ac6-f96d-4e9f-b8d0-bb1a0ec984a0`）：

- 稳定身份：join 的 `visitorId` 经 UUID 格式校验后直接作为 userId——
  消息归属、presence、发送/举报限流键全部统一到它；非法或缺失时退回
  本连接临时随机 id（旧行为）。刷新、换标签页、短暂断线后仍是同一个人，
  自己发的历史消息仍显示为「我」（senderId 匹配）。同一浏览器多标签页
  共享该 id 是期望行为。「更换身份」现在同时清 `worldchat:profile` 和
  `worldchat:visitorId`（`resetVisitorId`），下次进入重新生成，真正换人。
- 重连补拉：`message`/`history` 事件都带房间内消息序号 `seq`；客户端记
  收到的最大 seq，重连 join 带 `lastSeq` 游标，服务端用存储
  `list({ prefix, startAfter })` 下发游标之后的消息（上限 MAX_HISTORY=100，
  远大于补译的 20 条，覆盖短时断线），已缓存译文一并带上并照常异步补译；
  未带游标保持「最近 N 条历史」。前端按消息 id 去重合并，补拉不会把
  已有消息再插一遍。
- 兼容：seq 是新增字段，旧客户端忽略；限流数值未动（发送 5/10 秒、
  举报 3 次/分钟），仅限流键从「visitorId 或随机」对齐为稳定 userId。
- 本地验证：typecheck 通过；mock DO state + 假 WebSocket 驱动真实代码——
  稳定身份（合法 UUID 即 userId / 重连不变 / 消息归自己 / 超长串与路径串
  不被采信且各自退回独立临时 id）、换 visitorId 即换人、补拉（带游标只补
  之后的消息不重复 / 断线期间 25 条（>20）也补全 / 归属正确 / 无游标回退
  最近历史）、限流回归（数值未动、键跨连接生效）全部通过；阶段 9/10
  mock 测试回归通过（阶段 10 脚本的 visitorId 样例同步改成合法 UUID）。
  本机国内网络无法访问 workers.dev，线上按 DEPLOY.md 清单待可访问网络复测。

## 阶段 12：可运营（已完成）

- [x] 翻译成功率可见（按 provider 统计失败率）
- [x] 免费额度水位可见（Workers AI Neurons / Workers 请求数）

完成标准：不用翻日志就能看到翻译链路健康度与额度水位。

落地说明（版本 `9b653f6f-66b2-479c-8ad2-e2666e1603cc`）：

- 翻译记账：`createTranslateProvider` 增加可选记账回调，默认链条每棒包一层
  `RecordingProvider`——成功/失败路径原样透传，只多调一次回调（provider id +
  成败 + 简短原因，不含消息原文），主链条顺序与行为零改动。Room DO 构造时
  挂回调，fire-and-forget POST 到目录 DO `/translate-stats`，失败只打日志。
- 汇总（目录 DO，SQLite 存储，重部署不丢）：`tstat:{美东日期}:{provider}` →
  { ok, fail } 按日累加；日界用美国东部时间（America/New_York），与
  Cloudflare 免费层重置点对齐，避免与北京时间混用。失败摘要
  `tfail:…` 滚动保留最近 50 条（时间、provider、≤120 字原因）。
- 查看：`GET /admin/stats`（复用 `REPORTS_ADMIN_KEY`，鉴权与 `/admin/reports`
  完全对齐：未配 secret 404、密钥错/缺 401）。返回最近 7 天按 provider 的
  成功/失败汇总（今日置顶，无流量也列空行）+ 失败摘要。
- 免费额度水位：用自建计数做代理（今日翻译调用次数，可分 provider 看
  workers-ai 两棒）。Workers 免费 10 万请求/天（美东零点重置）、Workers AI
  免费 10,000 Neurons/天（超限当天报错停住、不扣费）写进 DEPLOY.md 对照；
  Cloudflare 没有免费只读的官方用量 API，不硬接、不写账号 token。
- 顺手小修补（阶段 11 遗留）：App.tsx 渲染 Chat 加 `key={room.id}`，从
  /r/A 切到 /r/B 时组件正确卸载重建，lastSeq 游标不再带到新房间。
- 本地验证：typecheck 通过；mock 外部 fetch + mock DO state 驱动真实代码——
  默认链第一棒 429 失败落 mymemory 成功时按 provider 分别记 fail/ok、整链
  失败每棒各记一次、统计与失败摘要不含消息原文、目录校验（空 provider/
  缺 ok/坏 JSON 均 400）、失败摘要灌 60 条只留最新 50、ET 时区与日期形状、
  Worker 鉴权（未配 404 / header 与 query 错钥 401 / 对钥透传）全部通过；
  阶段 9/10/11 mock 测试回归通过。本机国内网络无法访问 workers.dev，
  线上按 DEPLOY.md 清单待可访问网络复测。

## 阶段 13：游客身份、国旗、个人资料设置（2026-11-15，已完成）

- [x] 一进来就是游客：打开站点/房间链接自动建档案，不必先起名；落地页昵称改可选，
      /r/<slug> 无档案时自动以游客身份进入（房间关闭/不存在的判断仍在前面）
- [x] 游客名 = 本地化前缀 + visitorId 稳定派生的 4 位短号（zh 游客4821 / en
      Guest 4821 / ja ゲスト4821 / es Invitado 4821 / fr Invité 4821）；
      切语言只换前缀不改短号；老用户的 displayName 迁移为 nickname 不改成游客名；
      「换个身份」重生成 visitorId、新游客名并清空头像与资料字段
- [x] 国旗：GET /api/geo 用 Cloudflare 边缘 country（XX/T1/无效 → null 不清已有值），
      不接付费 GeoIP、不存原始 IP；emoji 旗显示在发送者名/房间列表问候/资料卡，
      识别不到不显示；隐私说明五语言补「国家推断 + 可选资料」一段
- [x] 设置：房间列表与聊天顶栏随时可开；头像（预设色板 + 上传压缩 192px/约100KB）、
      昵称（≤20 字，清空回游客名）、性别（male/female/other/private 码）、
      年龄（13–120 整数，<13 不给保存）、工作/喜好/简介（剥 HTML、限长）全选填
- [x] 档案分发：join 带 profile（清洗后落 `profile:{userId}`，滚动保留 100 份，
      头像上限 14 万字符）；新事件 member_profile / member_profiles（历史发送者
      + 在房人员）；改资料发 profile_update 立即广播；历史消息用发送者档案显示
      头像国旗；点头像/名字开轻量资料卡（只显示已填字段）；类型在 src/shared
      前后端共用，旧字段全部兼容
- [x] 全部新文案 i18n ×5；视觉沿用现有设计令牌与统一顶栏/select 规则；
      翻译主链条（src/worker/translate/）零改动

落地说明：

- 显示名不拼国旗（避免服务端 20 字截断），国旗/头像渲染时叠加；
  Profile 类型挪进 src/shared/types.ts（原 client/Landing 的 Profile 删除）。
- 本地验证：typecheck/build 通过；mock DO + 假 WebSocket 驱动真实
  RoomDurableObject——join 档案清洗（trim/限长/国家码大写/性别码白名单/
  剥 HTML/非法头像与 age<13 拒收）、member_profile 广播、member_profiles
  回放、profile_update 后消息用新昵称、档案灌 150 份只留 100——全部通过；
  真实 Worker fetch 验证 /api/geo（无 cf→null、JP→JP、XX→null、header fr→FR）。

## 阶段 14：点头像弹简略资料卡 + 查看用户主页（2026-11-15）

- [x] 聊天里点头像/名字弹简略资料卡（免费永远可看）：头像、显示名 + 国旗、
      已填字段摘要；长简介约 80 字统一省略号截断，完整简介在主页；
      没填的字段不摆空壳；点遮罩或关闭按钮关掉
- [x] 资料卡上「查看主页」入口（i18n ×5）；主页为应用内全屏视图状态
      （不新增 Worker 路由，聊天连接保持不断）：更大头像、显示名 + 国旗、
      全部已填字段与完整简介；「返回聊天」关掉主页回到房间；
      看自己时另给「编辑资料」打开已有设置面板
- [x] 门禁挂钩：`src/client/profileHomeGate.ts` 的 canOpenProfileHome 是
      「查看主页」唯一入口，现在永远放行；以后若要付费才能开主页只改这里，
      简略资料卡不受影响；拒绝时预留不可打开状态（现阶段走不到）
- [x] 数据复用房间成员档案（RoomMemberProfile），协议零改动、不塞头像字节
      进消息；视觉沿用现有设计令牌，翻译主链条零改动

落地说明：

- 共用逻辑进 `src/client/profile.ts`：profileFieldRows（资料卡/主页同一套
  字段行构建，可选 summarizeBio 截断简介）、genderLabel、summarizeBio。
- 本地验证：typecheck/build 通过。

## 阶段 15：落地页卖点 / 捐赠链接 / AI 场景房（2026-11-24）

- [x] A. 落地页主标题卖点 + 三条亮点（自动翻译 / 免费免注册 / 可装主屏），
      五语言同步，index.html 的 title/OG 描述一并换新
- [x] B. 页脚捐赠/打赏外部静态链接（Buy me a coffee 占位），PLAN.md
      「明确不做」补注：只是第三方平台外链，站内不收款不记账
- [x] C. 内置 3 个 AI 场景房（英语会话 Emma / 旅行问路 Marco / 轻松闲聊 Luna），
      AI 固定英语回复走现有翻译链；15s 节流 + 每房每日 200 条封顶；
      前端 AI 徽章、隐私说明补披露

落地说明（阶段 15）：

- 落地页（A，commit `66bccd7`）：tagline 五语言改写为主标题卖点并上字号
  （26px/600），下接三条一句话亮点（`.landing-points`，accent 圆点）；
  landingIntro / landingNote / how 区块保留不动；index.html 的 title、
  description、og:title/og:description 同步换新卖点。
- 捐赠（B，commit `b24837d`；后续改为双通道）：`src/client/links.ts`
  集中放外链。因 BMC 提现仅走 Stripe（不支持大陆个人），拆为
  `DONATE_CN_URL`（爱发电，微信/支付宝付款）与 `DONATE_INTL_URL`
  （Ko-fi `ko-fi.com/tom161566038`，海外访客刷卡或 PayPal 余额，钱直达
  绑定的大陆个人 PayPal；PayPal.me 通道弃用，因个人账户提现仅 $35 电汇
  且 Ko-fi 打赏体验更好）两条链接；上线前需小额实测 Ko-fi 到账；
  落地页与大厅页脚各加两项，`target="_blank" rel="noopener noreferrer"`
  新标签打开；PLAN.md「明确不做」注明站内不收款不记账。
- AI 场景房（C，commit 本次）：`BUILTIN_ROOMS` 追加 english / roleplay /
  smalltalk 三房（kind builtin，`BUILTIN_ROOM_IDS` 自动放行 /ws，
  大厅、/r/<slug>、recentRooms 零改动生效）；人设表 `AI_ROOM_AI`
  （slug → RoomAi）是 Worker 侧唯一数据源，O(1) 查表。
- AI 回复（RoomDurableObject.maybeAiReply）：send 后以 DO 自己的房间名
  （不信任客户端 event.roomId）查人设，`ai:` 前缀消息不再触发（防自激）；
  房里没人不回；每房 15 秒最多 1 条（`airate:` 窗口戳在生成前乐观写入，
  防并发双发）；每房每 UTC 日 200 条封顶（`aiday:{date}:{slug}`，写入时
  顺手删前一日键）；上下文 = system 人设 + 最近 10 条消息（用户消息带
  `[名字]` 前缀、连续同角色合并、尾部必须 user）；AI.run 竞速 20s 超时、
  max_tokens 400、temperature 0.8；复用 provider 的
  extractChatText/normalizeChatText（已 export，剥引号/代码块、识别拒答
  套话）后截断 500 字、过 findSpam、closed 复查；入库后广播
  member_profile（isAi:true）+ message，译文走现有 fanOutTranslations
  （sourceLang=en，各用户母语自动覆盖）。失败只打日志（不带消息原文）。
- 前端：Chat.tsx AI 消息旁显示 `AI` 胶囊徽章（.ai-badge，accent 令牌）
  且不显示举报入口；Rooms.tsx 内置房行标题旁同样显示徽章；i18n ×5 补
  3 房标题/话题（roomMeta keyMap 同步）与隐私说明 AI 披露一句。
- 本地验证：typecheck/build 通过；mock DO state + 假 WebSocket + mock AI
  驱动真实 RoomDurableObject——AI 英语回复入库广播（带 seq/isAi 档案）、
  system 人设与 [名字] 前缀上下文形状、15s 节流（窗口内第二条沉默、
  过期恢复）、每日 200 条封顶、拒答套话不发消息、普通房 lobby 无 AI
  行为，全部通过。真实 glm 回复质量与线上体验待部署后按 DEPLOY.md
  清单复测。
- AI 房保持英文（2026-11-26 修订，commit 本次）：用户反馈中文界面下
  AI 房变成「纯中文聊天」——两层修复：① systemPrompt 末句改为
  「Always reply in casual English only, even if the user writes in
  another language」，压住 glm 被中文带跑；② Chat.tsx 中 AI 消息
  （room.ai 存在且 senderId 为 `ai:` 前缀，常量挪到 shared/rooms.ts
  前后端共用）反转为主显英文原文、译文点「查看译文」才展开
  （i18n ×5 补 showTranslation/hideTranslation）；普通房间与用户
  自己的消息展示逻辑不动。

## 修订：自建房间关闭即销毁内容（2026-11-26）

- [x] 房间到点关闭时清空房内全部存储（消息、译文缓存、举报记录、
      成员档案、限流/AI 计数窗口），只留 `room:meta` 供 DO 重启后
      自识别「已关闭」；DO 休眠期间错过 Alarm 的，下次被唤醒时补清。

落地说明：`RoomDurableObject.alarm()` 关闭广播、断连、人数清零上报之后
调用 `wipeRoomContent()`（list 全键、过滤 META_KEY、按 128 键分批 delete）；
`ensureRoomMeta()` 发现已过关闭时间也补一次清空（幂等）。内置房间没有
closesAt 不受影响。隐私说明五语言同步补一句「自建房到期关闭时消息与
相关记录会被删除」。

## 阶段 16：房间主题背景（80 张真实照片 + 房主上传图片）（2026-11-26）

- [x] 共用类型：`src/shared/roomThemes.ts`（RoomThemeId 80 个照片主题
      白名单 + isRoomThemeId 校验）；Room 加 `theme?` 与瞬态 `isCreator?`；
      CreateRoomInput 加 `theme?`；错误码追加
      filtered/invalid_theme/forbidden/bg_too_large/bg_invalid；
      protocol 追加 `room_theme`/`room_background` 事件，`joined` 带可选
      `background`（旧客户端忽略）。
- [x] 目录 DO：create() 校验 theme 白名单 + title/topic 补跑 findSpam
      （命中返回 filtered）；`creator:{slug}` 单独存创建者 id（绝不进 Room
      记录——GET /api/room 原样外发，泄露即可冒充房主）；purgeExpired
      一并删 creator 键；新端点 POST /theme（房存在未关闭 + creator 匹配
      + 白名单 → 更新 Room 记录）与 POST /verify-creator（204/403）；
      getRoom 识别 `?creator=` 命中时附 `isCreator: true`。存量旧房无
      creator 键 → 鉴权 403，最长 24h 自然过期，不迁移。
- [x] Room DO：新键 `bg` = { theme?, image? }（MAX_BG_CHARS=300_000，
      dataURL 严格形状 `data:image/(webp|jpeg|png);base64`）；POST /bg
      sanitize → 限流（`bgrate:` 复用 loadWindow，60s/6 次）→ 存/删 →
      广播 room_theme / room_background；join 读 bg 随 joined 单发
      background（大图不进广播热路径，但变更事件仍全房广播）；
      ensureRoomMeta 在 bg 键不存在且 theme 参数合法时幂等播种；
      关房销毁走既有 wipeRoomContent，bg 键自动覆盖。
- [x] Worker：POST /api/room/:slug/theme（目录鉴权并写记录 → Room DO
      /bg 同步广播，目录先写、DO 失败重试自愈）；POST /api/room/:slug/
      background（Worker 先按 >320k 预检 400 → 目录 verify-creator →
      Room DO /bg）；两路由排除 BUILTIN_ROOM_IDS（内置房 404）；/ws
      转发前 `searchParams.delete("theme")` 再按目录记录回填（防伪造种子）。
- [x] 内置主题图：80 张真实照片（世界名胜 + 世界室内，Unsplash/Pexels
      License，来源见 public/themes/CREDITS.md），大图 1440 宽 JPEG
      （超 280k 的降 1280/q32 重压）、缩略图 240 宽（*-thumb.jpg），
      打包仓库同源伺服，建房表单只加载缩略图。
- [x] 前端：`src/client/roomThemes.tsx` ROOM_THEME_OPTIONS 由白名单
      生成 + 共用 ThemePicker（radiogroup，每张缩略图下方一行本地化
      描述，超长 line-clamp 两行截断）；主题名 ×5 语言在
      `src/client/themeNames.ts`（单独成表，不进 i18n.ts）；Rooms 建房
      表单加主题单选行；Chat.tsx bgTheme/bgImage 状态（room.theme 即时
      上墙 → joined 校正 → 广播实时跟进）、chat-bg 全屏铺底（照片叠
      0.3 白纱 + 界面铬 backdrop-blur 半透明浮层）、计时房间顶部剩余
      时长 chip、房主（room.isCreator）header「背景」按钮开面板（换
      主题/上传/恢复默认/合规提示）；App 房间解析 lookupRoom 带
      creator；profile.ts compressImage 泛化（compressAvatar 行为
      不变）+ compressBackground（1280/1024/800 × 0.8/0.65/0.5 ≤300k）；
      api.ts updateRoomTheme/uploadRoomBackground/lookupRoom(creator?)。
- [x] 样式与文案：`.chat-bg` fixed 铺满全屏 z-index 0、内容层提级 1、
      `--veil` 半透明界面铬 + backdrop-filter blur、上传图叠白纱；
      `.theme-thumb-caption` line-clamp 两行；i18n ×5 保留界面铬文案
      （主题名移至 themeNames.ts）；隐私说明 ×5 补「房主上传的房间
      背景存房间存储，房间关闭时删除」。

验证：tsc 两份 tsconfig + vite build 全过；本地 wrangler dev 实测——
建房带主题、垃圾标题 filtered、非法 theme invalid_theme、
isCreator 仅 ?creator= 命中时出现、非房主换主题/传图 403 forbidden、
500k 图片体 bg_too_large、javascript: 伪协议 bg_invalid、/ws?theme=…
伪造参数被清（joined 仍回目录记录主题）、上传后 room_background
广播至既有连接、新加入者 joined 带上 image、清主题+删图后 joined 无
background。线上待复测：真实手机半透明可读性（深色照片）、大图广播
到达率、房间到期 bg 键销毁。
