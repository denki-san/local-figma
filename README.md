# local-figma

让 Agent 在本机读取、修改和验证原生 Figma 设计稿。CLI、localhost 桥接和 Figma Development Plugin 协同工作；产物保留可编辑的文字、图层和组件。

当前版本为 [v0.1.0-alpha.1](https://github.com/denki-san/local-figma/releases/tag/v0.1.0-alpha.1)，支持 macOS、Node.js 22+ 和 Figma Desktop。安装包在 GitHub Release 下载；首次按提示在 Figma 中导入并运行开发插件。

![本地工具生成的原生 Figma 页面，使用合成演示数据](assets/preview.png)

上图为真实 Figma 导出的 1440×1024 演示页面；文字、指标组件与原型连接保持原生可编辑，数据均为合成内容。

## 开始使用

把 Figma 目标链接与需求发给能执行本地命令的 Agent：

> 帮我安装并连接 local-figma。目标是【Figma 链接】，我想【修改需求】。请处理依赖和本机连接，只在需要我操作 Figma 时告诉我。

Agent 会安装 Release 包、绑定目标并指导首次插件导入。连接后，在绑定范围内选中内容，直接继续描述需求；换文件或超出范围时再提供新链接。[快速开始](docs/quickstart.md)提供安装、连接和故障处理命令，[首次任务提示](docs/first-task.md)可直接复制。

需要手动安装时，从 Release 下载 `.tgz`，运行：

```sh
npm install -g ./figma-local-runtime-0.1.0-alpha.1.tgz
figma-local help
```

从源码安装可运行 `npm install -g .`。命令需在你选择的项目目录执行，`figma-local init '<含 node-id 的 Figma 链接>'` 建立绑定，`figma-local connect` 启动本机桥接。终端会给出开发插件 manifest 路径。

## 能做什么

- 已有稿精修：读取选区、当前样式和组件，修改文字、字体、填充、布局、对齐与实例属性，再读回并预览。
- 从零设计：按需求、参考和已有设计语言生成原生图层；Agent 负责整理任务资料，用户确认设计方向与成果。
- Design to Code / Code to Design：Agent 针对给定页面逐页制作、对照并调整 Figma 稿与可运行页面。
- 交互原型：建立简单点击跳转，并在 Figma 中检查实际路径。

`inspect`、`preview`、`run`、`result`、`diff`、`validate`、`history`、`doctor` 等命令用于限定目标、执行及留存证据。完整命令以 `figma-local help` 为准。[五种任务提示](docs/first-task.md)、[输出协议](docs/protocol.md)与[读取覆盖](docs/inspect-coverage.md)供 Agent 和开发者查阅。

## 使用提示

首次提供含 `node-id` 的 Figma 链接，并在目标文件运行开发插件。Agent 会按任务读取设计、局部修改、查看结果与截图；你负责确认最终效果。连接中断时，先让 Agent 核对原任务结果和画布状态，再继续操作。

本地证据保存在 `.figma-agent/`，分享前请检查其中的脚本、文字和截图。更多信息见[版本说明](docs/releases/v0.1.0-alpha.1.md)、[安全说明](SECURITY.md)与[贡献指南](CONTRIBUTING.md)。

本项目采用 [Apache-2.0](LICENSE) 许可证。
