# ADR 0003：受保护 Undo transaction

状态：Proposed；Undo 边界记录已实现，自动恢复待证明

## Context

Plugin API 写入成功不能证明设计正确。脚本可能部分失败，用户也可能在执行期间手动编辑。Figma 提供 Undo 历史边界，但不提供数据库级跨参与方事务。

## Decision

`transaction` 定义为单 session、单 writer、目标受限的 guarded run：

- preflight 与前置 hash。
- before snapshot 与 preview。
- 明确 Undo 边界。
- 串行写入。
- exception 后仅撤销当前 run 拥有的最新边界。
- rollback 后重新 inspect 并比较 hash。
- 检测到并发变化时进入 `needs-review`。

## Consequences

- 局部脚本事故覆盖率需要真实故障案例验证，当前暂无覆盖率结论。
- 不能保证跨文件、跨 plugin、多人并发下的强原子性。
- artifact 与 hash 成为恢复正确性的必要证据。
- “rollback invoked” 不能作为“rollback verified”。

## 当前实现与未解决条件

每次 run 在前置检查通过后调用 commitUndo，执行结束后再次调用；脚本抛错也尝试结束边界。结果中的 undoBoundaries 分别记录两次调用状态。开始边界失败时不执行脚本，结束边界失败保留实际读回与错误。当前未调用 triggerUndo，也未提供 transaction 或 rollback 命令。

官方文档说明 [commitUndo](https://developers.figma.com/docs/plugins/api/properties/figma-commitundo/) 用于提交插件操作到撤销历史，[triggerUndo](https://developers.figma.com/docs/plugins/api/figma/) 触发撤销。文档没有提供可供本工具读取的历史栈顶任务身份；这是当前无法证明“仅撤销当前 run”的关键缺口。该结论来自接口文档检查，真实多人和多插件环境仍需实验。

实现自动恢复前必须解决：

1. 证明撤销边界属于当前任务，并能识别期间发生的用户或其他插件修改。
2. 快照覆盖需要恢复的属性、组件、变量、富文本与原型关系；当前有限子树快照覆盖不足。
3. 恢复动作失败或回传丢失后保留可读回证据，避免盲目重试撤销。
4. 通过独立测试副本验证成功、部分写入失败、用户插入修改和插件断连。

这些条件未满足前，保留证据并引导用户在测试副本核对修改。边界调用成功仅记录 API 动作，不声明撤销已验证或恢复已完成。
