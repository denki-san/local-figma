import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

async function script(name) {
  const source = await fs.readFile(new URL(`../examples/recovery/${name}`, import.meta.url), 'utf8');
  return new Function('figma', 'target', 'return (async()=>{' + source.replace('REPLACE_WITH_AUTHORIZED_TEXT_NODE_ID', '1:2') + '\n})()');
}
const fail = await script('test_partial_failure.js');
const restore = await script('test_restore_text.js');
function fixture() {
  const target = { id: '1:2', type: 'TEXT', characters: '恢复验收：原始文字', fontName: { family: 'Example', style: 'Regular' }, fontSize: 16, lineHeight: { unit: 'AUTO' }, letterSpacing: { value: 0, unit: 'PIXELS' }, textStyleId: '' };
  const figma = { mixed: Symbol('mixed'), loadFontAsync: async () => {} };
  return { target, figma };
}
test('合成故障保留部分写入，恢复读回原文，重复恢复拒绝', async () => {
  const { target, figma } = fixture();
  await assert.rejects(fail(figma, target), /预期的合成故障/);
  assert.equal(target.characters, '恢复验收：部分写入');
  const result = await restore(figma, target);
  assert.equal(target.characters, '恢复验收：原始文字');
  assert.deepEqual(result.restoredFields, ['characters']);
  await assert.rejects(restore(figma, target), /当前文字已变化/);
});
test('错误目标、富文本和字体加载期间的用户编辑均保留现场', async () => {
  for (const change of [f => { f.target.id = 'wrong'; }, f => { f.target.fontSize = f.figma.mixed; }]) {
    const f = fixture(); change(f);
    await assert.rejects(fail(f.figma, f.target));
    assert.equal(f.target.characters, '恢复验收：原始文字');
  }
  const f = fixture();
  f.target.characters = '恢复验收：部分写入';
  f.figma.loadFontAsync = async () => { f.target.characters = '用户继续编辑'; };
  await assert.rejects(restore(f.figma, f.target), /当前文字已变化/);
  assert.equal(f.target.characters, '用户继续编辑');
});
