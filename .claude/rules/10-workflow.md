# Workflow
- Web 开发优先使用 `npm run dev`，桌面联调优先使用 `npm run dev:desktop`。
- 提交前优先运行 `npm run lint`、`npm run typecheck` 与 `npm run test`。
- 涉及 provider、截屏翻译和 Prisma 持久化时，先确认当前实现是否是 stub，再决定是否扩展。
- 稳定事实优先写入 Basic Memory，而不是只留在对话上下文里。
