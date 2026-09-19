# Inspect 快照覆盖

当前快照用于理解目标、比较局部变化和写入前核对。它保留目标子树中的完整文字与以下可用属性，默认最多 2000 个节点、32 层递归；达到深度上限标记 truncated，超出节点预算则停止。深度预算覆盖网页组件的嵌套包装；截断快照仍禁止写入。

页面级只读 `inspect` 返回页面与顶层节点，存在更深子树时标记 `truncated: true`，用于选取局部目标。该目录不构成完整编辑快照，不能用于完整 diff 或验证通过结论。绑定具体节点后读取其子树；run、preview 和 design-system 保留完整快照预算限制。

| 类别 | 已采集内容 |
| --- | --- |
| 身份与几何 | id/name/type、可见性、锁定、坐标、尺寸、旋转、透明度 |
| Auto Layout | 布局方向、主副轴尺寸模式、Hug/Fill 简写、对齐、grow、positioning、wrap、间距、padding、最小/最大尺寸、constraints |
| 文字 | 完整 characters、字体/字号/行高/字距、文字对齐、段落缩进与间距、缺字提示、textAutoResize、textTruncation、maxLines |
| 滚动与交互 | clipsContent、overflowDirection、numberOfFixedChildren、scrollBehavior、reactions、flowStartingPoints（节点支持时） |
| 外观 | fills/strokes、描边宽度与位置、effects、圆角和 cornerSmoothing |
| 引用 | 文字/填充/描边/效果/网格样式 ID、boundVariables、explicitVariableModes |

复合属性复制为独立 JSON，混合属性保存为 `MIXED`。不存在的属性省略。字段读回异常会使任务失败并保留可获得的证据，避免将遗漏伪装成完整快照。图像填充记录引用和属性，未读取图片二进制。

## 仍需进一步检查

- 富文本的逐段范围与全部样式、组件主定义、实例覆盖和完整变量模式值。
- 网格、矢量路径及其他未列出的节点类型专有字段。
- 原型目的地实际可达性、返回来源、滚动与视觉遮挡。
- 子树之外的变更、并发编辑、完整文档恢复。

写入前比较也使用这些字段，可以发现等待快照期间更多类型的变化；未采集属性和脚本运行中的并发仍不受这项比较保护。扩大字段覆盖会增加结果体积，大型目标请缩小到本次编辑区域。当前 bridge 单次 JSON 请求上限为 16 MiB。

## 截断检查依据

依据 Figma 官方 [textTruncation](https://developers.figma.com/docs/plugins/api/properties/TextNode-texttruncation/) 与 [maxLines](https://developers.figma.com/docs/plugins/api/properties/TextNode-maxlines/) 文档：ENDING 启用截断；自动尺寸文字需要 maxLines 或 maxHeight 限制；maxLines 至少为 1，null 取消行数限制。当前 validate 对可疑组合发出提示，实际可见行数和业务内容完整性需查看截图。

滚动属性含义参见 [overflowDirection](https://developers.figma.com/docs/plugins/api/properties/nodes-overflowdirection/)。顶层 Frame 存在特殊滚动行为，因此工具不把 overflowDirection=NONE 直接认定为不可滚动。
