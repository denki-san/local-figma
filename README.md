# local-figma

让 Agent 在本机读取、修改和验证原生 Figma 设计稿。CLI、localhost 桥接和 Figma Development Plugin 协同工作；产物保留可编辑的文字、图层和组件，不需要托管服务。

当前版本为 [v0.1.0-alpha.1](https://github.com/denki-san/local-figma/releases/tag/v0.1.0-alpha.1)，支持 macOS、Node.js 22+ 和 Figma Desktop。首次需在 Figma 中导入并运行开发插件。GitHub Release 提供安装包，尚未发布 npm。

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
- Design to Code / Code to Design：针对给定页面逐页实现、对照与修正；当前没有通用自动双向同步。
- 交互原型：建立简单点击跳转，并在 Figma 中检查实际路径。

`inspect`、`preview`、`run`、`result`、`diff`、`validate`、`history`、`doctor` 等命令用于限定目标、执行及留存证据。完整命令以 `figma-local help` 为准。[五种任务提示](docs/first-task.md)、[输出协议](docs/protocol.md)与[读取覆盖](docs/inspect-coverage.md)供 Agent 和开发者查阅。

## 当前限制

- 首版只验证了 macOS、单文件和单个写入 Agent。首次需要明确的 Figma 链接及手动导入 Development Plugin。
- JavaScript 脚本拥有插件环境允许的能力；只运行可信、已审阅的本地代码。目标检查无法充当恶意脚本沙箱。
- 修改前快照和局部 diff 不能完整恢复文档，也不能证明目标范围外没有变化。超时或断连后先核查原任务和文档，避免重放脚本。
- 五种任务已有范围不同的案例验证，尚不能保证任意输入的视觉还原、长期稳定性或完整交互。详情见[版本说明](docs/releases/v0.1.0-alpha.1.md)。
- 本地 `.figma-agent/` 可能包含设计内容、脚本和截图，默认不进入 Git；分享前请检查并脱敏。

安全边界见 [SECURITY.md](SECURITY.md)。

## 开发

```sh
npm ci
npm run check
npm test
```

测试代码保留在仓库供维护与贡献使用，安装包不包含 `tests/`。自动化测试不能替代真实 Figma 读回、截图检查和用户验收。[贡献指南](CONTRIBUTING.md)说明提交要求。

本项目采用 [Apache-2.0](LICENSE) 许可证。
