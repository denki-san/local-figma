// 仅在获准使用的独立测试副本执行。运行前填写从 inspect 得到的真实节点 ID。
const expectedNodeId = 'REPLACE_WITH_AUTHORIZED_TEXT_NODE_ID';
const originalText = '恢复验收：原始文字';
const partialText = '恢复验收：部分写入';
function check() {
  if (target.id !== expectedNodeId || target.type !== 'TEXT' || target.removed) throw Error('测试目标不匹配，未写入');
  if (target.characters !== originalText) throw Error('原始文字不匹配，未写入');
  for (const field of ['fontName', 'fontSize', 'lineHeight', 'letterSpacing', 'textStyleId']) {
    if (target[field] === figma.mixed) throw Error('此合成测试只接受统一文字样式，请使用独立测试节点');
  }
}
check();
await figma.loadFontAsync(target.fontName);
check();
target.characters = partialText;
throw Error('预期的合成故障：文字已部分修改；先 inspect 和查看证据，再决定恢复');
