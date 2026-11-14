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
- [ ] 用正式链接完成一次跨语言对聊检查

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
