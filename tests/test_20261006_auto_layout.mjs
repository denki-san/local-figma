import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseArguments } from '../src/arguments.mjs';
import { selectedLayoutEdit } from '../src/operations.mjs';
import { commandLayoutProperties, applyLayoutProperties, layoutEnums, layoutNumbers } from '../src/20261006-layout.mjs';
import { validatePlan, stepCode } from '../src/20260930-workflow.mjs';

const state = { connected: true, stale: false, context: { pageId: '1:1', selection: [{ id: '1:2', type: 'FRAME' }] } };
// 模拟节点只验证前置检查、写入顺序和读回，不模拟 Figma 排版引擎。
function fixture(overrides = {}, normalize = {}) {
  const writes = [], events = [];
  const raw = { id: '1:2', name: 'Card', type: 'FRAME', width: 320, height: 180, children: [],
    layoutMode: 'NONE', layoutSizingHorizontal: 'FIXED', layoutSizingVertical: 'FIXED',
    layoutPositioning: 'AUTO', fontName: { family: 'Inter', style: 'Regular' }, parent: { id: '1:1', type: 'PAGE', layoutMode: 'NONE' }, ...overrides };
  const node = new Proxy(raw, { set(target, property, value) {
    writes.push([property, value]); events.push(['write', property]);
    target[property] = normalize[property] ? normalize[property](value) : value;
    if (property === 'layoutMode') { target.width = 99; target.height = 88; }
    return true;
  } });
  raw.resize = (width, height) => { writes.push(['resize', width, height]); raw.width = width; raw.height = height; };
  if (node.parent?.type !== 'PAGE') node.parent.children = [node];
  let scope = node;
  while (['HORIZONTAL', 'VERTICAL', 'GRID'].includes(scope.parent?.layoutMode)) scope = scope.parent;
  const scopedState = { ...state, context: { ...state.context, selection: [{ id: node.id, type: 'FRAME', layoutScopeNodeId: scope.id }] } };
  const figma = { currentPage: { id: '1:1', selection: [node] }, loadFontAsync: async font => { events.push(['font', font]); }, getNodeByIdAsync: async id => { for (let n = node; n; n = n.parent) if (n.id === id) return n; return null; } };
  const invoke = (values, context = scopedState, root = scope) => new Function('figma', 'target', 'return (async()=>{' + selectedLayoutEdit(context, values).code + '})()')(figma, root);
  return { node, raw, writes, events, figma, invoke, scopedState, scope };
}
const makePlan = (properties, assertions = [{ property: 'exists', equals: true }]) => ({ version: 1, id: 'auto-layout', title: 'Auto Layout validation', capabilities: [],
  steps: [{ id: 'card', title: 'Set layout', operation: { kind: 'update', properties }, assertions }] });
const execute = (plan, f, verifyOnly = false, root = f.node) => new Function('figma', 'target', 'return (async()=>{' + stepCode(plan, plan.steps[0], 'binding', verifyOnly) + '})()')(f.figma, root);

test('新增 CLI 枚举及四边参数正确解析，并拒绝错误枚举与重复值', () => {
  const values = parseArguments(['layout', '--direction', 'vertical', '--horizontal-sizing', 'fixed', '--vertical-sizing', 'hug', '--primary-align', 'space-between', '--counter-align', 'center', '--gap', '12', '--padding', '20', '--padding-top', '8', '--padding-right', '9', '--padding-bottom', '10', '--padding-left', '11']).layoutValues;
  assert.deepEqual(commandLayoutProperties(values), { layoutMode: 'VERTICAL', layoutSizingHorizontal: 'FIXED', layoutSizingVertical: 'HUG', primaryAxisAlignItems: 'SPACE_BETWEEN', counterAxisAlignItems: 'CENTER', itemSpacing: 12, paddingTop: 8, paddingRight: 9, paddingBottom: 10, paddingLeft: 11 });
  for (const args of [ ['layout', '--direction', 'diagonal'], ['layout', '--horizontal-sizing', 'auto'], ['layout', '--counter-align', 'space-between'], ['layout', '--direction', 'vertical', '--direction', 'horizontal'], ['text', '--direction', 'vertical'], ['layout', '--padding-left', '-1'] ]) assert.throws(() => parseArguments(args));
});

test('统一内边距不受输入顺序影响，四边独立值覆盖统一值', async () => {
  for (const values of [{ paddingTop: 3, paddingRight: 4, paddingBottom: 5, paddingLeft: 6, padding: 20, direction: 'vertical' }, { direction: 'horizontal', padding: 20, paddingTop: 3, paddingRight: 4, paddingBottom: 5, paddingLeft: 6 }]) {
    const f = fixture(); const result = await f.invoke(values);
    assert.deepEqual(['Top', 'Right', 'Bottom', 'Left'].map(side => result.after['padding' + side]), [3, 4, 5, 6]);
  }
});

test('静态无效组合在生成写入脚本前拒绝', () => {
  for (const values of [{ direction: 'none', gap: 10 }, { direction: 'none', padding: 2 }, { horizontalSizing: 'hug', width: 300 }, { verticalSizing: 'fill', height: 50 }, { gap: 10001 }]) {
    const f = fixture(); assert.throws(() => selectedLayoutEdit(state, values)); assert.deepEqual(f.writes, []);
  }
});

test('Fill 父容器与绝对定位约束在任何写入前检查', async () => {
  for (const overrides of [{}, { parent: { id: '1:1', type: 'PAGE', layoutMode: 'NONE' } }, { layoutPositioning: 'ABSOLUTE', parent: { id: '1:3', type: 'FRAME', layoutMode: 'VERTICAL' } }]) {
    const f = fixture(overrides); await assert.rejects(f.invoke({ direction: 'vertical', horizontalSizing: 'fill', gap: 12 }), /Fill/); assert.deepEqual(f.writes, []);
  }
  const f = fixture({ parent: { id: '1:3', type: 'FRAME', layoutMode: 'VERTICAL' } });
  assert.equal((await f.invoke({ direction: 'vertical', horizontalSizing: 'fill' })).after.layoutSizingHorizontal, 'FILL');
});

test('当前 Hug 尺寸和缺少布局方向的间距冲突不产生写入', async () => {
  const hug = fixture({ layoutMode: 'VERTICAL', layoutSizingHorizontal: 'HUG' });
  await assert.rejects(hug.invoke({ width: 400, gap: 8 }), /尺寸/); assert.deepEqual(hug.writes, []);
  const none = fixture(); await assert.rejects(none.invoke({ gap: 8 }), /Auto Layout/); assert.deepEqual(none.writes, []);
  const child = fixture({ type: 'RECTANGLE', parent: { layoutMode: 'VERTICAL' } });
  assert.throws(() => applyLayoutProperties(child.node, { layoutSizingHorizontal: 'HUG' }), /Hug/); assert.deepEqual(child.writes, []);
});

test('先启用方向再设置尺寸模式，最后恢复明确的固定宽度', () => {
  const f = fixture();
  const properties = { layoutMode: 'VERTICAL', layoutSizingHorizontal: 'FIXED', layoutSizingVertical: 'HUG', width: 360, paddingLeft: 16 };
  applyLayoutProperties(f.node, properties, false); assert.deepEqual(f.writes, []);
  applyLayoutProperties(f.node, properties);
  assert.equal(f.writes[0][0], 'layoutMode');
  assert.deepEqual(f.writes.at(-1), ['resize', 360, 88]);
  assert.equal(f.node.width, 360); assert.equal(f.node.layoutSizingVertical, 'HUG');
});

test('工作流接受所有布局属性与断言，拒绝无效枚举数值和尺寸冲突', () => {
  for (const [property, values] of Object.entries(layoutEnums)) for (const equals of values) assert.doesNotThrow(() => validatePlan(makePlan({ [property]: equals }, [{ property, equals }])));
  for (const property of layoutNumbers) assert.doesNotThrow(() => validatePlan(makePlan({ [property]: 16 }, [{ property, equals: 16 }])));
  const good = makePlan({ layoutMode: 'VERTICAL', layoutSizingHorizontal: 'FIXED', layoutSizingVertical: 'HUG', width: 320, itemSpacing: 12, paddingTop: 16, paddingRight: 16, paddingBottom: 16, paddingLeft: 16, primaryAxisAlignItems: 'MIN', counterAxisAlignItems: 'CENTER' }, [{ property: 'layoutMode', equals: 'VERTICAL' }]);
  assert.equal(validatePlan(good), good);
  for (const properties of [{ layoutMode: 'diagonal' }, { layoutMode: 'NONE', itemSpacing: 2 }, { width: 300, layoutSizingHorizontal: 'FILL' }, { textAutoResize: 'BAD' }, { itemSpacing: -1 }, { paddingLeft: Infinity }]) assert.throws(() => validatePlan(makePlan(properties)));
  for (const assertion of [{ property: 'layoutMode', equals: 'BAD' }, { property: 'itemSpacing', equals: -1 }, { property: 'paddingTop', equals: '16' }]) assert.throws(() => validatePlan(makePlan({ name: 'Card' }, [assertion])));
  const doc = fs.readFileSync(new URL('../docs/20260930-workflows.md', import.meta.url), 'utf8');
  for (const match of doc.matchAll(/```json\n([\s\S]*?)\n```/g)) assert.doesNotThrow(() => validatePlan(JSON.parse(match[1])));
});

test('stepCode 序列化后独立执行并检查布局声明', async () => {
  const plan = makePlan({ layoutMode: 'HORIZONTAL', layoutSizingHorizontal: 'FIXED', width: 420, itemSpacing: 12, counterAxisAlignItems: 'CENTER' }, [{ property: 'width', equals: 420 }, { property: 'layoutMode', equals: 'HORIZONTAL' }]);
  const f = fixture(); const result = await execute(plan, f);
  assert.equal(result.verified, true); assert.equal(f.node.width, 420); assert.equal(f.node.itemSpacing, 12);
  assert.equal(result.visualReview, 'not-run');
});

test('verifyOnly 读回匹配与不匹配均不写入，命令和工作流识别读回偏差', async () => {
  const plan = makePlan({ itemSpacing: 12 }, [{ property: 'layoutMode', equals: 'VERTICAL' }]);
  const f = fixture({ layoutMode: 'VERTICAL', itemSpacing: 12 });
  assert.equal((await execute(plan, f, true)).verified, true); assert.deepEqual(f.writes, []);
  f.raw.itemSpacing = 10;
  const mismatch = await execute(plan, f, true); assert.equal(mismatch.verified, false); assert.deepEqual(f.writes, []);
  assert.deepEqual(mismatch.assertions.find(a => a.property === 'itemSpacing'), { property: 'itemSpacing', expected: 12, actual: 10, passed: false });
  const command = fixture({ layoutMode: 'VERTICAL' }, { itemSpacing: () => 10 });
  await assert.rejects(command.invoke({ gap: 12 }), /读回不一致/);
  const workflow = fixture({ layoutMode: 'VERTICAL' }, { itemSpacing: () => 10 });
  assert.equal((await execute(plan, workflow)).verified, false);
});

test('工作流父约束失败在普通属性写入之前发生，文字布局属性可序列化执行', async () => {
  const invalid = makePlan({ name: 'Renamed', layoutMode: 'VERTICAL', layoutSizingHorizontal: 'FILL' });
  const f = fixture(); await assert.rejects(execute(invalid, f), /Fill/);
  assert.deepEqual(f.writes, []); assert.equal(f.node.name, 'Card');
  const text = fixture({ type: 'TEXT', parent: { id: '1:3', type: 'FRAME', layoutMode: 'VERTICAL' } });
  const textPlan = makePlan({ layoutSizingHorizontal: 'FILL', textAutoResize: 'HEIGHT', layoutPositioning: 'AUTO' }, [{ property: 'textAutoResize', equals: 'HEIGHT' }]);
  textPlan.steps[0].target = { id: text.node.id };
  assert.equal((await execute(textPlan, text, false, text.scope)).verified, true);
});


test('独立 TEXT 可 Hug，文字尺寸和自适应写入先加载字体', async () => {
  for (const properties of [{ layoutSizingHorizontal: 'HUG' }, { textAutoResize: 'HEIGHT' }]) {
    const text = fixture({ type: 'TEXT' });
    assert.equal((await execute(makePlan(properties), text)).verified, true);
    assert.equal(text.events[0][0], 'font');
    assert.ok(text.events.some(event => event[0] === 'write'));
    assert.deepEqual(text.events[0][1], { family: 'Inter', style: 'Regular' });
  }
});

test('CLI 扩大到连续 Auto Layout 祖先并捕获兄弟重排，过期 scope 零写入', async () => {
  const grand = { id: '1:4', type: 'FRAME', layoutMode: 'VERTICAL', x: 0, y: 0, width: 500, height: 500, children: [], parent: { id: '1:1', type: 'PAGE' } };
  const parent = { id: '1:3', type: 'FRAME', layoutMode: 'HORIZONTAL', x: 0, y: 0, width: 500, height: 200, parent: grand };
  const f = fixture({ layoutMode: 'VERTICAL', parent }); grand.children = [parent];
  const sibling = { id: '1:5', type: 'FRAME', x: 320, y: 0, width: 100, height: 100, parent }; parent.children.push(sibling);
  const resize = f.raw.resize;
  f.raw.resize = (width, height) => { resize(width, height); sibling.x = width; parent.height = height + 10; };
  assert.equal(selectedLayoutEdit(f.scopedState, { width: 400 }).targetNodeId, grand.id);
  const result = await f.invoke({ width: 400 });
  assert.equal(result.layoutScopeNodeId, grand.id);
  assert.ok(result.changedNodeIds.includes(sibling.id)); assert.ok(result.changedNodeIds.includes(parent.id)); assert.ok(result.changedNodeIds.includes(f.node.id));
  const stale = fixture({ layoutMode: 'VERTICAL', parent: { id: '1:6', type: 'FRAME', layoutMode: 'VERTICAL' } });
  await assert.rejects(stale.invoke({ width: 400 }, state, stale.node), /布局范围已变化/);
  assert.deepEqual(stale.writes, []);
});

test('工作流布局重排超出步骤 root 拒绝且普通属性也不写入', async () => {
  const f = fixture({ layoutMode: 'VERTICAL', parent: { id: '1:3', type: 'FRAME', layoutMode: 'VERTICAL' } });
  const plan = makePlan({ name: 'Renamed', width: 400, itemSpacing: 12 });
  await assert.rejects(execute(plan, f), /布局重排超出步骤范围/);
  assert.deepEqual(f.writes, []); assert.equal(f.node.name, 'Card');
  plan.steps[0].target = { id: f.node.id };
  assert.equal((await execute(plan, f, false, f.scope)).verified, true);
});

test('create 的自动布局影响范围越界在工厂、append 与产物登记之前拒绝', async () => {
  const f = fixture({ layoutMode: 'VERTICAL', parent: { id: '1:3', type: 'FRAME', layoutMode: 'VERTICAL' } });
  const creationWrites = [];
  f.raw.getSharedPluginData = () => '';
  f.raw.setSharedPluginData = (...args) => { creationWrites.push(['registry', ...args]); };
  f.raw.appendChild = child => { creationWrites.push(['append', child]); f.raw.children.push(child); };
  f.figma.createFrame = () => { creationWrites.push(['factory']); return { id: '1:9', type: 'FRAME', setSharedPluginData: (...args) => creationWrites.push(['marker', ...args]) }; };
  const plan = makePlan({ name: 'New card', layoutMode: 'VERTICAL' });
  plan.steps[0].operation.kind = 'create';
  plan.steps[0].operation.type = 'FRAME';
  await assert.rejects(execute(plan, f), /创建将重排步骤范围外/);
  assert.equal(f.node.children.length, 0);
  assert.deepEqual(creationWrites, []);
  assert.deepEqual(f.writes, []);
});
