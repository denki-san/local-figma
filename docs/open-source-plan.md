# Figma Agent Local Runtime 开源方案

状态：Draft 0.1  
记录日期：2026-09-17
决策同步：2026-09-17 已完成 P0 用户、执行模型、连接合同与许可证同步

## 证据状态

### Validated

- 本机 CLI、localhost bridge、Development Plugin 与 Plugin API 的完整链路已经在真实文件中使用。
- 目标校验、临时认证、job 入队、result 回传和退出清理已经通过回环测试。
- 精确修改现有稿的稳定性明显高于缺少上下文的从零设计。

### Hypothesis

- 标准化 `inspect + snapshot + diff + preview + validate` 能形成可复用的安全编辑闭环。
- `context.json` 与 design-system discovery 能改善从零设计与复杂重构的质量。
- 基于 Undo 与快照的 guarded transaction 能覆盖多数单 Agent 局部编辑失败。

### Decided

- P0 唯一首要用户是个人 Agent 用户。
- P0 执行经过用户信任的本地 JavaScript，脚本可使用当前插件环境允许的完整 Figma Plugin API。
- 用户必须拥有当前 Figma 文件的足够编辑权限，显式启动 Development Plugin，并保持插件窗口打开。
- P0 采用 CLI + Development Plugin，不做后台常驻、Community Plugin 或 Hosted 服务。
- 项目以公益、生态扩散和社区共建为目的，决定采用 Apache-2.0。
- 核心协议 Agent 无关，只依赖 CLI、JSON、文件和退出码，不依赖 Codex 私有接口。
- 首次 binding 必须由用户提供 Figma 链接；后续可以复用保存的明确 binding。
- 每次执行默认保存脚本、结构化结果与 evidence，常规执行不逐次确认。
- evidence 默认写入 `.figma-agent/` 并默认 Git 忽略。
- 首版按安装、已有稿精修、从零设计引导三条路径验收；多文件矩阵归入后续。2026-09-17 按用户要求收敛，当前门槛以 release-readiness.md 为准。

### Decision needed

- 项目名与 CLI/npm 包名。
- P0 的操作系统、Figma 产品面、Node 与 Agent 兼容范围。
- trusted script 的来源目录、hash 锁定和审计交互。
- 高风险操作最终清单与批量阈值。
- evidence 脱敏规则、retention、遥测和维护投入。
- 这些问题集中记录在 [founder-questions.md](founder-questions.md)。

## 1. 产品定义

工作名称：`Figma Agent Local Runtime`

一句话定位：

> 一个让 Agent 通过本地 CLI 安全、可追踪、可验证地编辑原生 Figma 图层的运行时。

核心边界：

- 负责可靠操作、上下文供给、变更证据和恢复能力。
- P0 服务个人 Agent 用户，重点支持现有设计稿的精确修改。
- 上层 Agent 可以调用完整 Plugin API 创建页面，但 P0 不承诺自动从零生成高质量 UI。
- 从零设计的质量由业务上下文、设计系统、参考素材和视觉评审共同决定。
- 默认不提供“输入一句话自动生成高质量 UI”的承诺。

## 2. 设计原则

1. 权限前置：用户已经对当前 Figma 文件拥有足够编辑权限；工具不申请、不绕过、不提升账户权限。
2. 本地优先：bridge 只绑定 `127.0.0.1`，无需 Figma REST API token。
3. 显式连接：用户启动 Development Plugin 并保持窗口打开；关闭窗口即断开 bridge。
4. 原生可编辑：产物保持为 Text、Frame、Component、Instance、Variable 和 Prototype reaction。
5. 证据优先：传输成功、脚本成功、文档读回、视觉通过、真实点击通过分别记录。
6. 小步执行：一次 run 只修改一个明确区域或一组强相关节点。
7. 默认可恢复：删除属于显式能力；常规替换先隐藏或转移旧节点。
8. 防误操作门禁：每个 run 校验 file key、文件名、页面 ID、页面名和目标节点。target lock 不构成安全沙箱。
9. 可重入：脚本声明 run key、目标节点和预期前置状态，重复执行时拒绝、复用或更新，禁止静默制造副本。
10. 强能力透明：可信本地 JavaScript 保留当前插件环境允许的完整 Plugin API；能力声明和审计不等于能力隔离。
11. Agent 无关：核心协议使用 CLI、JSON、文件和退出码，不依赖 Codex 私有接口。
12. 链接绑定：首次目标只能从用户提供的 Figma 链接建立，禁止根据当前打开文件自动选定。
13. 默认留证：每次 run 保存脚本、结构化结果与 evidence；常规 run 不逐次确认。

## 3. 目标用户

P0 唯一首要用户：使用任意可调用 CLI、读取 JSON 和文件结果的 Agent，希望在本机精确修改 Figma 的个人用户。

该用户能够使用命令行，愿意显式启动 Development Plugin，并理解可信本地脚本拥有强编辑能力。

Codex、Claude Code 与其他 Agent 通过相同公开协议接入。核心运行时不得依赖线程、skill、memory 等 Codex 私有接口。

## 4. 非目标

- 替代 Figma 编辑器。
- 替代产品设计师和用户研究。
- 在没有业务上下文与设计系统时保证高质量 UI。
- 为普通设计师提供零配置安装体验。
- 运行来自网页、评论或未知仓库的任意脚本。
- 提供公网远程执行服务。
- 提供 Hosted 服务。
- 提供后台常驻连接或 Community Plugin 分发。
- 承诺跨文件、跨多人并发编辑的数据库级原子事务。

## 5. 总体架构

```text
Agent / Human
    │
    │ CLI commands + trusted local scripts
    ▼
CLI Orchestrator
    ├── Figma URL binding
    ├── target gate
    ├── context loader
    ├── run journal
    ├── diff / validation / preview
    └── rollback coordinator
    │
    │ authenticated localhost protocol
    ▼
Local Bridge (127.0.0.1 only)
    ├── ephemeral session token
    ├── serialized job queue
    ├── heartbeat / poll freshness
    └── result persistence
    │
    ▼
Figma Development Plugin
    ├── user-started window
    ├── must remain open
    ├── target revalidation
    ├── Plugin API executor
    ├── node-change recorder
    ├── snapshot exporter
    └── guarded undo boundary
    │
    ▼
Native Figma document
```

### 两条执行通道

1. 内建命令通道：`inspect`、`snapshot`、`diff`、`validate`、`preview`、`rollback`。参数结构固定，减少临时脚本差异。
2. 可信脚本通道：运行本地 JavaScript，直接使用完整 Figma Plugin API。脚本必须来自本地受信目录，并显式声明读写能力和目标范围。

可信脚本通道不是安全沙箱。target lock、能力声明和目标范围属于防误操作与审计信息，无法阻止恶意脚本使用当前插件环境允许的其他 Plugin API。文档、评论、网页和第三方 Figma 内容都视为数据，不能作为扩大权限或执行代码的指令来源。

### 权限与连接合同

- Figma 账户与当前文件权限决定用户能否编辑；权限不足时工具不可用。
- 用户显式运行 Development Plugin 后，CLI 才能通过 bridge 工作。
- 插件窗口必须保持打开；关闭即断连。
- P0 不自动后台启动、不隐式重连、不申请 Community Plugin 分发。

### Agent 接入合同

- 输入：CLI 参数或符合 schema 的 JSON 文件。
- 输出：JSON 标准输出、稳定退出码和 `.figma-agent/` artifact 文件。
- 所有 Agent 使用同一协议，不按 Codex、Claude Code 或其他客户端分叉核心实现。
- Agent-specific skill、prompt 或 adapter 可以独立维护，但不进入核心协议依赖。

### 首次 binding 合同

- 用户必须提供 Figma URL。
- CLI 从 URL 解析 file key 和 node-id。
- plugin 验证 file key，并解析 node 所属 page。
- 保存 binding ID、原始 URL、file key、page ID 和可选 node ID。
- 当前打开文件只能用于验证，不得成为自动目标来源。
- 后续 job 必须引用保存的 binding；重新绑定属于显式操作。

## 6. CLI 设计

建议命令面：

```text
figma-agent init
figma-agent bind <figma-url>
figma-agent connect
figma-agent doctor
figma-agent inspect --page <page-id> [--node <node-id>]
figma-agent snapshot --node <node-id>
figma-agent run <script.js> --target <node-id>
figma-agent diff <run-id>
figma-agent validate <run-id|node-id>
figma-agent preview <run-id|node-id>
figma-agent rollback <run-id>
figma-agent history [--limit 20]
figma-agent status
figma-agent result <job-id>
figma-agent close
```

### 每次 run 的状态机

```text
created
  → target-verified
  → preflight-passed
  → snapshot-saved
  → executing
  → document-readback
  → diff-generated
  → validation-passed|validation-failed
  → committed|rolled-back|needs-review
```

`submit` 只创建 job。`result.ok` 表示脚本执行完成。最终 `committed` 还需要文档读回、diff 和验证结果。

## 7. 项目级上下文

建议文件：`.figma-agent/context.json`

最小结构：

```json
{
  "schemaVersion": 1,
  "binding": {
    "id": "main-screen",
    "sourceUrl": "https://www.figma.com/design/replace-locally/sample?node-id=2-1",
    "fileKey": "replace-locally",
    "pageId": "1:2",
    "nodeId": "2:1",
    "boundAt": "2026-09-17T00:00:00Z"
  },
  "project": {
    "name": "example-project",
    "figmaFileName": "Example UI"
  },
  "pages": [
    {
      "id": "1:2",
      "name": "Main",
      "purpose": "核心产品页面"
    }
  ],
  "regions": [
    {
      "nodeId": "3:4",
      "name": "工作说明 Markdown｜完整正文",
      "semanticRole": "source-content",
      "sourceOfTruth": "docs/work-description.md",
      "editable": true
    },
    {
      "nodeId": "3:8",
      "name": "程序生成区",
      "semanticRole": "generated-output",
      "derivedFrom": ["3:4"],
      "editable": false
    }
  ],
  "designSystem": {
    "referencePages": ["4:1"],
    "preferredComponentSets": [],
    "preferredVariableCollections": []
  },
  "validation": {
    "requireMeaningfulNames": true,
    "rejectMixedTypography": true,
    "rejectOverflow": true,
    "rejectOutOfBounds": true
  },
  "evidence": {
    "root": ".figma-agent",
    "gitIgnored": true,
    "saveScript": true,
    "saveStructuredResult": true,
    "allowSanitizedCommit": true
  }
}
```

首次 binding 的 file key 与 node-id 必须来自用户提供的 Figma URL，并由 plugin 读回验证 page。公开仓库中的示例必须使用占位值。

## 8. Run artifacts 与历史

建议目录：

```text
.figma-agent/
├── context.json
├── config.example.json
└── runs/
    └── <run-id>/
        ├── run.json
        ├── script.js
        ├── before.tree.json
        ├── before.png
        ├── after.tree.json
        ├── after.png
        ├── diff.json
        ├── validation.json
        └── result.json
```

`run.json` 至少记录：

- 工具版本、Plugin API typings 版本和 schema 版本。
- 目标文件、页面、节点和预期前置 hash。
- 用户目标、修改原因和脚本 hash。
- 新增、修改、移动、隐藏、删除的节点 ID。
- bridge job ID、执行耗时和连接新鲜度。
- 结构验证、视觉检查和真实点击的独立状态。
- rollback 能力与限制。

每个 run 默认保存实际任务脚本、结构化 result 和目标验证 evidence。写任务继续保存必要的 before/after、diff、validation 与 preview。

`.figma-agent/` 默认加入 `.gitignore`。用户可以显式导出脱敏 evidence，再主动选择提交。常规执行不要求逐次确认；只有 high-risk job 需要确认记录。

临时测试脚本、测试日志和测试文档统一使用 `test_` 前缀。

## 9. `inspect`

输出稳定的语义树，减少 token 和节点噪声：

- ID、name、type、visible、locked。
- 父子关系、绝对坐标、尺寸、rotation。
- Auto Layout 方向、gap、padding、sizing 和 alignment。
- Text 的字符数、截断、最大行数、resizing、字体范围和 Mixed 状态。
- fills、strokes、effects、corner radius、opacity。
- component/instance/variant/variable bindings。
- scrolling、clipsContent、prototype reactions 和 overlay 关系。
- pluginData 中的 semantic role、run key 和 source mapping。

默认只读当前页和目标子树。全文件扫描需要显式参数，并兼容 dynamic page loading。

## 10. `snapshot` 与 `diff`

### Snapshot

每次写入前保存：

- 目标子树的规范化语义 JSON。
- 目标区域 PNG。
- 关键资源、组件和变量引用。
- 节点 hash 与父级顺序。

截图由目标节点 `exportAsync` 生成。页面级导出前先确保页面已加载。

### Diff

变更分类：

- `created`
- `updated`
- `moved`
- `renamed`
- `hidden`
- `deleted`
- `rebound`
- `prototype-changed`

diff 同时提供机器可读 JSON 和人类可读摘要。属性 diff 忽略不影响语义的浮点噪声，并对位置、尺寸、字体和 reaction 提供专用展示。

## 11. `validate`

MVP 规则：

### 结构

- 目标节点仍位于预期页面与父级。
- 新增节点拥有稳定名称和 run key。
- 不可编辑区域没有变化。
- 没有意外复制 prototype starting point。
- 组件实例和变量绑定没有丢失。

### 布局

- 子节点没有越过 clip 容器的允许边界。
- 固定区与滚动视口采用可验证的结构关系。
- Auto Layout 固定宽高与 sizing mode 一致。
- 圆形编号、按钮和标签没有换行或塌缩。
- 检测节点 bounding box 重叠；允许列表由 context 声明。

### 文字

- 先加载所需字体。
- 检测 Mixed 字号、字重、行高和 letter spacing。
- 检测截断、最大行数与 resizing mode 的组合。
- 检测可见文字溢出、空文字和异常字号。

### 视觉与交互

- 导出前后截图，生成像素差异热图属于后续能力。
- 读回 reactions 只能标记为“原型属性存在”。
- 真实点击验证单独标记为 `interactionVerified`。

## 12. `transaction` 与 `rollback`

Figma Plugin API 提供 Undo 历史边界。开源版本把 transaction 定义为“受保护的单次 Agent 操作”，不宣传为强原子事务。

### MVP 语义

1. 串行执行，写入期间禁止第二个 Agent job。
2. 执行全部只读 preflight。
3. 保存结构快照与截图。
4. 建立清晰的 Undo 边界。
5. 执行一个目标受限的写入脚本。
6. 发生异常时，仅在确认最新 Undo 边界属于当前 run 时触发撤销。
7. 撤销后重新 inspect，确认节点 hash 恢复。
8. 无法安全自动撤销时进入 `needs-review`，保留全部证据。

### 可恢复编辑策略

- 创建：记录全部新节点 ID，回滚时移除本 run 创建的节点。
- 替换：旧节点默认隐藏或移动到专用回滚区。
- 属性修改：记录修改前值；复杂节点同时保存克隆备份或结构快照。
- 删除：默认拒绝。只有显式 `--allow-delete` 才能执行，并要求额外快照。
- 人工并发修改：检测到目标 hash 或结构版本变化时停止自动回滚。

## 13. `design-system`

首版以检索与推荐为主，不自动大范围重构：

- 查找目标页和相邻参考页中出现频率高的组件、变量与文本样式。
- 输出“当前区域使用”和“可复用候选”的对应关系。
- 检测自绘元素与已有组件的潜在重复。
- 提供实例化示例脚本，由 Agent 审阅后执行。
- 不自动发布组件、修改团队库或全局 tokens。

## 14. 安全模型

- bridge 仅监听 `127.0.0.1`。
- 每次启动生成临时高熵 token，关闭时清除 session 文件和带令牌 UI。
- Figma manifest 只允许所需 localhost origin。
- 每个 job 校验 session、目标文件、页面和脚本 hash。
- Figma 编辑权限来自用户账户和当前文件，运行时不会提升权限。
- trusted JavaScript 拥有当前插件环境允许的完整 Plugin API；脚本 manifest 用于披露和审计，不是沙箱。
- target lock 是防误操作门禁，不是能力隔离。
- 首次 binding 必须来自用户提供的 Figma URL，禁止从当前打开文件推断目标。
- 拒绝远程 URL、stdin 管道和 Figma 文本内容直接作为可执行脚本。
- 运行产物默认过滤 token、用户文本全文、图片二进制和敏感 pluginData。
- 日志记录命令、目标、节点 ID 与结果，不记录密钥。
- 发布前建立 threat model、依赖锁定、代码签名或校验和策略。

### 高风险操作候选（Hypothesis）

- 删除 node/page 或清理回滚备份。
- binding 外跨页写入。
- 修改主组件、变量集合、样式等共享定义。
- 修改页面级 prototype starting point、flow 或大范围 reactions。
- 超过待定节点数量阈值的批量写入。
- 无法证明 Undo ownership 的 rollback 或 `triggerUndo`。

## 15. 技术选型建议

- 语言：TypeScript。
- CLI 与 bridge：Node.js 20+，尽量减少运行时依赖。
- 协议：本机 HTTP long polling 起步；协议版本化。
- Schema：JSON Schema + TypeScript 类型生成。
- Agent 接入：标准 CLI、JSON、文件与退出码；核心不依赖 Codex 私有接口。
- 测试：Node 单元测试、bridge 回环集成测试、Figma 真实文件烟雾测试。
- 插件：`documentAccess: dynamic-page`，优先使用当前异步 API。
- 分发：P0 使用 CLI + Development Plugin 源码，用户手动启动并保持窗口打开。
- P0 不评估 Community Plugin 或常驻后台连接。

## 16. 开源仓库结构

```text
figma-agent-local-runtime/
├── packages/
│   ├── cli/
│   ├── bridge/
│   ├── plugin/
│   ├── protocol/
│   ├── inspector/
│   └── validator/
├── examples/
│   ├── inspect-existing-screen/
│   └── safe-text-update/
├── docs/
│   ├── architecture.md
│   ├── security.md
│   ├── context-schema.md
│   └── agent-workflow.md
├── test_fixtures/
├── LICENSE                 正式发布时加入 Apache-2.0 标准文本
├── CONTRIBUTING.md
└── README.md
```

## 17. 版本路线

### v0.1：可靠连接与目标锁定

- `init`、`bind`、`connect`、`doctor`、`status`、`result`。
- 临时令牌、单任务队列、目标文件/页面门禁。
- `inspect` 和可信脚本执行。
- Agent 无关 JSON 接口和默认 `.figma-agent/` evidence。
- 回环集成测试与断连恢复说明。

验收：错误 manifest、过期 poll、错误页面和重复 submit 都能给出明确、可恢复的状态。

### v0.2：证据闭环

- `snapshot`、`diff`、`preview`、`history`。
- run artifact 目录与 schema。
- 文档读回与截图导出。

验收：一次局部修改可完整回答“改了什么、改到哪里、结构是否读回、截图在哪里”。

### v0.3：验证与恢复

- 文字、布局、命名、越界和 prototype validators。
- 受保护 Undo transaction。
- `rollback` 和 `needs-review` 状态。

验收：故意制造脚本异常后，能够撤销当前 run 或清楚报告无法自动撤销的原因，并保留证据。

### v0.4：设计上下文

- `context.json`。
- 业务语义、来源映射、不可编辑区域。
- design-system 检索。

验收：Agent 能正确区分 source content、摘要视图和 generated output，并复用既有组件或样式。

### v0.5：视觉评审

- 前后截图差异。
- 可配置的对齐、间距和字体基线。
- 视觉检查报告与人工审批点。

验收：工具能捕捉已知的覆盖、Mixed 字体、标签换行和越界样本。

## 18. 首个公开 MVP 的范围

P0 建议包含：

- 本机 bridge、CLI、Development Plugin。
- 文件/页面/节点目标门禁。
- `init`、`bind <figma-url>`、`connect`、`status`、`inspect`、`run`、`result`、`preview`。
- 临时认证与 evidence artifacts。
- Figma 编辑权限前置检查与清晰错误。
- 用户显式启动并保持 Development Plugin 打开的连接合同。
- trusted local JavaScript 完整 Plugin API 执行通道。
- Agent 无关 CLI/JSON 协议。
- 默认 `.figma-agent/` 留证与 Git 忽略策略。

P1 建议包含：

- `snapshot`、`diff`、`validate`、`rollback`、`context.json`。
- 基于 Undo 的实验性 rollback，清楚标记限制。

P2 建议包含：

- design-system discovery。
- 高层 operations。
- 视觉回归。

公开 MVP 暂缓：

- 多 Agent 并发。
- 远程 bridge。
- Hosted 服务。
- Community Plugin 与后台常驻连接。
- 自动发布团队组件或变量。
- 全自动从零设计。
- 未经人工确认的删除和跨页面大规模重构。

## 19. 后续完整验证规划

本节保留长期覆盖目标。2026-09-17 起，首版只采用 release-readiness.md 的用户路径清单，以下完整矩阵不构成当前发布阻塞项。

- 在至少三个不同 Figma 文件完成并记录局部文字修改、复杂布局修改和失败恢复。
- 三个案例必须共同证明链接 binding、目标锁定、断连后不盲目重放和结果可验证。
- 验证只读权限或编辑权限不足时给出清晰失败，不宣称能够绕过 Figma 权限。
- 验证插件窗口关闭后 status 明确显示断连，CLI 拒绝继续写入。
- 覆盖字体缺失、dynamic page、错误页面、断连、超时和脚本部分失败。
- 验证 Auto Layout、变量绑定、组件实例、prototype reaction 和滚动结构。
- 验证 Undo 只影响当前 run，并覆盖人工并发修改的拒绝路径。
- 确认所有示例移除真实 file key、页面 ID、用户内容和临时 token。
- 完成许可证选择、第三方依赖审计和安全说明。
- 用真实使用路径验证一次完整闭环：inspect → snapshot → run → diff → validate → preview → 用户检查 → commit/rollback。

## 20. 下一次继续的起点

下一次优先完成三个设计文档，再开始写实现：

1. `protocol.md`：Agent 无关 CLI/JSON、binding、bridge job、heartbeat、result 和错误码。
2. `inspect-schema.md`：稳定语义树、节点 hash 与 diff 规则。
3. `transaction.md`：Undo 边界、高风险确认、并发检测、删除策略和 rollback 验收矩阵。

随后先实现 `doctor + inspect + snapshot + preview` 的只读纵切面。这个纵切面能先验证协议、dynamic page、截图与 artifact 结构，也能为后续写入功能提供真实基线。

## 21. 官方 API 依据

- Figma Plugin API 的 `commitUndo()` 用于向 Undo 历史提交边界；`triggerUndo()` 用于撤销最近边界。transaction 方案据此定义为受保护 Undo 操作。
- `exportAsync()` 支持 PNG 等格式，可用于目标区域 preview。
- 新插件应使用 `documentAccess: dynamic-page`，并在访问页面内容前按需加载页面。
- manifest 的 `networkAccess` 可以将开发网络访问限制到 localhost。

## 22. 开源与许可证

- 项目目的为公益、生态扩散和社区共建。
- 决定采用 Apache-2.0。
- 当前方案阶段暂不生成最终 `LICENSE`。
- 正式发布时加入 Apache-2.0 标准许可证文本与明确版权主体。
