# 架构

本文保留架构规划与历史工作流观察。当前开源代码能力以 [实现状态](implementation-status.md) 和 [实际协议](protocol.md) 为准；历史真实文件成功记录需要在当前版本重新验收。

## 架构状态

### Validated

- CLI、localhost bridge、Development Plugin 与 Plugin API 的链路已经在真实文件中工作。
- 独立任务目录、临时认证、队列、poll、result 和退出清理已经通过回环模拟。
- 目标文件名、页面名、页面 ID 和可选 file key 可以在 plugin 执行前校验。

### Hypothesis

- 把 inspect、snapshot、diff、preview 和 validate 做成稳定内建命令，可以减少每个 Agent 重写脚本造成的不一致。
- node-change recorder 与节点 hash 能支持并发检测和可靠 diff。

### Decision needed

- P0 采用 HTTP long polling 还是 WebSocket。
- CLI、bridge、plugin 使用 monorepo 还是单包分发。

### Decided

- P0 使用 trusted local JavaScript，拥有当前插件环境允许的完整 Plugin API。
- 用户必须拥有当前文件的足够编辑权限。
- 用户显式启动 Development Plugin 并保持窗口打开；关闭即断连。
- target lock 只作为防误操作门禁，不是安全沙箱。
- 核心协议 Agent 无关，只依赖 CLI、JSON、文件和进程退出码，不依赖 Codex 私有接口。
- 首次 binding 必须解析用户提供的 Figma 链接，禁止从当前打开文件自动选择写入目标。
- 每次执行默认保存脚本、结构化结果和 evidence；常规执行不逐次确认，高风险操作进入确认门禁。
- evidence 默认位于项目内 `.figma-agent/`，并默认被 Git 忽略。

## 组件

```text
Agent / Human
  │
  ▼
CLI Orchestrator
  ├── config 与 target lock
  ├── context loader
  ├── job builder
  ├── artifact writer
  └── validator runner
  │ authenticated localhost protocol
  ▼
Local Bridge
  ├── ephemeral session
  ├── serialized queue
  ├── heartbeat freshness
  └── result store
  │ polling
  ▼
Figma Development Plugin
  ├── user-started window
  ├── must remain open
  ├── target revalidation
  ├── built-in operations
  ├── trusted script executor
  ├── inspect/export adapters
  └── Undo coordinator
  │
  ▼
Figma document
```

## 协议原则

- Agent 通过命令行参数或 JSON 文件提交请求，通过 JSON 标准输出、退出码与 artifact 文件读取结果。
- 核心协议不调用 Codex 线程、skill、memory 或其他私有接口；Codex、Claude Code 与其他 Agent 只是适配层。
- bridge 只监听回环地址。
- 启动时创建 session ID 与 token，plugin UI 从本次任务目录读取配置。
- plugin 持续 poll，bridge 用 `pollAgeMs` 表示连接新鲜度。
- job 是不可变对象，包含目标、能力、脚本 hash、预期前置 hash 和超时。
- 同一 session 串行执行写 job；只读 job 是否并行需要后续评估。
- `result.ok` 表示 executor 完成；最终 run 状态由读回、diff 和 validate 决定。
- job result 落盘前过滤 token 与敏感数据。

## Binding

首次绑定流程：

```text
用户提供 Figma URL
→ CLI 解析 file key 与 node-id
→ plugin 验证当前打开文件的 file key
→ plugin 解析目标 node 与所属 page
→ CLI 明确展示并保存 file key / page ID / node ID
→ 后续 job 引用保存的 binding ID
```

规则：

- 首次 binding 的输入必须是用户提供的 Figma 链接。
- 链接指向 node 时，同时保存 node ID 与其所属 page ID。
- 链接指向 page 时，保存 page ID，node ID 可以为空。
- 当前打开文件只用于验证链接目标是否已打开，不能成为目标来源。
- file key 或 page/node 不匹配时拒绝执行。
- 后续可以复用 `.figma-agent/context.json` 中的明确 binding。

## 目标锁定

每次 job 必须引用保存的 binding，并匹配：

- file key，必填强校验。
- 文件名，作为用户可见辅助校验。
- page ID 与 page name。
- target node ID、name、type 与 precondition hash。
- 允许修改的 subtree 或 node ID 集合。

任一强校验失败时停止写入。

这些校验用于发现常见误选和前置状态变化。trusted script 仍拥有当前插件环境允许的完整能力，target lock 不提供恶意代码隔离。

## Dynamic page loading

新插件使用 `documentAccess: dynamic-page`。访问 PageNode 内容前调用相应的异步加载方法；跨页扫描属于显式高成本操作。样式、reaction 和变量相关操作优先使用当前异步 API。

## 执行通道

### Built-in operations

P0 提供 inspect 与 preview；P1 增加 snapshot、diff、validate 和 rollback。输入输出受 schema 约束。

### Trusted scripts

脚本直接获得 Figma Plugin API 上下文，保留完整能力。运行时要求：

- 本地文件路径。
- 脚本 hash。
- capability 声明。
- target scope。
- 超时与结果大小限制。
- 运行日志与变更节点列表。

Figma 账户与文件权限属于平台前提；权限不足时无法写入。capability 与 target scope 用于披露和审计，不会把完整 Plugin API 变成受限沙箱。

## Plugin 生命周期

- 用户显式启动 Development Plugin。
- plugin 窗口打开且保持 poll 时，bridge 才处于 connected。
- 关闭 plugin 窗口后 `status` 应显示断连，CLI 拒绝继续写 job。
- P0 不提供常驻后台连接、自动启动、隐式重连或 Community Plugin。

## Run artifacts

每个 run 默认在 `.figma-agent/runs/<run-id>/` 保存任务脚本、job、结构化 result 和 evidence。写任务继续保存 before/after 语义树、preview、diff、validation 与 rollback 记录。artifact 的敏感字段通过 schema 标注并过滤。

`.figma-agent/` 默认加入 `.gitignore`。用户可以显式导出脱敏 evidence，再自行决定是否提交版本库。

常规 run 不要求逐次确认。运行时根据 job risk 元数据判断是否进入高风险确认门禁。

### 高风险操作候选（Hypothesis）

- 删除 node/page 或清理回滚备份。
- binding 外跨页写入。
- 修改主组件、变量集合、样式等大范围共享定义。
- 修改页面级 prototype starting point 或大范围 reactions。
- 超过待定数量阈值的批量写入。
- 无法证明 Undo ownership 的 rollback 或 `triggerUndo`。

## 生命周期

```text
created
→ target-verified
→ preflight-passed
→ snapshot-saved
→ executing
→ document-readback
→ evidence-generated
→ committed | rolled-back | needs-review | failed
```

## 失败恢复

- `pollAgeMs: null`：插件未连接，禁止 submit 写 job。
- queued 长期不下降：检查当前 Development Plugin manifest 和 bridge session。
- result 丢失：先 inspect 目标节点，再决定补偿，禁止直接重放 create 脚本。
- script 部分失败：进入 guarded rollback；读回验证恢复结果。
- 目标 hash 变化：视为并发修改，停止自动恢复并进入 `needs-review`。

## P0 接口

- `init`
- `bind <figma-url>`
- `connect`
- `status`
- `inspect`
- `run`
- `result`
- `preview`

P0 必须同时交付 Agent 无关 JSON 协议、明确 binding、target lock、临时认证和 evidence 基础结构。
