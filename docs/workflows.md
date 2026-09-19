# 两条顶层使用路径

第一次使用可参考 [两份合成 brief](../examples/briefs/README.md)，每批修改按 [设计评审清单](design-review.md) 检查。

## 现有稿精修

先运行 `figma-local guide refine`，填写生成的 brief，再运行 `figma-local guide-check refine`。检查器关注目标、内容来源、修改范围、保留要求、现有风格来源及确认后的局部方案。历史 brief 可以手动补字段，重新生成会拒绝覆盖原文件。

适用任务：已有设计系统和页面，调整文字层级、间距、局部组件、滚动区域或视觉一致性。

给 Agent 的输入：目标链接、具体问题、允许修改范围、必须保留的内容，以及现有组件和样式的参考位置。

先使用 `design-system` 获取目标区域已使用资源的身份和使用位置，再结合 inspect 与 preview 判断可复用项。不可解析引用会保留并提示；缺少资源时再向用户确认参考范围。

建议直接复制给任意 CLI Agent：

> 读取 brief-refine.json。先用 figma-local inspect 与 preview 理解绑定区域和现有风格；读取任务 result。列出一个区域内的修改方案，复用现有组件、字体和变量。生成可信本地 JavaScript 函数体，通过 figma-local run 执行。保持旧内容可恢复。读取结果并重新 preview，检查文字溢出、Mixed 字体、间距、遮挡和主要交互。出现失败先读回文档，不重放创建脚本。

完成标准：目标问题得到解决；其余受保护内容保留；有前后证据；视觉检查与真实点击分别记录。

## 从零设计高质量 UI

先运行 `figma-local guide design`。填写后运行 `figma-local guide-check design`，按 gaps 中的字段提示补齐。`readyForPlanning` 表示可进入方案讨论，`readyForExecution` 表示所需字段已填齐；设计判断、用户选择与实际权限仍需由使用者确认。

参考图建议提供 2–3 张，每张说明想借鉴什么：信息结构、排版密度、颜色、组件或留白。参考图作为视觉指导，最终产物保持原生可编辑图层。没有参考图时先描述视觉方向，并让 Agent 提供两个结构草图供选择。

开始前准备：

1. 使用者是谁，打开页面最想完成什么。
2. 真实标题、正文、图片和数据；同时提供长内容、空状态、错误状态。
3. 目标设备、页面尺寸、导航与操作约束。
4. 已有品牌资产、设计系统组件和字体；缺少时先确定颜色、排版和间距基础。
5. 参考图路径和每张图的借鉴点。

参考图先保存在本地，references 按下面的结构填写。相对路径以运行 CLI 的项目目录为起点。CLI 仅检查文件存在且非空，图片内容由你选择的 Agent 查看；将图片交给外部模型时，请自行确认其数据处理政策。

```json
{
  "references": [
    {
      "path": "references/layout.png",
      "borrow": "标题层级、卡片密度与留白",
      "avoid": "不复用品牌字标和具体业务文案",
      "permission": "已获授权，仅用作视觉参考"
    }
  ]
}
```

没有参考图时填写 `visualDirection`，仍可进入结构草图阶段。已有设计系统填入 `designSystem`；暂无设计系统时，在方向选定后将字体、颜色、间距与组件规则写入 `designFoundations`。用户选定方向后填写 `acceptedDirection`。`stateCoverage` 记录长内容、空状态、错误状态与主要交互的覆盖要求。

两个场景都需填写 `editScope` 和 `preservationNotes`。`designSystem` 与 `protectedRegions` 为非空字符串组成的数组，每项说明资源或区域的位置、用途与约束；暂无内容填 `[]`。检查器只提供缺口提示，不自动推断授权、不读取内容真源，也不自动验证素材版权。字段齐全依然需要小区域试做、截图检查与用户评审。

给 Agent 的提示：

> 读取 brief-design.json 与参考图。先总结用户任务和信息优先级，提出两个有明确差异的结构方向。方向确定后，先构建一个关键区域验证字体、颜色、间距和组件语言，再扩展页面。通过 figma-local inspect/run/result/preview 小步构建原生图层。每批检查截图，完成后检查长文、空状态、错误状态与主要点击路径。把未验证项目留在 review 字段中。

高质量依赖真实内容、清晰层级、组件一致性和视觉迭代。完整 Plugin API 是执行能力；截图、结构读回和人工评审共同决定设计是否达标。

## 开源差异化方向

本项目集中于两种场景共用的可追踪编辑循环：链接明确绑定、脚本留存、任务一次交付、结构读回、局部截图和场景 brief。Agent 可以使用公开 CLI 和 JSON 接入。

当前 Alpha 已实现绑定、任务与结果留存、inspect、preview、目标子树 diff、离线 history、有限结构 validate、目标区域 design-system 发现、场景 brief 与 guide-check 缺口引导。跨页设计系统检索、视觉回归和受保护恢复属于接下来的实现目标。第三方工具的能力对比见 [研究矩阵](research/landscape-matrix.md)，公开竞争声明需随版本重新核实。

设计系统读取使用官方异步 API：[样式查询](https://developers.figma.com/docs/plugins/api/figma/)、[变量查询](https://developers.figma.com/docs/plugins/api/figma-variables/)、[实例主组件查询](https://developers.figma.com/docs/plugins/api/InstanceNode/)。真实文档与库访问结果仍需在用户环境验证。
