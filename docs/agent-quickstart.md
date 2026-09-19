# Agent 操作指南

本指南面向能执行用户本机命令、读取图片的 Agent，适用于 local-figma v0.1.0-alpha.1。用户提供 Figma 选区链接、需求和目标文件的编辑权限；Agent 负责安装、连接、局部执行与结果核验。用户在首次连接时运行开发插件，并确认设计效果。

## 1. 准备目标与连接

确认运行环境为 macOS、Node.js 22+ 和 Figma Desktop。要求用户提供包含 `node-id` 的目标 Frame 链接；只用该链接建立写入目标。先确定保存本地证据的项目目录，后续命令都在同一目录执行。

从 [v0.1.0-alpha.1 Release](https://github.com/denki-san/local-figma/releases/tag/v0.1.0-alpha.1) 下载 `figma-local-runtime-0.1.0-alpha.1.tgz` 后安装：

```sh
npm install -g ./figma-local-runtime-0.1.0-alpha.1.tgz
figma-local help
figma-local init '<用户提供的含 node-id 的 Figma 链接>'
figma-local connect
```

`connect` 会持续运行并输出插件 `manifest` 路径。把路径和步骤告诉用户：在目标文件的 Figma Desktop 中打开 Plugins → Development → Import plugin from manifest，导入并运行插件。保持桥接终端和插件运行；在同一目录另开终端执行后续命令。若目录已有绑定，先运行 `figma-local doctor` 查看现状；处理其他文件时使用新的项目目录。

## 2. 读取目标，确认方案

```sh
figma-local doctor
figma-local inspect
figma-local wait TASK_ID --timeout 30
figma-local result TASK_ID
figma-local preview
```

先把 `TASK_ID` 替换成 `inspect` 输出的 `id`。`doctor` 的 `ready` 只表明本机连接可用；还需检查 `inspect` 返回的文件与目标节点，并对 `preview` 返回的任务 ID 分别执行 `wait`、`result`，打开 PNG 查看画板。提交命令返回 `queued` 只表示任务已入队，实际结果以对应的 `result` 为准。

向用户给出简短修改方案与范围，确认需要保留的文字、组件或风格。已有稿优先局部修改；从零设计先确认页面目标、真实内容、尺寸和设计方向。只在用户提供的绑定范围内操作；涉及共享组件、全局变量或大范围改动时，先说明范围并取得确认。

## 3. 修改与交付

根据任务选择 `figma-local help` 中的高层命令，或执行已经审阅的本地 JavaScript 脚本。每个写入任务都保存其任务 ID，随后对同一 ID 执行 `wait`、`result`；需要核对变化时执行 `diff` 和 `validate`，再运行 `preview` 并检查新截图。脚本可访问 Figma Plugin API，执行前要审阅其作用范围。声明高风险的 `run` 任务由用户在插件中确认。

交付时给用户：修改摘要、结果截图、Figma 中需要人工检查的地方。涉及交互原型时，还需在 Figma 中实际点击主要路径。设计质量与最终效果由用户确认。

## 连接中断或任务超时

先运行 `figma-local result <原任务 ID>`，结合 `figma-local status` 和当前 Figma 画布核对任务是否已经生效。保留已有证据；确认原任务状态后再决定是否继续。`wait` 超时不会取消或重新提交任务。若桥接异常退出，按[手动快速开始](quickstart.md)中的恢复步骤处理。

命令输出、退出码和证据含义见[输出协议](protocol.md)；权限与脚本边界见[安全说明](../SECURITY.md)。本地 `.figma-agent/` 可能包含设计文字、脚本和截图，分享前提醒用户检查。
