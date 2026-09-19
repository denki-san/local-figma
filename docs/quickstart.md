# 快速开始

local-figma 让 Agent 在你指定的 Figma 文件中读取、修改和预览原生图层。准备 macOS、Node.js 22+、Figma Desktop，以及目标文件的编辑权限。首次连接需要含 `node-id` 的 Figma 链接；安装包从 [GitHub Release](https://github.com/denki-san/local-figma/releases/tag/v0.1.0-alpha.1) 下载，当前尚未发布 npm。

普通用户可以直接把链接和需求发给 Agent，复制文本见[向 Agent 提任务](first-task.md)。以下命令供 Agent 或自行操作的开发者使用。

## 安装与连接

从 Release 下载 `.tgz` 后安装；在仓库源码目录也可运行 `npm install -g .`。

```sh
npm install -g ./figma-local-runtime-0.1.0-alpha.1.tgz
figma-local help
```

在要保存本地证据的项目目录执行：

```sh
figma-local init 'https://www.figma.com/design/FILE/NAME?node-id=1-2'
figma-local connect
```

把示例链接替换成自己的 Figma 目标链接。终端会给出插件 manifest 路径。在目标文件中选择 Figma Desktop 的 Plugins → Development → Import plugin from manifest，导入并运行插件。保持桥接终端与插件运行；面板可以隐藏，关闭插件会断开连接。

## 确认连接并开始任务

在同一项目目录的新终端执行：

```sh
figma-local doctor
figma-local inspect
figma-local wait TASK_ID --timeout 30
figma-local result TASK_ID
```

把 `TASK_ID` 换成 `inspect` 返回的任务 ID。`doctor` 检查本机连接；`inspect` 读取目标结构；`wait` 等待同一任务完成；`result.ok` 才表示该任务成功。提交返回的 `queued` 只表示已入队。要看图层截图时执行 `figma-local preview`，再对它返回的 ID 使用 `wait` 和 `result`，打开结果中的 PNG。

连接后把具体需求告诉 Agent。已有稿先读结构、资源与截图，再局部修改；从零设计先确定内容、参考和设计方向。[向 Agent 提任务](first-task.md)提供五种任务的写法。绑定整页时，可先用 `inspect` 找到目标节点，再用 `--node NODE_ID` 缩小本次操作范围。

## 常见问题

- 无法连接：检查桥接终端、插件和当前文件；从原型预览返回编辑页，再运行 `figma-local doctor`。不要仅凭心跳暂停就重启或重跑任务。
- 等待超时或执行失败：先查原任务的 `result TASK_ID` 和当前 Figma 文档。已提交任务可能已经修改设计；不要重放脚本。
- 桥接异常退出：确认旧进程已退出、关闭旧插件，再运行 `figma-local recover`；它清理残留会话并保留证据，不恢复设计内容。随后重新连接并读回文档。
- 需要确认高风险修改：插件会显示范围和脚本，由用户本人允许或拒绝。Agent 不代点确认。

工具执行可信的本地 JavaScript，当前没有完整文档回滚。详细输出与退出码见[协议](protocol.md)，读取范围见[快照覆盖](inspect-coverage.md)，权限与数据边界见[安全说明](../SECURITY.md)。本地 `.figma-agent/` 含脚本、文字和截图，默认由 Git 忽略；分享前请检查并脱敏。
