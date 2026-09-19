# 路线图

## Decided

- P0 唯一首要用户是个人 Agent 用户。
- 用户必须已经对当前 Figma 文件拥有足够编辑权限。
- P0 使用 trusted local JavaScript，保留当前插件环境允许的完整 Figma Plugin API。
- target lock 是防误操作门禁，不是安全沙箱。
- P0 使用 CLI + Development Plugin；用户显式启动并保持插件窗口打开，关闭即断连。
- Community Plugin、后台常驻、Hosted 服务和自动高质量从零设计均不属于 P0。
- 项目以公益、生态扩散和社区共建为目的；采用 Apache-2.0，正式发布时加入标准 `LICENSE` 和版权主体。
- 核心协议 Agent 无关，不依赖 Codex 私有接口。
- 首次 binding 必须来自用户提供的 Figma 链接，禁止从当前打开文件自动选择目标。
- 每次执行默认保存脚本、结构化结果和 evidence；常规执行不逐次确认。
- evidence 默认写入 `.figma-agent/` 并默认 Git 忽略。

## P0：可靠本地运行时

目标：为个人 Agent 用户完成一个最小但可真实使用的精确编辑链路。

产品合同：

- 用户已经对当前 Figma 文件拥有足够编辑权限。
- 用户显式启动 Development Plugin，并在任务期间保持窗口打开。
- 关闭插件窗口即断开 bridge，CLI 不再可用。
- `run` 执行经过用户信任的本地 JavaScript，脚本拥有当前插件环境允许的完整 Plugin API。
- target lock 只用于防误操作，不构成安全沙箱。
- 所有 Agent 通过 CLI、JSON、文件和退出码接入。
- 首次 binding 从用户 Figma URL 解析 file key 与 node/page。

范围：

- `init`
- `bind`
- `connect`
- `status`
- `inspect`
- `run`
- `result`
- `preview`
- target lock
- 临时认证
- evidence artifacts
- 编辑权限前置检查
- trusted local JavaScript 执行
- 插件窗口生命周期与断连状态
- Agent 无关 JSON 接口
- `.figma-agent/` 默认 evidence
- high-risk confirmation gate

退出条件：

- 按 release-readiness.md 完成安装、已有稿精修、从零设计引导三条用户路径；多文件矩阵移入后续兼容验证（2026-09-17 用户范围收敛）。
- 首版案例保留首次链接 binding、目标锁定、不会盲目重放和结果可读回验证。
- 断连、旧 manifest、错误 target 和超时都有确定状态。
- 写入后能提供结构读回与 preview。
- artifact 不含 token 和真实敏感字段。
- 编辑权限不足时清楚失败。
- 插件窗口关闭后 CLI 明确断连并停止写入。

### 高风险操作候选（Hypothesis）

- 删除 node/page 或清理回滚备份。
- binding 外跨页写入。
- 修改主组件、变量集合、样式或页面级 prototype flow。
- 超过待定节点数量阈值的批量写入。
- 无法证明 Undo ownership 的 rollback 或 `triggerUndo`。

## P1：安全编辑闭环

范围：

- `snapshot`
- `diff`
- `validate`
- `rollback`
- `context.json`
- guarded transaction
- run history

退出条件：

- 故意中途失败的脚本能够安全撤销或进入 `needs-review`。
- 文字覆盖、Mixed typography、标签换行和越界样本可检测。
- source、summary、generated output 与 do-not-edit 语义可表达。

## P2：设计系统与视觉质量

范围：

- design-system discovery
- 高层 operation library
- screenshot diff 与视觉回归
- 组件、变量和样式复用建议
- 可选的 Agent-specific adapters

退出条件：

- 能在不修改全局库的前提下找到相邻页面组件与变量。
- 高层操作生成可审阅的低层 diff。
- 视觉回归能捕捉已知问题并控制误报。

## 暂缓

- Hosted 服务与 Hosted bridge。
- Community Plugin 与后台常驻连接。
- 普通设计师零配置安装体验。
- 多 Agent 并发写入。
- 无人工门禁的跨页重构。
- 自动发布组件与 variables。
- 全自动高质量从零设计。
- 团队级账号、计费与云 artifact。

## Decision gates

进入 P0 实现前：

- 确定 CLI 名称与包名。
- 确定 macOS/Windows、Figma Design/其他产品面与 Node 版本范围。
- 确定 trusted script 的来源目录、hash 锁定和审计交互。
- 确定 high-risk 最终清单、批量阈值和确认记录格式。
- 确定 evidence 脱敏规则、保留期限和清理命令。

进入 P1 前：

- 验证 Undo 边界与并发拒绝。
- 确定 artifact retention。

进入 P2 前：

- 确定 design-system discovery 的授权范围。
- 确定视觉回归是否引入额外本地模型或依赖。
