# ADR 0006：Agent 无关协议与链接 binding

状态：Decided / Accepted for P0

## Context

运行时需要服务不同 Agent，同时避免根据 Figma Desktop 当前打开状态猜测写入目标。当前文件可以由用户切换，不能作为首次写入授权或目标来源。

## Decision

- 核心协议只依赖 CLI、JSON 输入输出、文件 artifacts 和稳定退出码。
- 核心实现不得依赖 Codex 线程、skill、memory 或其他私有接口。
- 首次 binding 必须由用户提供 Figma URL。
- CLI 从 URL 解析 file key 与 node-id；plugin 验证 file key，并解析 node 所属 page。
- binding 保存原始 URL、file key、page ID、可选 node ID、验证名称与时间。
- 当前打开文件只用于验证是否匹配，禁止作为自动目标来源。
- 后续 job 必须引用保存的 binding ID；重新绑定属于显式操作。

## Consequences

- Codex、Claude Code 与其他 Agent 可以复用相同核心协议。
- 错误打开文件不会静默成为写入目标。
- Agent-specific adapter 可以独立演进，不污染核心协议。
- binding 文件包含 Figma 标识，默认保存在 Git 忽略的 `.figma-agent/` 中。

