# 部署到 Cloudflare 免费层（阶段 7）

WorldChat 的前端（Vite 构建产物 `dist/`）和 Worker（WebSocket + Durable Object）
部署在同一个 Worker 上：静态资源走 Workers Static Assets，`/ws` 落到 Worker 脚本。
这样页面和 WebSocket 同源，前端 `wsUrl` 直接用同源 `wss`，不需要额外域名或 CORS。

## 前置条件（一次性）

1. 安装依赖：`npm install`
2. 登录 Cloudflare：`npx wrangler login`（浏览器授权，只需一次）
3. 确认身份：`npx wrangler whoami`

## 部署步骤

```bash
npm run deploy
# 等价于：npm run build && wrangler deploy
```

完成后 wrangler 会输出正式地址，形如：

```
https://world-chat.<你的子域>.workers.dev
```

手机浏览器打开这个地址即可添加到主屏（PWA）。

## 环境变量 / 密钥（可选）

默认翻译链条是「clients5.google.com（dict-chrome-ex 入口）→ Workers AI
`@cf/zai-org/glm-4.7-flash`（AI binding，译文自然度高）→ Workers AI
`@cf/meta/m2m100-1.2b`（专用翻译模型兜底）→ MyMemory（末端兜底）」，
前三个都免密钥，**不设置任何变量即可上线**（MyMemory 对 Workers 共享出站 IP 的
匿名额度常年耗尽，只作最后一棒；国内本地开发时 google 出口和 AI 远端代理都
不可达，会自动落到 MyMemory）。

想换自托管的 LibreTranslate 时（额度自控、零月费）：

```bash
npx wrangler secret put LIBRETRANSLATE_URL   # 例如 https://libretranslate.example.com
npx wrangler secret put LIBRETRANSLATE_KEY   # 自托管未开限流可跳过
```

密钥只放 Cloudflare 侧（secret / 仪表盘变量），不得写进仓库、`.env.example` 或提交记录。
翻译大模型使用有有限例外（产品负责人 2026-11-14 批准）：仅允许 Workers AI
免费层的多语言指令模型（glm-4.7-flash）；外部付费翻译 / 大模型 API
（DeepL 付费、OpenAI、智谱官方 API 等）一律禁止，glm-5.x 系列需要
Workers Paid 也不用。接入任何付费翻译 API 前必须先设预算上限。

## 部署后验收（阶段 4 体验）

用正式 URL 完成一次跨语言对聊检查：

1. 窗口 A：界面语言选「中文」，进入任一房间
2. 窗口 B（或手机）：界面语言选「English」，进入同一房间
3. A 发一条中文 → B 应看到英文译文，点「查看原文」能展开中文原文
4. B 回一条英文 → A 应看到中文译文，同样能查看原文
5. 同语言的窗口（两个都选中文）应只见原文，不触发翻译

## 部署后验收（阶段 9 房间产品化）

在可访问 workers.dev 的网络上，检查自建房间的完整生命周期：

1. 大厅页点「创建房间」：填标题、选时长（默认 3 小时）→ 出现链接 + 进入按钮
2. 进入后聊天标题显示「1 人在房」，且页面上方出现「复制邀请链接」引导
3. 另一个窗口（或手机）打开同一链接 → 两侧人数都变 2，引导消失
4. 大厅列表出现该房间（创建者 + 关闭倒计时），人数随进出变化（约 12 秒轮询）
5. 等房间到点关闭（或把 `closesAt` 调短验证）：房内收到「房间已关闭」横幅并
   断开、不再自动重连；此后打开链接显示「房间已关闭」页；大厅列表不再显示

## 部署后验收（阶段 10 信任与安全）

1. 举报一条消息后故意断网再提交 → 出现「重试」按钮，理由还在，网络恢复后
   重试成功；同一分钟连举报 4 次 → 第 4 次提示「举报得太频繁」
2. 同一浏览器发满 5 条（10 秒内）被限速后，刷新页面立刻重进再发 → 仍被限速
   （窗口已持久化）；换无痕窗口（另一身份）不受影响
3. 管理员查看举报（密钥在 `.dev.vars` 的 `REPORTS_ADMIN_KEY`，勿外传）：
   `curl -H "x-admin-key: <密钥>" https://world-chat.world-chat.workers.dev/admin/reports`
   → JSON 列出内置 + 活跃自建房间及各自举报；已过期自建房间加
   `?room=<slug>` 单查；不带密钥访问该地址应得到 404（等同入口不存在）。
   若换了环境没有密钥，重新生成：`openssl rand -hex 32`，然后
   `printf '%s' '<新密钥>' | npx wrangler secret put REPORTS_ADMIN_KEY`，
   并同步更新本机 `.dev.vars`

## 部署后验收（阶段 11 轻量留存）

1. 稳定身份：进入房间发一条消息 → 刷新页面重进同一房间 → 自己那条仍显示在
   右侧（「我」的一侧），不是陌生的「无名氏」；开第二个标签页进同房间，
   两边显示同一个人
2. 重连补拉：两个窗口在同一房间，A 断网约半分钟（期间 B 聊几条）→ A 恢复
   网络 → 自动重连后 A 的消息列表补上断线期间那几条，不重复、顺序正确
3. 更换身份：大厅点「更换身份」→ 重新填名字进房 → 之前自己发的消息不再
   显示为「我」（已是另一个访客）

## 免费层注意点

- **Workers 免费层**：每天 10 万次请求（东部时间零点重置）；超限报错停住，不会自动扣费。
- **Durable Object 免费层**：要求 SQLite 存储（已按 `new_sqlite_classes` 配置）；
  DO 有单独的免费额度与限制，超限同样是停住而不是扣费。阶段 9 新增第二个 DO
  `RoomDirectoryDurableObject`（迁移 tag `v9_room_directory`），与房间 DO 共享
  同一免费额度。
- **静态资源**：Workers Static Assets 免费提供，不占 Workers 请求额度。
- **翻译接口**：默认链条免密钥——① Google clients5（dict-chrome-ex，非官方接口，
  可能限流）；② Workers AI glm-4.7-flash（`[ai]` binding，译文自然，Free 计划
  每天 10,000 Neurons，短消息够用，超限当天报错停住、不会自动扣费，链条会
  落到后续几棒）；③ Workers AI m2m100（专用翻译模型，省额度）；④ MyMemory
  （匿名额度按出站 IP 每日有限）。上量前建议自托管 LibreTranslate
  （免费开源、零月费）并配置 `LIBRETRANSLATE_URL`。
- **不要打开付费功能**：不绑信用卡、不开 Workers Paid、不用 Smart Placement 等
  付费项；`wrangler.toml` 里保持只有免费配置。
- 日志排查用 `npx wrangler tail`（实时日志）；代码里已避免记录消息全文和密钥。

## 可选：自定义域名（阶段 8 不执行）

当前正式地址是 `https://world-chat.world-chat.workers.dev`，免费、够用；
**本阶段不购买、不申请、不绑定任何自定义域名**，发布也不依赖它。
以后想换成自己的域名时（域名本身需按年付费，Workers 侧绑定不额外收费）：

1. 在 Cloudflare 仪表盘把域名接入 Cloudflare DNS（免费档即可）。
2. Workers & Pages → world-chat → Settings → Domains & Routes →
   Add → Custom Domain，填如 `chat.example.com`，按提示完成。
3. 代码无需改动：前端与 WebSocket 都走同源，绑定后自动生效；
   `index.html` 里 Open Graph 的 `og:url` 记得同步替换成新域名。

## 常见问题

- `wrangler dev` 报找不到 `./dist`：先跑一次 `npm run build`（配置了静态资源后需要）。
- 手机上 PWA 图标不更新：iOS 会缓存 apple-touch-icon，换图标后需要重删重加。
