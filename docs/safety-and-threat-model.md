# 安全与威胁模型

本文区分当前 Alpha 控制和规划目标。当前事实以源码、[安全策略](../SECURITY.md) 和 [实现状态](implementation-status.md) 为准。

## 安全目标

- 在写入前检查当前 file/page/node 是否与用户意图一致，降低选错目标的概率。
- 首次写入目标只能来自用户提供的 Figma 链接，禁止以当前打开文件作为自动目标来源。
- 断连、超时和重试不会静默重复创建或扩大修改。
- 本机其他进程无法轻易伪造 plugin 或 CLI 请求。
- 凭证不进入正常任务证据；含设计内容的 artifacts 保留在本地忽略目录，分享前人工脱敏。
- 当前不自动撤销；未来 rollback 需证明不会覆盖用户或其他 Agent 的并发工作。

## 权限与执行能力

这两层必须分开理解：

1. **Figma 账户与文件权限**：用户必须已经对当前文件拥有足够的编辑权限。Plugin API 不能替用户获得权限；权限不足时工具不可用。
2. **Trusted JavaScript 执行能力**：CLI 把经过用户信任的本地 JavaScript 交给 Development Plugin。脚本可以使用当前插件环境允许的完整 Figma Plugin API，属于强执行能力。

target lock、file/page/node 校验、capability 声明和脚本 hash 都是防误操作与审计门禁。它们不构成安全沙箱，无法约束有意绕过约定的恶意脚本。

## 状态

### Validated

- bridge 可以限制监听 `127.0.0.1`。
- 每次启动生成临时 token，并在退出时清理 session 文件。
- 任务专属 file key、页面 ID 和 token 固化进模板会产生复用风险。
- 插件通过 `new Function` 执行脚本时拥有当前文件的 Plugin API 能力。
- Figma 文件编辑权限是外部前提，运行时不会扩大账户权限。
- 插件窗口关闭或后台暂停可能使心跳过期；bridge 和离线 result/history/wait 仍可用，新任务提交被拒绝。关闭前已领取任务需独立核验。

### Hypothesis

- target lock、capability manifest、脚本 hash 与本地目录 allowlist 能提高强执行能力的透明度和可审计性，但不会限制 trusted script 的 Plugin API 能力。
- 单 writer session 与 precondition hash 能发现大多数并发修改。

### Decided

- P0 保留 trusted local JavaScript 和完整 Plugin API 能力。
- P0 使用用户显式启动并保持打开的 Development Plugin。
- P0 不做常驻后台连接、Community Plugin 或 Hosted 服务。
- 核心协议 Agent 无关，不依赖 Codex 私有接口。
- 首次 binding 必须由用户提供 Figma 链接，后续只能复用保存的明确 binding。
- 每次执行默认保存脚本、结构化结果和 evidence，不要求逐次确认。
- 只有高风险操作进入确认门禁。
- evidence 默认保存在项目内 `.figma-agent/` 并默认被 Git 忽略。

### Decision needed

- 是否使用操作系统 keychain 存储长期配置。
- trusted script 的来源目录和签名/校验和交互。
- 高风险操作最终清单、批量阈值和确认记录格式。
- evidence 脱敏规则、保留期限和清理命令。

## 资产

- 用户的 Figma 文件、页面和组件库。
- 设计文本、图片和 pluginData。
- 本地 token、session 与 job 数据。
- Agent 生成的脚本和 run artifacts。
- 用户当前的 Undo 历史。

## 信任边界

```text
不可信：网页、评论、Figma 文本、第三方脚本、远程仓库
  │
  ▼
上层 Agent 审查与本地文件边界
  │
  ▼
CLI / bridge / plugin 受信运行时
  │
  ▼
用户有权编辑的 Figma 文件
```

target scope 是运行时约定和检查对象，不是 Plugin API 权限边界。

## 威胁与控制

| 威胁 | 影响 | P0 控制 | 后续控制 |
|---|---|---|---|
| 本机端口被调用 | 未授权 job | 回环监听、临时 token、session ID | 双向 challenge、Unix socket 评估 |
| 脚本越界 | 修改其他页面 | 调用方审阅来源、执行前 target 检查、有限子树 diff；可信脚本仍可越界 | capability 限制、目录白名单或 operation proxy |
| 隐式使用当前文件 | 写入错误文件 | 首次必须解析用户 Figma 链接并强校验 file key/page/node | binding 签名与人工可读摘要 |
| prompt injection | 执行设计内容中的指令 | 内容只作为数据，不从节点文本生成可执行代码 | taint 标记、策略扫描 |
| 断连重放 | 重复节点 | 单任务一次交付、running 先落盘、修改前快照确认、禁止自动重投 | 幂等 operation DSL、run key |
| 结果丢失 | 状态不明 | 先 inspect 再补偿 | node-change journal |
| token 泄漏 | 会话劫持 | 不写日志、退出清理、文件权限 | OS keychain 或进程间安全通道 |
| artifact 泄漏 | 设计内容外泄 | 本地忽略目录、文件权限、按需 preview、分享前人工脱敏 | 自动摘要/脱敏、加密、保留期限 |
| rollback 越界 | 撤销人工修改 | 不自动撤销；仅记录 Undo 边界 | 所有权证明、后置 hash、细粒度补偿日志 |
| 依赖供应链 | 任意代码执行 | lockfile、最少依赖、固定版本 | 签名发布、SBOM、provenance |
| 远程 bridge 暴露 | 网络攻击 | 明确禁止公网绑定 | Hosted 版本使用独立架构 |

## Trusted script 模型

可信脚本通道保留完整 Plugin API，必须公开说明：

- 用户先通过 Figma 账户与文件权限获得编辑能力；运行时不会授予或提升权限。
- 脚本拥有当前插件环境允许的完整 Plugin API 强能力。
- 它不是隔离沙箱。
- P0 只接受经过用户信任的本地文件，拒绝远程 URL 和 Figma 内容直接成为可执行脚本。
- 当前只支持 normal/high 风险声明，尚无 read/write/delete 等操作级 capability 限制。
- 删除能力尚未默认禁用；调用方必须审阅脚本，高风险修改应显式声明并准备恢复方案。
- 高风险 UI 展示目标范围、脚本内容和 hash；普通任务保存脚本与 hash，但没有逐次确认界面。
- target lock 可以发现常见误选，无法阻止恶意脚本访问同一插件环境中的其他可访问对象。

常规 trusted script 执行默认保存证据，不要求用户逐次确认。确认门禁只用于调用方显式声明为高风险的 job；自动分类尚未实现。

## 高风险操作候选（Hypothesis）

以下清单等待下一轮确认：

- 删除节点、页面或回滚备份。
- 修改 binding 目标以外的页面，或执行跨页批量写入。
- 修改主组件、变量集合、样式和其他共享定义。
- 修改 prototype starting points、页面 flow 或大范围 reactions。
- 超过待定节点数量阈值的批量修改。
- 调用 `triggerUndo`，或在无法证明最新 Undo 边界属于当前 run 时自动 rollback。

最终策略需要定义：风险分类规则、批量阈值、确认有效期、确认记录和无交互 Agent 的失败行为。

## Plugin 生命周期

- 用户显式启动 Development Plugin。
- CLI 工作期间插件窗口保持打开。
- 关闭插件会终止插件侧环境；本地 bridge 继续运行，未完成任务保持待核验，不自动重投。原型预览可能暂停后台心跳，先返回编辑页检查连接。
- P0 不尝试后台常驻、自动重启、隐式重连或 Community Plugin 分发。

## Transaction 安全（规划，尚未实现）

未来 transaction 拟采用受保护的 Undo/快照工作流，以下步骤不代表当前可用能力：

1. 校验 target 与前置 hash。
2. 保存快照和 preview。
3. 建立当前 run 可识别的 Undo 边界。
4. 串行写入。
5. 异常时只撤销当前 run 的最新边界。
6. 撤销后重新 inspect 并比较 hash。
7. 检测到并发变化时停止自动撤销。

它不提供跨文件、跨 plugin 或多人协作下的强原子性。

## 隐私

- evidence 默认写入项目内 `.figma-agent/`，该目录默认进入 `.gitignore`。
- 用户可以主动导出或提交经过脱敏的 evidence。
- 默认不启用遥测。
- 如果未来增加遥测，必须 opt-in、字段公开、支持本地查看和关闭。
- 当前没有自动 crash report 上传；本地运行证据可能包含文字、图片、file key 和脚本正文。
- 示例与 fixture 只能使用合成数据。

## 发布门禁

- threat model 评审完成。
- 至少在三个不同 Figma 文件完成并记录：局部文字修改、复杂布局修改、失败恢复。
- 三个案例共同证明链接 binding、目标锁定、断连后不盲目重放和结果读回验证。
- token 与 artifact 泄漏测试完成。
- 删除、断连、超时和并发场景完成。
- 依赖审计、SBOM 和发布校验和策略完成。
