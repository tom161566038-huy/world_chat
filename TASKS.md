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

## 阶段 9：房间产品化（未开始，先登记计划）

- [ ] 自建房间（房主创建话题房间，替代只有内置房间）
- [ ] 限时开放（房间到点关闭，不再常开）
- [ ] 在房人数展示

完成标准：用户可以自己创建房间并分享链接，房间列表显示在房人数，
房间可按时关闭。

## 阶段 10：信任与安全加固（未开始，先登记计划）

- [ ] 举报提交失败可重试
- [ ] 发送限流不因重连清零（窗口落到 DO 存储）
- [ ] 简单的举报查看入口（管理侧只读）

完成标准：举报失败有重试路径；换连接刷不掉限流窗口；管理员能在线看举报。

## 阶段 11：轻量留存（未开始，先登记计划）

- [ ] 稳定访客身份（本地身份随重连保持，替代每连接随机 userId）
- [ ] 断线重连不断消息（重连补拉错过的消息）

完成标准：刷新/断网重连后身份与聊天现场保持连续。

## 阶段 12：可运营（未开始，先登记计划）

- [ ] 翻译成功率可见（按 provider 统计失败率）
- [ ] 免费额度水位可见（Workers AI Neurons / Workers 请求数）

完成标准：不用翻日志就能看到翻译链路健康度与额度水位。
