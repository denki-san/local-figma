import { test } from 'node:test';
import assert from 'node:assert/strict';
import { textOperation, fillOperation } from '../src/edit-operations.mjs';

const execute = (operation, figma, target) => new (Object.getPrototypeOf(async function () {}).constructor)('figma', 'target', operation.code)(figma, target);
function fixture() {
  const page = { id: '1:0', type: 'PAGE' }, binding = { id: '1:1', type: 'FRAME', parent: page };
  const scope = { id: '1:2', type: 'FRAME', parent: binding };
  const target = { id: '1:3', type: 'TEXT', parent: scope, characters: '原文', fontName: {} };
  const figma = { currentPage: page, mixed: Symbol(), loadFontAsync: async () => {} };
  const options = { targetId: target.id, pageId: page.id, scopeId: scope.id, bindingNodeId: binding.id, type: target.type, expectedText: '原文', protectInstances: true, protectInvisible: true };
  return { page, binding, scope, target, figma, options };
}
test('字体加载后再次检查页面、祖先锁定、实例、可见性和绑定范围', async () => {
  for (const change of [
    f => { f.scope.locked = true; },
    f => { f.scope.type = 'INSTANCE'; },
    f => { f.scope.visible = false; },
    f => { f.target.parent = f.binding; },
    f => { f.scope.parent = f.page; },
    f => { f.binding.parent = { id: '2:0', type: 'PAGE' }; },
    f => { f.figma.currentPage = { id: '2:0' }; }
  ]) {
    const f = fixture();
    f.figma.loadFontAsync = async () => change(f);
    await assert.rejects(execute(textOperation(f.options, '新文'), f.figma, f.target));
    assert.equal(f.target.characters, '原文');
  }
});
test('颜色读回容忍 Figma 的 float32 精度，并保留透明度', async () => {
  const f = fixture(); f.target.type = 'RECTANGLE'; f.options.type = 'RECTANGLE';
  let paints = [{ type: 'SOLID', opacity: 0.75, color: { r: 0, g: 0, b: 0 } }];
  Object.defineProperty(f.target, 'fills', {
    get: () => paints,
    set: value => { paints = value.map(p => ({ ...p, color: Object.fromEntries(Object.entries(p.color).map(([key, value]) => [key, Math.fround(value)])) })); }
  });
  const result = await execute(fillOperation(f.options, '#3366FF'), f.figma, f.target);
  assert.equal(result.changedNodeIds[0], f.target.id);
  assert.equal(paints[0].opacity, 0.75);
  assert(Math.abs(result.color.r - 0.2) < 1e-6);
});
test('实际颜色不符时仍报告失败，已有变化由上层保留待核验', async () => {
  const f = fixture(); f.target.type = 'RECTANGLE'; f.options.type = 'RECTANGLE';
  Object.defineProperty(f.target, 'fills', { get: () => [{ type: 'SOLID', color: { r: 0, g: 0, b: 0 } }], set: () => {} });
  await assert.rejects(execute(fillOperation(f.options, '#3366FF'), f.figma, f.target), /读回不一致/);
});
