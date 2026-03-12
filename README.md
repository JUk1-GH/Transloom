# Transloom

Transloom 是一个 **Electron + Next.js** 的本地桌面翻译应用，当前目标是把以下几条主线整理成一个清晰、可持续推进的单机产品：

- DeepL 风格的文本翻译工作区
- Bob 风格的沉浸式截屏翻译
- BYOK provider 配置与本地运行时
- 本地优先的 history / glossary / usage 持久化
- 明确收缩后的 account / billing 边界

当前仓库已经不只是脚手架：文本翻译、截屏翻译、provider 设置、history、glossary、usage 都有可运行的部分实现，但成熟度仍不均衡。

## 当前产品事实

### 已接通的主链路

- **文本翻译**：`/translate` → `/api/translate` → `translateText` → provider 选择 → glossary 预替换 → usage / history 写入
- **截屏翻译**：`/capture` → `/api/capture/translate` → OCR → 分区域翻译 → overlay layout → usage / history 写入
- **Provider 设置**：桌面设置页会通过 desktop bridge 保存本机设置，并通过 `/api/providers` 写入 provider 元数据
- **本地持久化**：history、glossary、usage、provider metadata 会优先落到本地 SQLite，缺失时回退到内存态

### 仍然是半成品的部分

- `DeepL` / `OpenAI` / `Google` 具名 provider 仍是 stub，占位多于真实适配
- `/api/provider-runtime` 仍是静态返回，尚未变成真正的运行时快照
- 截屏翻译虽然链路已通，但桌面端端到端 smoke 和异常恢复仍需补强
- account / billing 在本地版里被有意收缩：不是完整 SaaS 流程

## 本地版定位

当前仓库更接近 **本地单用户桌面应用**，不是在线 SaaS。

- `/account` 现在是本地账户视图，用来解释默认本地用户模型
- `/billing` 现在是本地用量与边界说明页，不再伪装成可结账页面
- `/api/billing/checkout` 会返回 `410`，明确拒绝旧的在线结账路径

这比保留一堆断掉的 auth / Stripe 线头更清晰。

## 关键目录

- `electron/`：桌面壳、窗口、快捷键、截图入口
- `src/app/`：页面与 App Router API
- `src/components/`：UI、workspace、desktop 相关组件
- `src/server/`：translation / history / glossary / billing / usage / provider 服务
- `src/lib/`：db、OCR、overlay layout、desktop client
- `prisma/`：本地数据库 schema 与 sqlite 文件
- `.harness/`：长时 Claude 开发控制平面

## 开发命令

```bash
npm install
npm run dev
npm run dev:desktop
npm run lint
npm run typecheck
npm run test
npm run build:desktop
```

说明：

- `npm run dev`：仅启动 Next.js
- `npm run dev:desktop`：同时启动 Next.js + Electron 壳
- `npm run test`：当前等价于 lint + typecheck
- `npm run build:desktop`：生产构建 web + electron

## Heavy Harness

仓库当前采用 **repo-local heavy harness**，而不是“轻量上下文文件 + 手工接力”的模式。

控制平面位于 `.harness/`：

- `.harness/bin/control-plane.mjs`：队列、租约、dispatch、状态查看
- `.harness/config/policies.json`：角色、重试、验证策略
- `.harness/prompts/`：implementer / verifier / reviewer 角色 prompt
- `.harness/state/`：运行态任务队列与事件账本（git ignored）
- `.harness/runs/`：每轮 prompt pack、日志和 run metadata（git ignored）

常用命令：

```bash
npm run harness:doctor
npm run harness:status
npm run harness:bootstrap
npm run harness -- lease --role implementer --owner claude-local
npm run harness -- dispatch --task FT-001 --role implementer --owner claude-local
npm run harness:supervise -- --role implementer --owner claude-local --exec
```

`feature_list.json` 继续承担 **功能盘点**；真正的可变执行状态在 `.harness/state/tasks.json`。

## 当前推荐实现顺序

1. 把具名 provider 从 stub 升级为真实适配器
2. 把 `/api/provider-runtime` 改成真实运行时快照
3. 加强桌面截屏翻译的 smoke 与异常恢复
4. 给 history / glossary 增加筛选与更完整的元数据
5. 明确 account / billing 是否永久保持本地说明模式

## GitNexus 约束

项目启用了 GitNexus 约束：

- 修改函数、类、方法前先做 impact analysis
- 若 blast radius 为 HIGH / CRITICAL，必须先告知风险
- 提交前运行 change detection（若 CLI 版本支持）
- 索引过期时先执行：

```bash
npx gitnexus analyze
```

## 快速 re-entry

```bash
./init.sh
./init.sh --start
```

- `./init.sh`：输出项目、命令、控制平面和 re-entry 提示
- `./init.sh --start`：在输出说明后启动桌面开发模式
