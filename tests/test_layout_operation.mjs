import { test } from 'node:test';
import assert from 'node:assert/strict';
import { selectedLayoutEdit } from '../src/operations.mjs';
import { parseArguments } from '../src/arguments.mjs';

const state = { connected: true, stale: false, context: { pageId: '1:1', selection: [{ id: '1:2', type: 'FRAME' }] } };
function fixture() {
  let writes = 0;
  const target = { id: '1:2', type: 'FRAME', width: 320, height: 180, layoutMode: 'VERTICAL', layoutSizingHorizontal: 'FIXED', layoutSizingVertical: 'FIXED', parent: { type: 'PAGE' },
    resize(width, height) { writes++; this.width = width; this.height = height; } };
  const figma = { currentPage: { id: '1:1', selection: [target] } };
  const invoke = values => new Function('figma', 'target', 'return (async()=>{' + selectedLayoutEdit(state, values).code + '})()')(figma, target);
  return { target, figma, invoke, writes: () => writes };
}
test('布局入口接受有限参数，拒绝重复、空值与跨命令参数', () => {
  assert.deepEqual(parseArguments(['layout', '--width', '344', '--gap', '8.5', '--padding', '0']).layoutValues, { width: 344, gap: 8.5, padding: 0 });
  for (const args of [['layout'], ['layout', '--width'], ['layout', '--gap', '-1'], ['layout', '--width', 'Infinity'], ['layout', '--gap', '2', '--gap', '3'], ['text', '--width', '20'], ['layout', '--node', '1:2']]) assert.throws(() => parseArguments(args));
  for (const values of [{}, { width: 0 }, { width: Infinity }, { height: 100001 }, { padding: -1 }, { gap: NaN }, { unknown: 1 }]) assert.throws(() => selectedLayoutEdit(state, values));
});
test('当前 Frame 尺寸、间距与内边距修改后逐项读回', async () => {
  const f = fixture();
  const result = await f.invoke({ width: 344, gap: 8, padding: 12 });
  assert.equal(f.target.height, 180);
  assert.equal(result.after.width, 344);
  assert.equal(result.after.gap, 8);
  for (const key of ['paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft']) assert.equal(result.after[key], 12);
  assert.deepEqual(result.changedNodeIds, ['1:2']);
});
test('过期或多选上下文无法生成布局写入', () => {
  assert.throws(() => selectedLayoutEdit({ ...state, stale: true }, { width: 100 }));
  assert.throws(() => selectedLayoutEdit({ ...state, connected: false }, { width: 100 }));
  assert.throws(() => selectedLayoutEdit({ ...state, context: { selection: [] } }, { width: 100 }));
});
test('选区、锁定、组件与尺寸模式在任何写入前复核', async () => {
  for (const mutate of [
    f => { f.figma.currentPage.selection = []; },
    f => { f.figma.currentPage.id = '9:9'; },
    f => { f.target.locked = true; },
    f => { f.target.parent = { type: 'FRAME', locked: true }; },
    f => { f.target.parent = { type: 'COMPONENT' }; },
    f => { f.target.parent = { type: 'INSTANCE' }; },
    f => { f.target.layoutSizingHorizontal = 'FILL'; },
    f => { f.target.layoutMode = 'NONE'; }
  ]) {
    const f = fixture(); mutate(f);
    await assert.rejects(f.invoke({ width: 400, gap: 10 }));
    assert.equal(f.writes(), 0); assert.equal(f.target.width, 320); assert.equal(f.target.itemSpacing, undefined);
  }
});
test('实际尺寸未达到要求时报告读回失败', async () => {
  const f = fixture(); f.target.resize = () => {};
  await assert.rejects(f.invoke({ width: 500 }), /读回不一致/);
});
