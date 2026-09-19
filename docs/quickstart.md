# 本地 Alpha 安装与运行

## 当前选区的高层精修入口

以下入口由 Agent 执行，用户只需在 Figma 选择目标并描述修改要求。

```sh
figma-local context
figma-local text '替换后的文字'
figma-local layout --width 360 --height 240
figma-local layout --gap 16 --padding 24
```

`text` 要求单个文字选区；`layout` 要求单个独立 Frame，`padding` 同时调整四边。间距仅用于已有水平或垂直 Auto Layout，不自动转换布局模式。锁定区域、组件内部、选区变化和由 Hug/Fill 控制的目标尺寸会被拒绝。结果入队后仍需等待并检查截图；局部数值正确无法证明整体排版正确。布局入口已提供自动与集成测试，真实 Figma 案例仍待验收。

当前代码可本地安装，尚未发布 npm 包。要求 Node.js 22+、Figma Desktop、目标设计文件编辑权限。

首次使用先完成下面的安装连接，再复制 [给 Agent 的任务提示](first-task.md)。本页后续命令供 Agent 和需要手动操作的用户查阅；brief 可由 Agent 根据对话整理。

在仓库目录安装：

```sh
npm install -g .
```

若默认全局安装目录需要管理员权限，可指定自己有写入权限的安装目录：

```sh
npm install -g . --prefix /absolute/path/to/local-tools
/absolute/path/to/local-tools/bin/figma-local help
```

上面的路径为占位值，替换为实际路径；macOS/Linux 可将该目录的 `bin` 加入 PATH。当前自动测试已验证 macOS 上从实际 tarball 安装到独立 prefix 并运行命令，本机 Figma Desktop 导入与执行已验收，其他机器仍需测试。

离线分发可在仓库运行 `npm pack` 生成 tarball，再使用 `npm install -g /absolute/path/to/package.tgz` 安装。发布包尚未上传 npm，当前从源码或本地 tarball 安装。

进入你的项目目录，复制 Figma 中目标画板或页面的链接：

```sh
figma-local init 'https://www.figma.com/design/FILE/NAME?node-id=1-2'
figma-local connect
```

终端返回 manifest 的绝对路径。在 Figma Desktop 选择 Plugins → Development → Import plugin from manifest，导入该文件并运行 Figma Local Runtime。保持终端和插件窗口打开。

新开终端，在同一项目目录运行：

```sh
figma-local status
figma-local doctor
figma-local inspect
figma-local result <返回的任务ID>
figma-local preview
figma-local result <返回的任务ID>
```

每次 inspect、preview、run 返回任务 ID。result 读取本地证据：`result.ok` 表示脚本结果，`recordedState` 表示最后保存的任务状态。`result: null` 表示尚无持久化结果；此时结合 status 和实际文档检查。PNG 位于返回的 evidence 目录。

希望等待该任务完成时，使用：

```sh
figma-local wait <任务ID> --timeout 30
```

默认等待 30 秒，可设置 1–300 秒。wait 只读取本地证据，结果与终态任务日志内容一致后才返回 `waitStatus: completed`；脚本成功退出 0，脚本失败退出 1。超时或存在未完成恢复提示时退出 2，分别返回 timeout 或 needs-review。缺失、损坏的证据仍作为命令错误返回 1。

超时只结束这次等待，任务可能仍在执行。它不会停止插件、重新提交或重放脚本；继续检查 status 与原任务 result。遇到高风险确认需用户在插件中作出决定，等待命令不会代替确认。已完成任务可离线 wait，视觉和交互验收仍需单独完成。

## 从整页进入局部

绑定页面时，`inspect` 返回顶层目录，更深子树标记 `truncated: true`。从目录选择本次已获授权的节点 ID：

```sh
figma-local inspect --node 1:2
figma-local result <任务ID>
figma-local preview --node 1:2
figma-local result <任务ID>
figma-local design-system --node 1:2
figma-local result <任务ID>
figma-local run ./change.js --node 1:2
```

示例 ID 需替换为实际读回的节点。`--node` 也接受 `1-2` 写法，只能选原绑定节点或其后代；每个任务单独保存目标，原项目绑定不变。高风险声明可同时使用。修改前等待快照期间若目标移出绑定区域，脚本停止。

脚本中的 `target`、before/after 和 diff 仅覆盖本次局部节点。可信代码仍能调用完整 figma 对象，因此 --node 是范围核对，不能隔离恶意脚本或证明范围外没有变化。整页目录不适合作为完整 diff 输入。

## 离线证据与结构变化

以下命令在关闭 bridge 后仍可运行：

```sh
figma-local history
figma-local result <任务ID>
figma-local diff <任务ID>
```

history 只展示摘要；result 返回保存的结果、恢复提示和证据路径。失败结果的 result 命令退出码为 1。历史 running 状态无法证明进程仍在执行，缺少结果时先读回文档，避免重复创建。

`journalComplete: false` 且已有 result 时，表示执行结果已保存、任务日志仍未确认完成。保持插件运行以便重试回传，并检查 bridge 终端的磁盘错误。桥接会在两份记录保存完成前继续阻止新任务；脚本保持一次交付。该保护针对本地文件保存时序，断电持久性和跨进程恢复仍需后续验证。

diff 比较同一任务的 before/after，展示新增、移出目标子树、属性变化与父级/顺序变化。隐藏与重命名包含在属性变化中。失败脚本的部分修改也可比较。快照缺失或被截断时拒绝生成 diff。

run 会在执行前拒绝被截断的快照，请用 --node 缩小目标。结果回传超过 16 MiB 时，插件保存省略大字段的失败回执；已执行修改会保留，请先独立 inspect 核验，禁止重跑原脚本。PNG 和过大的前后快照可能被省略，具体语义见 [输出合同](protocol.md)。

diff 仅覆盖快照已记录的属性和目标子树；它无法证明子树外没有变更。`deleted` 表示节点从该子树消失，也可能被移到外部。视觉效果与真实点击仍需单独验证。preview 任务仅保存导出前的结构，需对实际 run 的 ID 使用 diff。

## 连接诊断

connect 遇到端口占用会退出，保留原监听者和已有插件文件；检查占用者后再处理。若生成插件过程中失败，工具停止监听并清理本次触及的凭证。清理成功会释放本次锁，可修复原因后重试；清理失败会保留锁并明确报错，此时先检查文件权限、旧插件和进程状态，再使用恢复流程。

遇到无法运行时执行 `figma-local doctor`。该命令只读检查 Node 版本、绑定、会话格式、锁记录、插件资源、实时桥接认证和插件轮询，并返回逐项处理建议。输出不包含会话令牌，也不会自动删除锁或重启进程。

`ready: true` 表示本地传输检查通过且没有未完成任务。目标文档与编辑权限仍需真实 Figma 探测；先 inspect 再执行局部写入。`ready: false` 时命令退出码为 1。长任务期间缺少新鲜轮询时，应先查看任务结果和 Figma 状态，保留正在运行的插件。

插件执行期间继续发送心跳，`pollAgeMs` 表示最近一次轮询或心跳的间隔。心跳只证明 UI 通道仍响应；脚本执行进度与结果另行判断。结果回传超时会重试保存同一结果，任务脚本保持一次交付。CLI 出现 active 任务时先读 result，避免重复提交。

真实桌面验收发现：切到原型预览标签页后，后台编辑页可能暂停插件轮询，即使插件窗口没有关闭。继续提交前先返回编辑标签页，再查看 status 是否恢复新鲜心跳；不要仅凭心跳超时重启桥接或重放脚本。明确被拒绝入队的请求可在连接恢复后重新提交；已有任务 ID 的请求必须先查原任务结果。

任务领取前先保存 running 日志，保存失败会保持 queued 且不交付脚本；修复磁盘问题后可继续领取原任务。日志已保存但交付响应丢失时保留 running，需核查文档与插件，工具不会自动再次交付。

## 桥接异常退出后的恢复

确认旧桥接已经退出，并在 Figma 检查、关闭旧插件后运行 `figma-local recover`。它会检查残留锁记录的 PID；进程仍存在、状态不可确认或证据损坏时拒绝清理。工具不会终止任何进程。

恢复操作保留脚本、快照、结果与原任务日志，为未完成任务补充 `needs-document-review` 提示，将旧锁归档到 `.figma-agent/recoveries/`，清除旧 session 与 UI 凭证。随后重新 connect、运行新插件，先 inspect 核对文档，再决定如何补做。旧脚本不会重放，设计内容不会自动撤销。

PID 复用可能导致保守拒绝，此时人工检查进程身份。若恢复本身被中断并留下 recovery.lock，也需先人工确认恢复进程退出；不要在运行中移走锁。旧进程退出只能证明桥接已停止，Figma 插件与文档状态仍需单独检查。

## 结构质量检查

运行 `figma-local validate <任务ID>` 离线检查已保存结构。当前规则提示混合字体属性、空文字、默认命名、无效尺寸、固定尺寸文字与裁切越界风险。富文本与滚动内容可能有意触发提示，需要结合设计意图判断。

报告采用 `schemas/validation.schema.json` 中的字段结构。退出码 1 表示执行失败、结构问题或证据缺失；2 表示结构已检查、仍需评审。当前检查器始终保留视觉、真实交互与用户验收为 `not-run`，不会自动给出整体通过结论。旋转节点、缺失属性或截断子树会提示检查覆盖缺口；隐藏子树跳过视觉类规则。

规则读取 run/inspect 的 after；preview 使用导出前结构。旧插件生成的快照可能缺少新采集字段，更新后重新 connect 并运行插件、inspect。真实文字溢出、视觉重叠、组件绑定和业务正确性仍需另行检查。

inspect 现已保存更多布局、外观、截断、样式与变量引用及原型属性，详见 [快照覆盖范围](inspect-coverage.md)。validate 也会提示缺失字体和可疑截断组合。结构快照仍无法完整重建文档或替代视觉与交互验收。

## 修改现有稿

先运行 `figma-local design-system`，再用 `figma-local result <任务ID>` 获取目标区域已经引用的样式、变量和组件。结果位于 `result.output`，每条资源包含身份、解析状态和 `usedBy` 使用位置，按使用次数排序。

此命令只读取绑定子树并解析其直接引用，保留无法解析的引用和警告。它不会导入团队库、修改共享定义或自动替换组件。混合文字样式可能需要进一步按文本范围检查；相邻页面、未使用的资源及变量模式值不在当前扫描范围内。空白画板可能返回空列表，此时先在 brief 中补充设计基础或明确参考位置。

```sh
figma-local guide refine
```

填写 brief 后运行 `figma-local guide-check refine`，按字段提示补齐修改范围、保留要求与现有样式来源。

把生成的 `.figma-agent/brief-refine.json`、inspect 结果和 preview 交给 Agent。填写目标与保护区域，让 Agent 先解释将修改的节点，再生成可信 JavaScript 函数体。脚本可访问 `figma` 和已绑定的 `target`，用 `return` 返回结果。

返回值应使用 JSON 可序列化的数据，例如节点 ID、布尔值、数值与普通对象。避免返回完整 Figma 节点、BigInt 或循环引用；返回值转换失败时任务报告失败并保留读回，已有修改仍需检查。未返回值时 output 为 null。

```sh
figma-local run ./change.js
figma-local result <任务ID>
```

运行后再导出 preview，并检查文字、布局与点击。详见 [两条场景工作流](workflows.md)。

run 在执行脚本前先保存目标结构到该任务证据目录的 `before.json`，收到 bridge 确认后才开始执行。保存失败或确认超时会阻止脚本；等待期间目标所在页面或已采集属性发生变化时也会停止。result 的 `checkpointFile` 指向已保存快照，即使最终结果尚未回传也可查看。

当前快照包含有限的结构属性，供核对修改前状态使用。截图请先独立 preview；快照尚不支持完整设计重建或自动回滚。该检查也无法阻止脚本执行期间的其他人工编辑，运行时请避免同时修改同一区域。

每次 run 在脚本前后调用 commitUndo 划分历史边界，部分失败也尝试记录结束边界；result.undoBoundaries 展示 before/after 的 committed、failed 或 not-run 状态。开始边界失败会阻止写入。工具保持当前文档供核对，不自动触发 Undo；边界记录无法证明历史栈顶的归属或恢复结果。可信脚本自行调用 Undo、延迟写入、其他插件和人工并发编辑均需要额外审阅。

## 声明高风险与确认

需要额外审阅的脚本可以显式标记：

```sh
figma-local run ./change.js --high-risk '说明影响范围、风险及恢复准备'
```

插件窗口显示目标、风险说明、脚本 hash 和脚本内容，等待点击允许或拒绝。允许记录保存后才进入写入前快照；拒绝或五分钟超时会阻止脚本执行。决定记录在任务目录的 approval.json，绑定此次脚本 hash 和 binding ID。普通任务维持原有流程。

这是声明式门禁：工具未自动分析 JavaScript 的实际风险，标记 normal 的脚本仍拥有插件允许的能力。拥有本地插件凭证的进程也能调用确认接口，因此该记录用于审计与防误操作，无法独立证明操作者身份。Agent 不应代替用户点击允许或伪造确认请求。删除、共享定义修改、跨页批量变更和 Undo 应在用户审阅、备份与恢复方案明确后再考虑；Alpha 尚无完整文档回滚保障。

## 从零设计

在目标 Figma 文件中准备空白 Frame，复制它的链接作为绑定目标，然后运行：

```sh
figma-local guide design
```

填写后运行 `figma-local guide-check design`。退出码 2 表示仍有资料或方向确认待补充，0 表示字段齐全，1 表示读取或格式错误。该检查提供准备度提示，实际设计质量需要后续验证。

填写生成的 brief，提供参考图路径、真实内容和主要用户任务。先让 Agent 出结构方案，选定方向后再分区域构建原生图层。

首次填写可参考 [合成案例及 Agent 提示](../examples/briefs/README.md)。没有参考图时提供文字视觉方向，进入两种结构草图的比较；有参考图时说明借鉴点和使用权限。执行后按 [设计评审清单](design-review.md) 检查，保留待验证项。

## 当前 Alpha 边界

准备真实故障验收时可按 [文字部分写入与恢复案例](../examples/recovery/README.md) 操作。它只用于授权测试副本，需用户确认风险；恢复脚本核对当前内容，存在后续修改时停止。

- 当前真实验收来自一个授权文件；多文件兼容性仍需后续验证。
- 当前支持 JavaScript 函数体脚本。`examples/partial-edit/update-text.js` 与 `examples/inspect/inspect-target.js` 可作为起点；运行前检查目标并填写文案。JSON 协议示例仍属于规划草案。
- 自动风险分类与文档恢复尚待实现；显式高风险脚本有插件确认步骤。当前仍应避免删除、共享变量修改、跨页批量写入或自动 Undo。validate 仅提供有限结构规则与人工检查清单。
- 脚本失败保留 before/after 与错误；先检查当前文档，禁止直接重放。
- 重启 bridge 会轮换令牌，随后需要重启插件。
- 异常终止可能留下 bridge.lock；先检查进程和旧插件，再运行 recover 保留证据并清理旧凭证。
- Figma 插件需读取 file key；已启用开发插件 private API，读取不可用时会拒绝执行。
- 默认开发 manifest 没有 Figma 分配的插件 ID；`setPluginData` 等私有元数据操作不可用，doctor 会提示。当前节点映射与上下文应保存于本地证据，脚本需在任何写入前核实所需能力。参见 [Figma manifest](https://developers.figma.com/docs/plugins/manifest/) 与 [setPluginData](https://developers.figma.com/docs/plugins/api/properties/nodes-setplugindata/)。

`.figma-agent/` 默认 Git 忽略，包含本地脚本与设计内容。需要分享时先人工脱敏。
