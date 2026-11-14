# WorldChat

全球实时翻译聊天室：你用自己的语言说话，别人看到的是他们正在使用的语言。

当前仓库里是第一版的总纲、任务拆分和目录骨架。实现工作按 `PLAN.md`、`TASKS.md` 和 `CLAUDE.md`，在本机用 Claude Code 完成。

本机项目路径：`/Users/huyang/workspace/world_chat`

## 文档

- [PLAN.md](./PLAN.md) — 产品与技术总纲
- [TASKS.md](./TASKS.md) — 分阶段任务，请严格按顺序做
- [CLAUDE.md](./CLAUDE.md) — 给 Claude Code 的工作约定
- [docs/DEPLOY.md](./docs/DEPLOY.md) — 部署到 Cloudflare 免费层的步骤与注意点

## 第一版范围

- 可安装的文字 PWA（手机优先，电脑也能用）
- 按话题进入房间，实时打字聊天；房间有可直接分享的 `/r/<slug>` 链接
- 用户可自建话题房间（限时开放：1/3/12/24 小时，到点自动关闭），
  大厅列表显示各房间在房人数
- 消息自动译成当前用户的语言，并始终可以查看原文
- 翻译走可替换的多 Provider 链条加缓存（Google 免费入口 + Workers AI
  免费层模型 + MyMemory 兜底；大模型仅限产品负责人批准的 Workers AI
  免费层多语言模型，外部付费翻译 / 大模型 API 禁止）
- 基础安全：限流、举报、简单过滤
- 部署在 Cloudflare 免费层

第一版不做语音或视频、不做原生 App、不做付费系统。
