import { test } from 'node:test';
import assert from 'node:assert/strict';
import { selectedTextEdit } from '../src/operations.mjs';
const state = { connected: true, stale: false, context: { pageId: '1:1', selection: [{ id: '1:2', type: 'TEXT' }] } };
function fixture(onLoad = () => {}) {
  const target = { id: '1:2', type: 'TEXT', characters: '原文', fontName: { family: '测试字体', style: 'Regular' }, parent: { type: 'FRAME', parent: { type: 'PAGE' } } };
  const figma = { currentPage: { id: '1:1', selection: [target] }, loadFontAsync: async () => onLoad(target, figma) };
  const invoke = text => new Function('figma', 'target', 'return (async()=>{' + selectedTextEdit(state, text).code + '})()')(figma, target);
  return { target, figma, invoke };
}
test('选择文字操作正确转义内容并读回，不需要传节点 ID', async () => {
  const f = fixture();
  const text = '中文 "引号"\n${不执行}';
  const result = await f.invoke(text);
  assert.equal(f.target.characters, text);
  assert.equal(result.characters, text);
});
test('过期上下文和非单一文字选择拒绝执行', () => {
  assert.throws(() => selectedTextEdit({ ...state, stale: true }, '新文案'));
  assert.throws(() => selectedTextEdit({ ...state, context: { selection: [] } }, '新文案'));
});
test('字体加载期间选择或正文变化时保留原内容，主组件需要确认', async () => {
  const changed = fixture((target, figma) => { figma.currentPage.selection = []; });
  await assert.rejects(changed.invoke('不应写入'), /选择已变化/);
  assert.equal(changed.target.characters, '原文');
  const concurrent = fixture(target => { target.characters = '用户新内容'; });
  await assert.rejects(concurrent.invoke('不应覆盖'), /文字已发生变化/);
  assert.equal(concurrent.target.characters, '用户新内容');
  const shared = fixture(); shared.target.parent.type = 'COMPONENT';
  await assert.rejects(shared.invoke('不应覆盖'), /主组件/);
  assert.equal(shared.target.characters, '原文');
});

test('文字、实例及任意祖先锁定时禁止写入，字体加载前拒绝', async () => {
  for (const level of ['文字', '实例', '外层框架']) {
    let loads = 0;
    const f = fixture(() => { loads++; });
    const outer = { type: 'FRAME', parent: f.target.parent.parent };
    const instance = { type: 'INSTANCE', parent: outer };
    f.target.parent = instance;
    ({ 文字: f.target, 实例: instance, 外层框架: outer })[level].locked = true;
    let writes = 0;
    Object.defineProperty(f.target, 'characters', { get: () => '原文', set: () => { writes++; } });
    await assert.rejects(f.invoke('不应写入'), /已锁定/);
    assert.equal(writes, 0, level);
    assert.equal(loads, 0, level);
  }
});

test('字体加载期间新增锁定或移入锁定祖先时禁止写入', async () => {
  for (const mutate of [
    target => { target.locked = true; },
    target => { target.parent.locked = true; },
    target => { target.parent = { type: 'FRAME', locked: true, parent: target.parent }; }
  ]) {
    const f = fixture(mutate);
    let writes = 0;
    Object.defineProperty(f.target, 'characters', { get: () => '原文', set: () => { writes++; } });
    await assert.rejects(f.invoke('不应写入'), /已锁定/);
    assert.equal(writes, 0);
  }
});

test('未锁定实例保留文字覆盖能力', async () => {
  const f = fixture();
  f.target.parent.type = 'INSTANCE';
  const result = await f.invoke('实例新文案');
  assert.equal(result.characters, '实例新文案');
  assert.equal(f.target.characters, '实例新文案');
});
