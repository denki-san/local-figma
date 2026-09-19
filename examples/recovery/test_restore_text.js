// 仅恢复下述合成案例的 characters 字段。运行前核对失败任务和最新 inspect。
const expectedNodeId = 'REPLACE_WITH_AUTHORIZED_TEXT_NODE_ID';
const expectedCurrentText = '恢复验收：部分写入';
const originalText = '恢复验收：原始文字';
function check() {
  if (target.id !== expectedNodeId || target.type !== 'TEXT' || target.removed) throw Error('恢复目标不匹配，已停止');
  if (target.characters !== expectedCurrentText) throw Error('当前文字已变化，保留现场，禁止覆盖');
  for (const field of ['fontName', 'fontSize', 'lineHeight', 'letterSpacing', 'textStyleId']) {
    if (target[field] === figma.mixed) throw Error('存在混合样式，此案例不能安全恢复，保留现场');
  }
}
check();
await figma.loadFontAsync(target.fontName);
check();
target.characters = originalText;
if (target.characters !== originalText) throw Error('恢复后的文字读回不一致，请保留现场');
return { changedNodeIds: [target.id], restoredFields: ['characters'], textReadbackMatches: true,
  remainingChecks: ['检查文字样式与布局', '导出 preview 并评审', '检查保护区域与交互'] };
