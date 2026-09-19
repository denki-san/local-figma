# 同类项目与差异化证据

复核日期：2026-09-17。读取默认分支 README 与官方文档；未安装第三方工具、未审计全部源码、未固定 commit，尚无同题实测。项目文档陈述与实际运行证据分别看待。

## 当前观察

| 方案 | 公开文档所述路径与重点 | 对本项目的启示 |
| --- | --- | --- |
| Figma 官方 MCP | 设计上下文读取及原生画布写入，推荐远程服务 | 原生写入和设计系统上下文已属共有能力 |
| noemuch/bridge | CSpec/scene graph 经编译器与 MCP 写入；知识库、recipes、设计系统规则 | 通用可信脚本运行时与设计系统编译流程有不同取舍 |
| MiHarsh/Figma-local-MCP | 插件导出 ZIP，本地消费 JSON、截图和视觉资产，提供语义与 Agent 引导 | 本地消费、视觉上下文和引导均已有实践 |
| Antonytm/figma-mcp-server | MCP、WebSocket 与开发插件协作，窗口持续打开 | 本地插件桥接属于基础机制 |
| mhue26/figma-mcp | Node MCP、独立 relay、桌面插件，操作当前文件 | 无 REST token、原生编辑、样式组件读取与图像导出均为基础能力 |

来源：[官方 MCP](https://developers.figma.com/docs/figma-mcp-server/)、[Bridge](https://github.com/noemuch/bridge)、[MiHarsh](https://github.com/MiHarsh/figma-local-mcp)、[Antonytm](https://github.com/Antonytm/figma-mcp-server)、[mhue26](https://github.com/mhue26/figma-mcp)。

## 旧印象修正

- Bridge 详细 README 当前将 MCP 列为传输层，强调编译器、知识库与 recipes；仓库简短描述仍提及 WebSocket。比较时优先使用详细架构并记录版本。[来源](https://github.com/noemuch/bridge)
- Antonytm README 仍有官方 MCP 只读的背景描述。Figma 当前官方文档明确支持原生画布写入，公开资料应使用当前官方依据。[项目背景](https://github.com/Antonytm/figma-mcp-server)、[官方现状](https://developers.figma.com/docs/figma-mcp-server/)
- mhue26 文档按当前打开文件操作；本项目使用显式链接绑定。这说明产品合同不同，不能据此推断对方整体安全性。[来源](https://github.com/mhue26/figma-mcp)
- MiHarsh 已提供语义与下一步提示，guide-check 的价值仍需真实使用验证。[来源](https://github.com/MiHarsh/figma-local-mcp)

## 本项目当前组合定位

以下为本地代码及自动测试证据，真实桌面验证范围见 desktop-acceptance.md。多文件兼容矩阵留作后续，独有性未获证明。

| 取舍 | 实现与证据 | 边界 |
| --- | --- | --- |
| CLI/JSON/文件作为核心接口 | bin/figma-local.mjs、tests/test_install.mjs | npm 尚未发布，跨系统兼容性待验 |
| 用户链接与目标复核 | src/project.mjs、tests/test_plugin.mjs | target gate 提供防误操作保护，可信脚本保留完整能力 |
| 结构先保存再执行 | tests/test_completion.mjs、tests/test_end_to_end.mjs | 快照属性有限，截图仍需独立 preview |
| 离线审查 | src/evidence.mjs、tests/test_evidence.mjs | 目标子树以外的变化不可见 |
| 分层质量证据 | src/validate.mjs、tests/test_validate.mjs | 视觉、交互、用户验收需真实检查 |
| 两场景准备流程 | src/guide.mjs、tests/test_guide.mjs | 输入齐全只表示可继续方案讨论或试做 |
| 断连后避免重放 | tests/test_plugin_ui.mjs、tests/test_recover.mjs | recover 清理桥接状态，文档 rollback 尚未实现 |

建议对外描述：

> 面向 CLI Agent 的本地 Figma 编辑运行时：显式绑定目标、写入前保存结构证据、离线审查修改结果，并为现有稿精修和参考引导的新设计提供两套流程。

基础能力归为共有能力；差异化描述使用组合定位及具体可验证行为。第三方文档未提及的能力标为“本次材料未确认”。本项目已提供声明式高风险确认，完整回滚和视觉回归保持待实现状态。

## 同题实测计划

使用用户授权的独立副本，记录每个工具的版本或 commit、系统、Node/Figma 与 Agent 配置。公开材料必须脱敏。

| 场景 | 相同任务 | 记录指标 |
| --- | --- | --- |
| 安装 | 干净目录到首次正确读取 | 人工步骤、配置、权限、耗时、诊断 |
| 精修 | 修改文字与间距，保留组件变量 | 改动范围、绑定保留、视觉返工、证据 |
| 新设计 | 相同内容、参考图和设备约束 | 澄清轮次、方向选择、可编辑性、视觉评分 |
| 部分失败 | 修改后报错，再断开通信 | 已执行范围、重复节点、恢复步骤、证据损失 |
| 错误目标 | 切换到其他文件后请求修改 | 拒绝行为、提示与是否误写 |

当前无第三方实测得分。安装更简单、效率更高或视觉更好的结论等待实测。
