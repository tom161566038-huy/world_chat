# Claude Code 工作约定

你在实现 WorldChat。先读 `PLAN.md` 和 `TASKS.md`，再动手。不要凭想象扩大范围。

## 每次开始时

1. 阅读 `PLAN.md` 和 `TASKS.md`。
2. 只做 `TASKS.md` 中当前第一个未完成的阶段。
3. 做完后：更新 `TASKS.md` 里该阶段的完成状态，提交一个语义清楚的 commit。
4. 停下来，等待审阅，不要自动开始下一阶段。除非用户明确说「继续下一阶段」。

## 硬约束

- 第一版只做文字聊天 PWA，禁止加入语音、视频、支付、原生 App。
- 生产翻译禁止默认走大模型（包括 GLM）。GLM 只用于本机写代码。
- 不得把 API 密钥写入仓库。使用 `.dev.vars` / 环境变量，并更新 `.gitignore`。
- 不得接入没有预算上限说明的付费翻译 API。
- 每条译文必须能查看原文。
- 保持 TypeScript 严格模式，公共类型放 `src/shared`。
- 改动保持最小，不要重构无关代码，不要新增未在当前阶段出现的依赖。

## 本地命令（脚手架阶段完成后）

```bash
npm install
npm run dev          # 前端
npm run dev:worker   # Cloudflare Worker 本地
```

本机仓库路径：`/Users/huyang/workspace/world_chat`。
