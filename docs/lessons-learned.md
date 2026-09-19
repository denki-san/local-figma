# 历史经验

本文件只记录可迁移的使用经验，不包含具体设计稿内容、真实 file key、页面 ID 或临时凭证。

扩展整理见 [历史使用经验汇编](historical-practices.md)：70 条连接、执行、布局、原型、上下文、恢复和版本复用经验，区分历史观察、操作守则与产品建议。历史验证结果与当前开源实现状态分别记录。

## Validated：连接与执行

- 主链路应保持为 CLI → localhost bridge → Development Plugin → Plugin API。
- bridge 启动、plugin 导入和 plugin 有效连接是三个不同状态。
- `pollAgeMs: null` 表示没有可用 plugin 连接。
- `submit` 返回 ID 只表示入队；`result.ok` 才表示脚本执行完成。
- 脚本完成后仍需文档读回、preview 和必要的真实点击。
- 超时或断连后先 inspect 当前文档，禁止盲目重放 create 脚本。
- 关闭 bridge 不会删除已有设计，会中断当前和后续自动修改。

## Validated：目标与权限

- 每个任务使用独立目录、独立 manifest 配置和临时 token。
- 执行前重新验证文件、页面和节点。
- 同名旧 Development Plugin 可能指向失效 manifest；“已导入”不代表当前任务插件正在运行。
- 任务专属标识与临时 token 不能固化到通用模板。
- browser/computer use 只承担加载、视觉检查和真实点击，不承担逐节点主生成。

## Validated：设计与上下文

- Agent 只看到局部节点时容易误解内容来源、摘要关系和程序生成区域。
- 图层命名能显著降低重复理解成本。
- 从零设计需要设计系统、页面结构、同类参考和业务语义。
- API 属性写入成功不能证明视觉正确。
- 小步修改加局部截图是目前最可靠的迭代方式。

## Validated：Figma 陷阱

- 写 Text 前先 `loadFontAsync`。
- 单个 Text 图层也可能有 Mixed 字体属性。
- truncate、max lines、resizing mode 和容器 clip 存在组合关系。
- Auto Layout 默认 sizing 可能让标题、按钮或标签收缩。
- 克隆 frame 可能复制 prototype starting point。
- reactions 存在不能证明真实点击路径可用。
- 固定滚动区域可以通过滚动视口与固定区域同级化提高可靠性。

## Validated：恢复策略

- 默认隐藏或移动旧节点，稳定后再清理。
- 新节点使用稳定名称和 run key。
- 每批返回全部变更节点 ID。
- 删除属于显式高风险能力。
- rollback 后必须再次 inspect，不以 Undo 调用成功作为恢复证明。

## Hypothesis

- 规范化 inspect 树和项目 context manifest 能显著减少语义误判。
- snapshot、diff、preview 和 validators 可以把 Agent 编辑从脚本调用提升为可审计工作流。
- guarded Undo transaction 可以覆盖单 Agent、单局部 run 的主要失败。

## Decided

- P0 唯一首要用户是个人 Agent 用户。
- P0 使用 trusted local JavaScript 和当前插件环境允许的完整 Plugin API。
- Figma 编辑权限属于使用前提；target lock 只是防误操作门禁，不是安全沙箱。
- P0 使用用户显式启动并保持窗口打开的 Development Plugin。
- P0 不做 Community Plugin、后台常驻或 Hosted 服务。
- 决定采用 Apache-2.0，正式发布时再加入标准 `LICENSE` 和版权主体。
- 核心协议 Agent 无关，不依赖 Codex 私有接口。
- 首次 binding 必须来自用户提供的 Figma 链接。
- 每次 run 默认把脚本、结构化结果和 evidence 保存到 Git 忽略的 `.figma-agent/`。
- 常规 run 不逐次确认，只有 high-risk job 进入门禁。
- MVP 公开门槛是三个不同 Figma 文件上的文字修改、复杂布局修改和失败恢复。

## Decision needed

- preview 是否成为每次写入的强制步骤。
- run history、preview 与 evidence 默认保留多久。
- trusted script 的来源目录、hash 锁定和审计交互。
- high-risk 最终清单、批量阈值和确认记录格式。
- CLI、bridge 与 plugin 的版本兼容策略。

更完整的原始复盘见 [usage-learnings.md](usage-learnings.md)。
