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

默认翻译 Provider 是免密钥的 MyMemory，**不设置任何变量即可上线**。

想换自托管的 LibreTranslate 时（生产推荐，质量更稳、额度自控）：

```bash
npx wrangler secret put LIBRETRANSLATE_URL   # 例如 https://libretranslate.example.com
npx wrangler secret put LIBRETRANSLATE_KEY   # 自托管未开限流可跳过
```

密钥只放 Cloudflare 侧（secret / 仪表盘变量），不得写进仓库、`.env.example` 或提交记录。
按总纲要求，生产翻译不使用大模型（包括 GLM）；接入任何付费翻译 API 前必须先设预算上限。

## 部署后验收（阶段 4 体验）

用正式 URL 完成一次跨语言对聊检查：

1. 窗口 A：界面语言选「中文」，进入任一房间
2. 窗口 B（或手机）：界面语言选「English」，进入同一房间
3. A 发一条中文 → B 应看到英文译文，点「查看原文」能展开中文原文
4. B 回一条英文 → A 应看到中文译文，同样能查看原文
5. 同语言的窗口（两个都选中文）应只见原文，不触发翻译

## 免费层注意点

- **Workers 免费层**：每天 10 万次请求（东部时间零点重置）；超限报错停住，不会自动扣费。
- **Durable Object 免费层**：要求 SQLite 存储（已按 `new_sqlite_classes` 配置）；
  DO 有单独的免费额度与限制，超限同样是停住而不是扣费。
- **静态资源**：Workers Static Assets 免费提供，不占 Workers 请求额度。
- **翻译接口**：MyMemory 匿名额度按 IP 每日有限（开发期够用）；上量前建议自托管
  LibreTranslate（免费开源、零月费）并配置 `LIBRETRANSLATE_URL`。
- **不要打开付费功能**：不绑信用卡、不开 Workers Paid、不用 Smart Placement 等
  付费项；`wrangler.toml` 里保持只有免费配置。
- 日志排查用 `npx wrangler tail`（实时日志）；代码里已避免记录消息全文和密钥。

## 常见问题

- `wrangler dev` 报找不到 `./dist`：先跑一次 `npm run build`（配置了静态资源后需要）。
- 手机上 PWA 图标不更新：iOS 会缓存 apple-touch-icon，换图标后需要重删重加。
