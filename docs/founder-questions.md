# 创始人问题

已确认的产品与治理问题标记为 `Decided`。2026-09-17 已完成 P0 用户、权限与执行能力、连接合同、非目标和许可证同步。剩余问题会影响 P0 实现边界，回答后应继续形成 ADR。

## Decided

### 1. P0 唯一首要用户

个人 Agent 用户：已经使用 Codex、Claude Code 或其他 Agent，能够使用命令行，并愿意显式运行 Figma Development Plugin。

P0 不以普通设计师、设计系统团队或企业管理员为首要用户。

### 2. Figma 权限前提

用户必须已经对当前 Figma 文件拥有足够编辑权限。工具不申请、不绕过、不提升 Figma 账户或文件权限；权限不足时写入能力不可用。

### 3. Trusted JavaScript 执行模型

P0 继续使用可信本地脚本：CLI 把 JavaScript 任务交给 Development Plugin，脚本可以使用当前插件环境允许的完整 Figma Plugin API。

file/page/node target lock、capability 声明和脚本 hash 是防误操作与审计门禁。它们不是安全沙箱，无法约束有意绕过约定的恶意脚本。

### 4. 分发与连接合同

P0 采用 CLI + Figma Development Plugin：

- 用户显式启动插件。
- CLI 工作期间插件窗口保持打开。
- 关闭插件窗口即断开 bridge，CLI 不再可用。
- P0 不做常驻后台连接、自动启动、Community Plugin 或 Hosted 服务。

### 5. 项目目的与许可证

- 项目以公益、生态扩散和社区共建为目的。
- 决定采用 Apache-2.0。
- 当前方案阶段暂不生成最终 `LICENSE`。
- 正式发布时加入 Apache-2.0 标准许可证文本与明确版权主体。

### 6. P0 非目标

- 普通设计师的零配置安装体验。
- Hosted 服务与远程 bridge。
- 自动从零生成高质量 UI 的承诺。
- Community Plugin 和后台常驻连接。

### 7. Agent 无关协议

- 任何能够调用 CLI、读取 JSON 和文件结果的 Agent 都可以集成。
- 核心协议使用 CLI 参数、JSON、文件 artifact 和退出码。
- 核心实现不得依赖 Codex 线程、skill、memory 或其他私有接口。
- Codex、Claude Code 与其他客户端的 skill/adapter 可以独立维护。

### 8. Figma 链接 binding

- 首次 binding 必须由用户提供 Figma 链接。
- CLI 解析 file key 与 node-id，plugin 验证并解析所属 page。
- 禁止只根据“当前打开文件”自动决定写入目标。
- 后续 run 可以复用 `.figma-agent/context.json` 中保存的明确 binding。

### 9. 默认执行与 evidence

- 每次执行默认保存任务脚本、结构化结果和 evidence。
- 常规执行不要求用户逐次确认。
- 只有 high-risk job 进入确认门禁。
- evidence 默认保存到项目内 `.figma-agent/`，该目录默认加入 `.gitignore`。
- 用户可以主动导出或提交脱敏 evidence。

### 10. MVP 公开门槛

至少在三个不同 Figma 文件分别完成并记录：

1. 局部文字修改。
2. 复杂布局修改。
3. 失败恢复。

三个案例需要共同证明目标绑定正确、断连后不会盲目重放、执行结果可以验证。

## 下一轮最关键的未决问题

### 1. 项目名、CLI 名和包名是什么？

需要同时检查：

- npm 包名可用性。
- GitHub 仓库名可用性。
- 是否容易与 Figma 官方产品或其他 bridge/MCP 项目混淆。
- 商标与命名政策风险。

当前候选方向：`figma-agent-runtime`、`figma-local-agent`、`figma-bridge-cli`。

### 2. P0 兼容范围是什么？

需要明确：

- 只支持 macOS，还是同时支持 Windows。
- 只支持 Figma Design，还是覆盖 FigJam、Slides、Buzz 或 Dev Mode。
- Node 最低版本。
- 首批明确验证的 Agent 客户端。

当前证据主要来自 macOS Figma Desktop，应避免无证据的跨平台承诺。

### 3. 哪些操作最终属于高风险？

需要决定：

- 删除 node/page 和清理回滚备份是否全部需要确认。
- binding 外跨页写入是否允许，以及如何展示影响范围。
- 主组件、变量、样式和 prototype flow 的风险等级。
- 批量修改从多少节点开始进入确认门禁。
- `triggerUndo` 与自动 rollback 的确认和 ownership 条件。

常规任务不逐次确认已经确定。下一轮只需要确认 high-risk 分类、阈值和确认记录格式。

### 4. Evidence 保留和脱敏细节是什么？

需要决定：

- 默认是否保存节点文字全文。
- before/after PNG 是否默认开启。
- file key、页面名和 pluginData 如何脱敏。
- 默认 retention 天数和一键清理方式。
- 一键清理与脱敏导出命令的合同。

### 5. CLI、bridge 与 plugin 如何做版本协商？

需要决定：

- 协议版本字段和兼容窗口。
- plugin 版本过旧时是拒绝运行还是降级。
- schema 破坏性变更如何迁移。
- run artifact 如何记录工具链版本。
- Figma Plugin API typings 更新节奏。

## P0 开始后仍需回答

### 遥测

- 完全无遥测。
- opt-in 匿名命令与错误码。
- 仅用户主动提交诊断包。

设计内容敏感，任何遥测都不能采集 file key、节点文字、图片、token 和脚本正文。

### 维护投入

- 每周可投入多少时间。
- 支持哪些平台和 Figma 更新。
- issue 响应与安全修复时限。
- 哪些模块接受社区维护者负责。

### Agent adapter

- 是否提供官方 Codex、Claude Code 或 MCP adapter。
- adapter 的发布节奏是否与核心 CLI 解耦。

核心协议 Agent 无关已经确定；adapter 只是可选分发层。

## P0 以后再评估

- design-system discovery 的团队使用场景。
- declarative operation DSL。
- 多模态视觉评审与本地模型。
- 多 Agent 与人工并发协作。
- Hosted 服务是否永远维持非目标。
- 公益项目是否需要赞助、基金会或企业捐助治理。
