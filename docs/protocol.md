# Alpha 实际输出合同

适用版本：0.1.0-alpha.2。当前实现与未来规划分开维护；schema 范围见 [schemas](../schemas/README.md)。

## 提交、执行和证据

1. `run`、`inspect`、`preview`、`design-system` 返回 `{id,state:"queued",evidence}`。此时仅能确认任务入队。
2. 插件领取任务后持久化 `running`。run 在执行前等待 before.json 写入成功；声明高风险的 run 先等待插件 UI 确认。
3. 完成时先保存 result.json，再保存带 result 的 job.json，最后释放任务占用。
4. `result <id>` 从本地磁盘读取，插件关闭后仍可使用。它返回包装对象，实际执行结果在 `.result`。

包装对象包括 `source`、`evidence`、`result`、`checkpointFile`、`recordedState`、`journalComplete`、`recovery` 和 `instruction`。无结果时 result 为 null；recordedState 来自已保存日志，当前进程活跃性需另查 status。结果与日志落盘中途失败会形成 journalComplete=false，需保留现场并核查，避免重放脚本。

journalComplete 同时要求终态与 ok 一致、job.result 与 result.json 完全一致。`wait <id> [--timeout 30]` 周期读取同一份证据，额外返回 waitStatus：completed、timeout 或 needs-review。默认 30 秒，允许 1–300 秒；等待不调用桥接写接口，不停止或重投原任务。恢复提示未解决时提前返回 needs-review；已有一致终态优先报告 completed，并保留历史恢复提示。

持久化结果共有 `id`、`ok`、`finishedAt`。成功的普通结果包含 output、before、after、bindingVerified 和两个 not-run 评审标记；preview 包含 preview.png 的相对文件名、before 与 bindingVerified。失败结果包含字符串 error、executionStarted 和 recovery 提示，可能包含前后结构。

before/after 是有限属性子树。after 缺失表示没有可靠读回，null 表示确认目标已删除。preview 输出需另行查看；截图生成和视觉通过分别记录。

run 的修改前快照包含深度截断标记时，插件在保存 checkpoint 和执行脚本之前拒绝任务；请通过 --node 缩小范围。节点数量超预算同样拒绝写入。

桥接请求体上限为 16 MiB。插件 UI 按 UTF-8 字节计算结果大小，超限时省略 output、PNG 等大字段，回传 ok=false 的有界失败证据，并优先保留能够容纳的 after、before。服务器返回 413 时，下次仅回传精简失败证据，不重跑脚本。executionStarted=true 表示脚本可能已经修改文档，应保留已有 checkpoint，并独立 inspect 核验；结果大小失败不等同于修改已撤销。快照被省略时 diff 仍会拒绝缺失证据。

run 结果新增 undoBoundaries：before/after 各为 not-run、committed 或 failed。它只记录脚本前后 commitUndo 调用，旧结果可缺省此字段；自动撤销和恢复验证仍未实现。

任务可选字段 `targetNodeId` 对应 CLI 的 `--node`，当前接受数字冒号节点 ID。省略时沿用项目 binding.nodeId；指定时插件检查目标仍在该绑定节点子树内。before.id 与 bindingVerified.nodeId 使用本次实际目标，checkpoint 接口与 job.targetNodeId 对照校验。项目 bindingId 保持原值。风险确认 UI 显示本次实际节点。

插件 UI 为每个领取任务生成临时通道凭证，校验主线程回传的凭证和任务 ID，确认消息也绑定相同凭证；凭证不进入结果文件。这兼容桌面宿主不同的 MessageEvent.source 对象。

## 恢复与扩展

`status` 增加 `unresolved`，列出恢复后的未决任务；此时允许独立只读任务，阻止新的 run。`resolve` 仅接受当前会话对精确原目标的独立 inspect 和 `previousPluginStopped=true`，写入 `resolution.json`，原结果保持未知。`result`、`history` 的包装对象提供 `resolution`；未获得终态的 `wait` 返回 `needs-review`。

对确实不存在的目标，inspect 返回 `ok=false`、`executionStarted=false`、`targetMissing=true`、`missingNodeId`、`fileVerified`，以及 `error` 和 `recovery`。该结果只证明当前文件中查询不到指定节点。一般请求异常、越出绑定范围或错误文件均不生成缺失证据。

插件通过 `X-Figma-Session` 响应头识别桥接重启并刷新上下文。可选扩展配置接口仅向插件返回元数据和布尔配置状态，不返回 API key；接口和本机存储见[扩展文档](extensions.md)。

## Diff 语义

change.type 包括 created、deleted、updated、moved。同一个节点可同时 updated 和 moved。重命名、隐藏使用 updated.properties 表达；changedNodeCount 按节点去重。子树内删除与移出目标范围都可能显示 deleted，报告无法判断子树外的最终归属。

## 退出码

- 0：命令完成其本地职责。提交成功仍需读取结果；无结果的查询可能返回 0。
- 1：命令错误、已保存的执行失败、doctor 未就绪或 validate 检测失败。
- 2：validate 等待人工评审、guide-check 尚未达到执行准备条件，或 wait 超时/需要恢复核验。

调用方同时检查退出码和 JSON 字段，保留 stdout 中的失败证据。当前尚未提供跨版本兼容握手，升级后重新启动桥接与插件。

## 测试边界

贯通测试执行真实 CLI、回环 HTTP 和生成的插件代码，并检查磁盘任务、结果、diff 与 validate 合同。Figma 文档 API 使用模拟对象。开发期校验器采用 [Ajv 的 draft 2020-12 实现](https://ajv.js.org/json-schema.html)，终端用户安装无需该依赖。
