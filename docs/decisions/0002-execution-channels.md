# ADR 0002：可信本地脚本执行模型

状态：Decided / Accepted for P0

## Context

完整 Plugin API 覆盖来自可信 JavaScript。CLI 把本地 JavaScript 任务交给 Development Plugin 执行。Figma 账户与文件权限决定用户能否编辑；脚本能力来自当前插件环境允许的 Plugin API。两者是不同层级。

## Decision

P0 采用：

1. `run` 执行经过用户信任的本地 JavaScript，保留当前插件环境允许的完整 Plugin API。
2. `inspect`、`preview` 等内建命令使用固定、可审计的本地任务实现，减少每次临时生成脚本的差异。

trusted scripts 声明 hash、capabilities 和 target scope。远程 URL 和 Figma 内容不能直接成为脚本来源。

target lock、capability 声明、脚本 hash 和目标范围是防误操作及审计门禁，不是安全沙箱。恶意脚本仍可能使用当前插件环境允许的其他 Plugin API。

用户必须已经拥有当前文件的足够编辑权限。运行时不申请、不绕过、不提升 Figma 账户或文件权限。

## Alternatives

- 只允许 arbitrary JavaScript：开发快，安全与兼容难以治理。
- 只允许 declarative operations：安全性高，长期难以覆盖完整 Plugin API。
- 插件内暴露大量细粒度 RPC：接口数量和版本维护成本高。

## Consequences

- P0 保留最大的 Plugin API 灵活性。
- 用户需要明确理解本地脚本的强能力并只运行可信脚本。
- 目标门禁只能降低误操作，不能承担恶意代码隔离责任。
- 后续若需要更强隔离，必须另行设计 declarative operation proxy，不能只加强 target lock 文案。
