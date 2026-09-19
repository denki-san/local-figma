# 原生任务概览：公开复现示例

此示例由 Agent 通过本机 CLI 在 Figma 创建原生可编辑页面。视觉层级参考 [shadcn/ui 官方 Dashboard](https://ui.shadcn.com/examples/dashboard)，使用独立实现、合成中文内容和原生图形。没有私有文件 ID、节点 ID、访问令牌或用户原稿素材。

![真实Figma导出的七天任务概览，内容为合成数据](preview.png)

上图为此目录创建脚本的真实导出结果，1440×1024。截图展示已测默认状态；交互请按下方清单在原型中核验。

## 创建内容

- 1440×1024 的7天、30天概览各一张，含指标卡、柱图和最近运行表格。
- 一个指标卡本地主组件，两张概览各复用4个实例。
- 一个模拟运行详情弹层。
- 点击7/30天切换视图，点击第一条记录打开详情，再关闭回到原视图。

图表总数分别为1248、5360；所有数据均为演示。侧栏其它入口和其它表格行不包含交互，示例不连接业务服务。

## 运行

先按[快速开始](../../docs/quickstart.md)连接有编辑权限的 Figma 文件。请在同页准备一个独立空白 Frame 作为已授权锚点；Agent 读取其真实 ID，替换下面的 `1:2`。整个文件或页面为绑定范围时，锚点应位于该范围内。

```sh
figma-local run examples/dashboard/test_create_dashboard.js --node 1:2
figma-local wait <返回的任务ID>
```

从源码根目录执行时可将 `figma-local` 替换为 `node bin/figma-local.mjs`。全局安装后，脚本位于安装包的 `examples/dashboard/` 下，由 Agent 传入它的绝对路径。

脚本在当前页面右侧新增独立测试区，保留锚点原样。新增顶层画板超出锚点子树，局部 diff 无法证明全部新增内容；必须根据返回的 root、month、modal、main 节点 ID 分别读取并截图。需要用户已授权在本页新建验收区。

使用 macOS 的 PingFang SC Regular、Medium、Semibold，字体加载失败时不会创建画板。执行后若失败或超时，先读回已存在的 `test_dashboard_public｜` 节点；同名重复运行会拒绝，禁止靠重跑制造多份页面。

## 验证清单

### 完整交互流程示例

`test_create_flow.js` 在同页新建独立的公开合成流程：任务首页、可滚动说明、滚动区外的底部操作区、双状态确认组件、弹层、结果页与返回。使用与概览一致的PingFang SC字体和蓝色操作按钮，不含私有节点或业务数据。

```sh
figma-local run examples/dashboard/test_create_flow.js --node <同页独立Frame的ID>
```

脚本已在真实Figma创建，首次设置起点遇到自动起点重复，已局部修复并更新创建脚本的去重逻辑；没有重新创建画板。选择 `test_公开流程｜阅读与确认` 预览。2026-09-19真实实点通过：首页→说明、正文滚动到底部且操作区保持可见、打开弹层、未确认按钮无跳转、双向确认切换、取消重开复位、提交→结果→返回说明（保持滚动位置）→首页。结果页直接返回首页按钮未单独复点；弹层缺少背景遮罩，视觉层次仍可改善。

### Design to Code：固定桌面HTML

创建概览后，用只读脚本导出三个合成视图，再由Node.js生成无外部依赖的HTML：

```sh
figma-local run examples/dashboard/test_export_html_source.js --node <root>
figma-local wait <导出任务ID>
node examples/dashboard/test_render_html.mjs .figma-agent/runs/<导出任务ID>/result.json <新的HTML输出目录>
node examples/dashboard/test_serve_html.mjs <HTML输出目录>
```

打开服务器返回的回环地址。输出目录必须尚不存在，避免覆盖已有文件。安装包用户由Agent定位脚本绝对路径；本地结果位于当前项目的`.figma-agent/runs/`。该导出只接受本例单层纯色原生结构，使用逻辑节点标识，不携带真实文件或节点ID；不支持的类型会拒绝。

2026-09-19已从真实Figma只读导出248个节点，原画板前后快照一致。生成页面在1440×1024浏览器视口与同尺寸Figma导出图进行目视对照，结构位置一致、未见裁切。7天→30天（5360）→详情→关闭→7天（1248）实点通过；Enter打开、Escape关闭及焦点返回已验证。

这是固定桌面案例，保留DOM文字及原生按钮/对话框；无响应式、真实业务与通用转换承诺。字体需要本机PingFang SC，字体抗锯齿与渲染存在差异，尚无逐像素误差证明。HTML覆盖的主路径与原型对应，边界状态仍需扩展。

### Code to Design：网页指标行复用

在上一步运行的HTML中选择7天视图，让Agent使用浏览器只读求值执行 `test_capture_metric_row.js` 的函数，保存返回JSON。此目录的 `metric-row.json` 是2026-09-19从实际浏览器计算样式整理的合成样本，也可用于复现。

```sh
node examples/dashboard/test_build_metric_row.mjs examples/dashboard/metric-row.json <新的test_脚本.js>
figma-local run <新的test_脚本.js> --node <同页独立Frame的ID>
figma-local wait <返回的任务ID>
```

脚本匹配已存在的公开指标主组件，先核对尺寸、颜色、内描边、字体、文字位置和行高，再加载字体并复核。捕获与生成均限定本例默认视觉属性：不透明、无变换或额外效果、文字左对齐且零字距；不支持的样式会拒绝，避免静默丢失。全部前置检查通过后，在同页新增独立横向Auto Layout容器，复用四个实例并填入网页文案；不改主组件。已有同名案例会拒绝重复创建。目标Frame作为锚点保持不变，新增区域超出锚点子树，须根据返回board单独inspect和preview。

已在真实Figma复现1160×142指标行：四个原生实例、12段文字、16px间距；独立读回与浏览器记录一致，同尺寸截图无裁切，主组件与此前保存快照相同。此例验证网页计算布局→已有本地组件复用，不证明任意网页全自动组件化，也不替代复杂原稿的完整Code to Design验收。

### 精修实例文案

完成创建用例后，可在同页授权新增独立对比区，运行：

```sh
figma-local run examples/dashboard/test_refine_metric.js --node <root>
figma-local wait <返回的任务ID>
```

脚本复制「完成任务」实例作为修改前/后对比，仅在候选副本中将标题改为「已完成任务」、说明改为「对比上期，增长 12.5%」，保留主组件关联。返回值检查原实例和主组件文字，完整保护还需要独立inspect及截图。遇到已存在用例会拒绝重复创建。

2026-09-19已原样在Figma Desktop执行，来源画板完整前后快照相等；对照图已查看，两处文案无裁切，数值保持1,248；独立读回确认两个实例及文字内容。此公开用例演示实例文字覆盖，不替代复杂已有稿的排版、滚动或长文本验收。

另行执行只读检查器，将上一步返回的`board`作为目标：

```sh
figma-local run examples/dashboard/test_verify_refinement.js --node <board>
figma-local wait <返回的任务ID>
```

检查器验证三个实例仍关联同一主组件、文案精确匹配、所列尺寸/样式/布局属性一致及卡片文字边界。它比较当前状态；主组件历史上未被修改仍需独立前后快照证明，视觉质量继续通过截图确认。

### 原生概览结构与交互

将创建结果中的 `root` 作为目标，运行随包提供的只读结构检查：

```sh
figma-local run examples/dashboard/test_verify_dashboard.js --node <root>
figma-local wait <返回的任务ID>
```

检查器要求两张画板各1440×1024、70个文字、4个仍关联主组件的实例、7根柱图，数据总和正确，并检查缺失字体、文字越界及图片替代。它返回的 `structurePassed` 只代表这些结构断言通过。

1. 读取返回的两张概览，确认每张70个 Text、4个 Instance，主组件关系保留。
2. 导出同尺寸 PNG，查看文字、间距、图表刻度、表格及底部是否被裁切。
3. 在 Figma 预览选择 `test_公开示例｜任务运行概览`，实点7天→30天→详情→关闭→7天。
4. 确认30天总数为5360，关闭详情保持30天选择；返回7天恢复1248。

另有独立只读原型检查器，验证五条点击连线、可见性及公开起点：

```sh
figma-local run examples/dashboard/test_verify_prototype.js --node <root>
figma-local wait <返回的任务ID>
```

它拒绝错误目的地、将弹层误设为页面跳转、额外动作及隐藏节点。`realClicksRequired: true` 表示仍需完成上方真实点击步骤；此概览用例未覆盖复杂原型的滚动和组件状态。

2026-09-19 本地复现：此目录的创建脚本原样在 Figma Desktop 执行成功；只读结构检查通过；截图已查看，7天→30天→详情→关闭→7天主路径已实点验证。真实 tarball 离线安装测试通过，包含两个脚本及本文档。节点及原始执行记录留在本地，不进入公开包。

设计质量按具体案例评审。此示例不证明任意设计能自动达到8分，也不提供空态、错误态、响应式或真实数据加载。自动测试只能检查脚本打包、语法及静态安全边界；桌面执行与视觉验收需单独记录。
