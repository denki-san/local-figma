# 验证与 QA

本文包含验收目标与未来能力清单，逐项完成状态以 [实现状态](implementation-status.md) 为准。当前 inspect 返回有限属性与完整 characters，preview 尚无独立尺寸/hash 元数据，page 绑定同样要求 node-id。下文的 bind、广泛属性覆盖与完整恢复条目包含尚未实现的规划，不能据此推断已支持。

失败恢复可从 [合成文字故障与恢复案例](../examples/recovery/README.md) 开始，先在独立授权副本验证。该案例覆盖指定文字字段，完整文档恢复仍需额外实现与验证。

## 证据分层

### Validated

历史任务证明下列状态必须分开：

1. CLI 请求已入队。
2. plugin 脚本返回 `ok`。
3. 文档节点读回符合预期。
4. preview 视觉检查通过。
5. prototype 真实点击通过。
6. 用户验收通过。

### Hypothesis

统一 validation schema 和标准失败样例能够减少不同 Agent 的主观报告差异。

### Decision needed

- P0 是否把 preview 设为写入后的强制步骤。
- headless CI 能覆盖哪些能力，哪些必须保留真实 Figma 文件烟雾测试。

### Decided

- MVP 公开前必须在三个不同 Figma 文件完成并记录局部文字修改、复杂布局修改和失败恢复。
- 首次 binding 必须从用户提供的 Figma 链接解析，不能从当前打开文件推断。
- 每次执行默认保存任务脚本、结构化结果和 evidence。
- evidence 默认位于 `.figma-agent/` 并默认 Git 忽略。
- 常规执行不逐次确认；高风险操作进入确认门禁。

## 验证层级

| 层级 | 证明内容 | 不能证明 |
|---|---|---|
| Unit | schema、hash、diff、validator 逻辑 | Figma 实际行为 |
| Bridge integration | 认证、队列、poll、result、清理 | 文档写入正确 |
| Plugin readback | 节点、尺寸、样式、reaction 已写入 | 视觉合理 |
| Preview | 截断、覆盖、字号、层级可见 | 点击路径与用户理解 |
| Interaction | 真实点击和返回路径 | 真实产品状态恢复 |
| User acceptance | 用户目标达成 | 其他场景自动成立 |

## P0 验收

### init/connect/status

- 新任务目录不覆盖已有目录。
- bridge 只监听回环地址。
- token 不出现在 CLI 普通输出和 result artifact。
- fresh poll、stale poll 和 disconnected 状态可区分。
- 同名旧 manifest 能被诊断为路径不匹配。

### bind

- 没有用户提供的 Figma URL 时，首次 binding 拒绝创建。
- 从 URL 解析 file key 和 node-id；plugin 读回 node 所属 page 并保存 page ID。
- 只有 page 目标时允许 node ID 为空。
- 当前打开文件与 URL file key 不匹配时拒绝绑定。
- 保存 binding 后，后续 job 必须引用 binding ID。
- 删除或更换 binding 属于显式操作，不能由 Agent 静默改写。

### inspect

- 同一子树多次 inspect 输出稳定排序。
- Mixed typography、Auto Layout sizing、scroll、clip、变量和 reactions 可表达。
- 默认不返回完整文本与图片 bytes。
- dynamic page 未加载时给出可恢复错误或自动按目标加载。

### run/result

- 错误文件、页面、节点或前置 hash 时拒绝写入。
- job ID 与 run ID 可关联。
- `queued`、`running`、`ok`、`failed`、`unknown-after-disconnect` 可区分。
- 超时后先读回状态，CLI 不自动重放。
- 每次 run 默认保存实际任务脚本、结构化 result 与目标验证 evidence。
- 常规 run 不等待用户逐次确认；high-risk job 没有确认记录时拒绝执行。

### preview

- 指定节点导出 PNG。
- artifact 记录 node ID、尺寸、scale 和 hash。
- 导出失败不把 run 标记为视觉通过。

## P1 validators

### 结构

- 目标仍在授权父级。
- 不可编辑区 hash 未变化。
- prototype starting point 没有意外复制。
- component 与 variable binding 未丢失。

### 布局

- 文本和子节点没有异常越界。
- 固定操作区处于滚动视口外的预期层级。
- Auto Layout sizing 与固定尺寸一致。
- 圆形编号、按钮和标签没有压缩换行。

### 文字

- 写入字体已加载。
- 检测 Mixed family、size、weight、line height 与 letter spacing。
- 截断、max lines 与 resizing mode 组合有效。
- 检测空白、异常字号和可见溢出。

### 视觉

- before/after preview 存在。
- 像素差异只作为线索，不自动判定设计优劣。
- 重叠检查支持 context allowlist。

## 故障注入

必须覆盖：

- bridge 启动失败。
- plugin 未运行。
- stale manifest。
- poll 中断。
- job 取出后 bridge 重启。
- 脚本在创建一半节点后抛错。
- 用户在 run 中手动修改目标。
- 字体不可用。
- 页面未加载。
- preview 导出失败。
- rollback 后 hash 不一致。
- 用户链接与当前打开文件不匹配。
- Agent 试图在没有 binding 时使用当前打开文件写入。
- high-risk job 缺少确认记录。

## 真实文件测试矩阵

- 简单页面与大型多页文件。
- Text、Frame、Group、Component、Instance、Variable、image fill。
- Auto Layout 固定与 Hug/Fill 组合。
- scroll viewport 与 fixed sibling。
- prototype navigation、overlay、BACK 和 starting point。
- 中英文混排与 Mixed typography。

## MVP 公开门槛

至少使用三个不同的真实 Figma 文件，分别留下完整 run artifacts：

1. **局部文字修改**：验证链接 binding、字体加载、精确节点写入、结构化 result 和文字读回。
2. **复杂布局修改**：验证 Auto Layout、scroll/clip/fixed region、前后 preview、结构 diff 与 validator。
3. **失败恢复**：注入部分失败或断连，证明不会盲目重放，能够 inspect 当前状态，并完成受保护 rollback 或明确进入 `needs-review`。

每个案例至少保存：用户提供链接派生的 binding、任务脚本、job/result、目标校验、before/after 或等价读回证据、validation 与最终状态。

三个文件全部满足后，才能把 MVP 描述为达到公开门槛。

## 报告格式

每次 run 输出：

- observed state。
- attempted work。
- authorized scope。
- local execution proof。
- document readback。
- visual evidence。
- interaction evidence。
- uncertainty 与 remaining checks。

草案见 [schemas/validation.schema.json](../schemas/validation.schema.json)。

MVP 三文件公开门槛草案见 [schemas/mvp-evidence.schema.json](../schemas/mvp-evidence.schema.json)。
