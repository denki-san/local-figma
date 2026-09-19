# ADR 0001：本地优先运行时

状态：Decided / Accepted for P0

## Context

真实任务已经验证本机 CLI、localhost bridge、Development Plugin 与 Plugin API 的链路。用户重视无需付费 REST API、原生可编辑图层和本地数据边界。

## Decision

- P0 bridge 只监听 `127.0.0.1`。
- P0 不提供公网绑定和 Hosted relay。
- 不要求 Figma REST API token。
- Figma Desktop 中的 Development Plugin 作为执行端。
- 用户必须已经对当前文件拥有足够的 Figma 编辑权限。
- 用户显式启动 Development Plugin，并在 CLI 工作期间保持插件窗口打开。
- 关闭插件窗口即断开 bridge，CLI 不再可用。
- P0 不做后台常驻、自动启动、隐式重连或 Community Plugin 分发。

## Consequences

- 用户需要保持 Figma 文件与 plugin 窗口打开。
- 安装步骤比 hosted MCP 多。
- 获得完整 Plugin API 编辑能力与清晰本地数据边界。
- 权限不足时工具不可用，运行时不会绕过或提升 Figma 权限。
- Hosted 服务不属于 P0；未来若重新评估，需要独立 ADR 与威胁模型。
