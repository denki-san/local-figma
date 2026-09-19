# Schema 使用范围

当前 Alpha 的磁盘与 CLI 输出合同：

- `job.schema.json`：`.figma-agent/runs/<id>/job.json`。
- `result.schema.json`：同目录的 `result.json`，以及 job 中的 result 字段。
- `diff.schema.json`：`figma-local diff <id>` 输出。
- `validation.schema.json`：`figma-local validate <id>` 输出。

这些合同通过 Ajv 和贯通测试对照实际输出验证。CLI 运行时尚未用 schema 校验所有 HTTP 输入；JSON Schema 通过也无法证明设计正确。当前版本合同没有统一 schemaVersion，调用方应固定兼容的包版本。

当前 preview 使用无 JSON 参数的 `figma-local preview`；rollback 尚未实现。
