# 可选本地扩展

普通命令始终使用内建执行路径，无需模型 API key。扩展由用户额外提供可信的本地目录，每个项目独立配置，默认禁用。安装与查看清单只读取元数据；运行扩展命令前才加载模块。

```sh
figma-local extension add /absolute/path/to/extension
figma-local extension list
figma-local extension disable example-addon
figma-local extension remove example-addon
```

在已连接的 Figma 插件中打开「设置」，选择扩展，填写 API key，勾选启用并保存。输入框隐藏密钥，响应仅包含配置状态。已有密钥留空保留，清除密钥会同时禁用扩展；重新调用时才向提供方验证密钥。环境变量也可以提供密钥，仍需要显式启用。存在环境变量时，清除已保存密钥后该环境变量仍可用，扩展保持禁用。

`remove` 删除配置和保存的密钥，保留扩展文件。扩展错误或禁用不会替换普通命令；调用方根据结果决定继续普通编辑、补充上下文或核验已提交任务。扩展退出码 `0`、`1`、`2` 分别表示本地命令完成、失败、需要后续处理。

## 目录与接口

目录必须包含 `local-figma-extension.json` 和同目录的 `.mjs` 入口，例如：

```json
{
  "apiVersion": 1,
  "id": "example-addon",
  "name": "示例扩展",
  "entry": "index.mjs",
  "apiKeyEnv": "EXAMPLE_ADDON_API_KEY",
  "disclosure": "当前任务的文字和结构摘要会发送给该扩展的服务提供方。"
}
```

入口导出 `async execute({cwd,args,settings,credentials,runtime})`，返回 `{exitCode,output}`。`args` 是扩展编号后的参数；`settings.allowRemoteContext` 表示用户已启用并允许说明中的处理；`credentials.apiKey` 仅供扩展在进程内使用。`runtime` 提供 `json`、`root`、`save`、`waitForResult`、`textOperation`、`fillOperation`，可继续复用原桥接和证据记录。运行方式为 `figma-local example-addon ...`，扩展不能覆盖内建命令。

`textOperation`/`fillOperation` 接受 `targetId`、`pageId`、`type`，以及可选的 `scopeId`、`bindingNodeId`、`requireSelection`、`protectInstances`、`protectInvisible`，生成受限局部脚本。字体加载之后会再次核验页面、祖先关系和内容；填充读回允许 `1e-6` 的数值误差。扩展自行判断执行结果，提交回执丢失和等待超时必须保留不确定状态，禁止自动重放。

扩展代码拥有本机 Node.js 权限，应来自已审阅的来源。入口路径校验和返回值密钥隐藏只提供防误操作保护。运行时无法约束可信模块自行访问磁盘、联网或输出日志。

配置位于 `.figma-agent/extensions.json`，密钥单独保存在 `.figma-agent/extension-credentials.json`，权限为 `0600`。密钥文件采用本机明文存储，未使用系统钥匙串。扩展目录建议放在 Git 忽略的 `.local-extensions/`，凭证和本地实验代码均不应进入公开安装包。
