# 安全策略

## 当前状态

项目已通过 GitHub Release 提供试用 Alpha。以下描述当前实现。

## 核心边界

- bridge 仅监听 `127.0.0.1`。
- 每次会话使用临时高熵 token。
- token、session 文件和带 token 的生成 UI 不进入仓库或 run artifacts。
- 项目绑定用户链接；每个任务核验文件身份和目标祖先关系。--node 只允许选择绑定节点或其后代。
- 用户必须已经拥有当前 Figma 文件的足够编辑权限；运行时不会提升权限。
- trusted local JavaScript 拥有当前插件环境允许的完整 Figma Plugin API。
- target lock 和能力声明是防误操作与审计门禁，不是安全沙箱。
- Figma 文本、评论、网页内容和第三方文件都视为不可信数据。
- CLI 从本地路径读取 JavaScript，但尚未实施目录白名单或签名校验。调用方必须审阅脚本来源和内容。
- 用户显式启动 Development Plugin 并保持窗口打开。后台编辑页可能暂停心跳；关闭或暂停不会停止本地 bridge，已有任务状态仍需核查。
- 首次 binding 必须从用户提供的 Figma URL 建立；当前打开文件不能自动成为写入目标。
- 每次执行默认把脚本、结构化结果与 evidence 写入 Git 忽略的 `.figma-agent/`。
- 常规操作不逐次确认；显式 --high-risk 任务需保存允许记录后才能执行。风险分类由调用方声明，normal 脚本仍能调用删除等强能力。

## 已知限制

- 未实现自动风险识别、操作级 capability 限制、目录白名单或默认禁止删除。
- 快照仅覆盖已采集属性与本次目标子树，不能证明范围外未被修改，也无法完整重建文档。
- 文档 rollback 和原子 transaction 尚未实现。记录 Undo 边界不代表拥有全局撤销栈；工具不会自动触发 Undo。
- 证据包含脚本、完整目标文字、结构和可选 PNG，默认 Git 忽略并限制文件权限；尚未自动脱敏、加密或定期清理。
- 插件与 CLI 临时令牌分开。本机能读取凭证的进程仍可冒充对应角色；确认记录无法独立证明操作者身份。
- 默认开发 manifest 无正式插件 ID，私有 pluginData API 不可用。执行前应核实脚本依赖能力，避免部分写入后失败。

## 漏洞报告

安全问题请先联系维护者协商私密提交方式；不要在公开 issue 中提交 token、用户文件内容或可复现的敏感设计数据。

## 高优先级问题

- bridge 可被非预期本机进程调用。
- token 泄漏或 session 复用。
- job 绕过 target lock 修改其他页面或文件。
- 断连重试造成重复创建或删除。
- rollback 撤销用户或其他 Agent 的并发修改。
- run artifact 泄漏文本、图片、pluginData 或文件标识。
- 远程脚本、prompt injection 或依赖供应链导致任意代码执行。
