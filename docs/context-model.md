# 上下文模型

## 目标

让 Agent 在写入前同时理解画布结构、视觉约束、业务语义和历史变更，减少局部合理、整体错误的设计。

## 状态

### Validated

- 只提供局部节点与一句自然语言要求时，Agent 容易误判数据来源和区域关系。
- 有意义的图层命名显著降低重复理解成本。
- 历史脚本、节点 ID 和验证结果目前散落在对话与任务目录中。

### Hypothesis

- 一个项目级 manifest 加逐 run artifacts 能为多数局部编辑提供足够上下文。
- 业务语义应与画布结构分开存储，避免 Figma 节点树承担所有产品知识。

### Decision needed

- 哪些字段允许写入 Figma pluginData。
- 是否允许自动读取需求文档，还是由上层 Agent 显式注入摘要。
- evidence 脱敏导出的标准格式与默认保留期限。

### Decided

- 本地 context 与 evidence 默认位于项目内 `.figma-agent/`，并默认加入 `.gitignore`。
- 首次 binding 必须来自用户提供的 Figma 链接。
- binding 明确保存 file key、page ID 和可选 node ID；禁止通过当前打开文件自动选定目标。
- 后续 run 可以复用已保存的明确 binding。
- 每次执行默认保存任务脚本、结构化结果与 evidence。

## 四层上下文

### 画布上下文

- 节点树、ID、名称、类型与父子关系。
- 坐标、尺寸、Auto Layout、clip 和 scroll。
- 字体、样式范围、组件、实例、变量和 reactions。
- 当前选择、目标页面和相邻参考区域。

### 视觉上下文

- 修改前后截图。
- 参考页面与设计系统样例。
- 颜色、排版、间距、圆角和组件使用基线。
- 可接受的重叠、裁切和例外规则。

### 业务上下文

- 页面目的与核心用户任务。
- source content、summary、derived output 的关系。
- 数据来源、可编辑区域和程序生成区域。
- 不可改动的功能、导航与合规边界。

### 历史上下文

- 每次 run 的目的、脚本 hash 和目标节点。
- before/after、diff、preview 与 validation。
- 新增、修改、隐藏、移动和删除的节点。
- rollback 状态、失败原因和人工验收。

## Context manifest

`context.json` 保存低频、稳定、项目级的信息。临时需求与完整文档内容不直接复制进入 manifest，只保存引用、摘要和证据时间。

核心实体：

- `project`：项目身份与 Figma 目标。
- `binding`：由用户提供的 Figma 链接建立的 file/page/node 明确锁定。
- `pages`：页面用途与状态。
- `regions`：节点语义、来源、可编辑性和派生关系。
- `designSystem`：参考页、组件集、变量集合和样式偏好。
- `constraints`：不可编辑区、禁止操作和命名规则。
- `validation`：项目级验证 profile。
- `evidence`：项目内存储位置、默认 artifact 和 Git 忽略策略。

## Binding 模型

binding 至少记录：

- `id`：后续 job 引用的稳定本地 ID。
- `sourceUrl`：用户首次提供的 Figma 链接。
- `fileKey`：从链接解析并由 plugin 验证。
- `pageId`：目标 node 所属 page，或链接直接指向的 page。
- `nodeId`：可选；链接指向具体 node 时保存。
- `boundAt`：绑定时间。
- `verifiedFileName` 与 `verifiedPageName`：用于人类读回，不替代 ID 强校验。

首次 binding 禁止使用“当前打开文件”作为目标来源。当前文件只能验证用户链接是否匹配。后续 run 通过 binding ID 复用明确目标。

## Region 语义

建议 semantic role：

- `source-content`
- `summary-view`
- `generated-output`
- `navigation`
- `fixed-action`
- `scroll-viewport`
- `design-system-reference`
- `do-not-edit`

关系：

- `derivedFrom`
- `summarizes`
- `rendersInto`
- `controlledBy`
- `mustRemainSiblingOf`
- `mustRemainOutsideOf`

## Evidence 与数据最小化

- 每次执行默认保存任务脚本、job、结构化 result 和目标验证证据。
- 写操作继续保存必要的 before/after、diff、validation 与 preview。
- 默认根目录为 `.figma-agent/`，默认 Git 忽略。
- 用户可以显式导出脱敏 evidence，并自行选择提交。
- 默认保存路径或文档引用，不保存完整需求正文。
- 文本 inspect 默认返回摘要、字符数和样式范围；全文需要显式参数。
- image bytes 不写入 JSON。
- pluginData 进入 artifact 前按 allowlist 过滤。

## Freshness

每个外部引用包含：

- `sourceType`
- `sourceRef`
- `capturedAt`
- `contentHash`
- `summary`

Agent 在 hash 变化时应重新读取或停止写入。

## Schema

草案见 [schemas/context.schema.json](../schemas/context.schema.json)。
