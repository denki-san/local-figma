# 部分写入后的受检查恢复案例

这是一组自制合成故障脚本，服务真实 Figma 验收。适用对象是独立测试副本内、统一样式的单个 Text 节点。脚本只演示指定文字字段的检查与恢复，完整文档恢复仍待实现。

## 准备

1. 用户提供可编辑的独立测试文件链接，允许注入故障和恢复。保留正式稿。
2. 在副本准备统一样式的 Text，内容为 `恢复验收：原始文字`。复制该 Text 链接，init 并启动插件。
3. inspect、preview，并读取结果。记录字体、字号、行高、尺寸、原始文字和截图。
4. 将两个脚本复制到本地项目；用 inspect 得到的节点 ID 替换 `REPLACE_WITH_AUTHORIZED_TEXT_NODE_ID`。保留 `test_` 文件名前缀。检查代码后再执行。

## 故障与恢复

```sh
figma-local run ./test_partial_failure.js --high-risk '授权测试副本内注入一次文字部分写入失败'
figma-local result <故障任务ID>
figma-local diff <故障任务ID>
figma-local inspect
figma-local result <检查任务ID>
```

用户在插件中确认后，故障任务预期为 ok=false、executionStarted=true，after.characters 为部分写入文字。result 的退出码为 1 属于该案例预期。先保存这些证据，保持失败状态供检查。

核对当前文字、目标及保护范围；允许恢复后执行：

```sh
figma-local run ./test_restore_text.js --high-risk '核对故障证据后恢复合成 Text 的原始文字'
figma-local result <恢复任务ID>
figma-local diff <恢复任务ID>
figma-local validate <恢复任务ID>
figma-local preview
figma-local result <截图任务ID>
```

分别记录文字读回、样式/布局截图与用户评审。成功结果只确认 characters 读回，组件、变量、交互和整页状态需另行检查。

## 并发修改保护验收

在另一份测试节点上重复故障步骤，然后手动把当前文字改为其他内容，再尝试恢复。预期恢复脚本拒绝写入，用户新文字保持原样。字体加载期间的变化也会再次检查；仍需避免脚本与人工同时编辑。

## 边界

- 两个脚本均带目标和文字前置条件，重复执行时会拒绝已变化内容。
- 完整 before/after 快照和 Undo 边界由运行时保存，脚本不触发全局撤销。
- 富文本、已删除节点、组件结构、变量、图片与原型恢复不在本案例覆盖范围。
- 正式失败任务应先制定与实际变更相符的恢复方案；这些合成字符串不能直接用于真实稿件恢复。
- 真实文件验收尚未执行，模拟测试仅证明分支和调用顺序。
