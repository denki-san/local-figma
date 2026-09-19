# ADR 0007：默认留证与高风险确认

状态：Decided / Accepted for P0

## Context

个人 Agent 用户需要连续执行工作流。所有操作逐次确认会破坏效率；完全无门禁又不适合删除、跨页修改和共享定义变更。

## Decision

- 每次执行默认保存实际任务脚本、结构化 result 和目标验证 evidence。
- evidence 默认位于项目内 `.figma-agent/`。
- `.figma-agent/` 默认加入 `.gitignore`。
- 用户可以显式导出脱敏 evidence，并主动选择提交。
- 常规操作不要求逐次确认。
- 只有被判定为 high-risk 的 job 进入确认门禁。

## Hypothesis：高风险候选

- 删除 node/page 或清理回滚备份。
- binding 外跨页写入。
- 修改主组件、变量集合、样式或页面级 prototype flow。
- 超过待定数量阈值的批量写入。
- 无法证明 Undo ownership 的 rollback 或 `triggerUndo`。

## Decision needed

- 最终 high-risk 清单。
- 批量节点阈值。
- 确认记录格式、有效期和无交互模式行为。
- evidence retention、脱敏字段和清理命令。

