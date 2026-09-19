import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import { contract } from './helpers/test_schema.mjs';

const source = await fs.readFile(new URL('../plugin/main.js', import.meta.url), 'utf8');
test('独立 inspect 区分目标确实缺失与普通执行错误，保留原文件证据', async () => {
  const f = fixture();
  f.figma.getNodeByIdAsync = async () => null;
  await f.figma.ui.onmessage({ id: 'missing', operation: 'inspect', targetNodeId: '1:3', binding: { fileKey: 'abc', nodeId: '1:2' } });
  const result = f.messages[0];
  assert.equal(result.ok, false); assert.equal(result.executionStarted, false);
  assert.equal(result.targetMissing, true); assert.equal(result.missingNodeId, '1:3'); assert.equal(result.fileVerified, 'abc');
  assert.equal(f.checkpoints.length, 0);
  const { channelNonce, ...persisted } = result;
  contract('result', { ...persisted, id: '00000000-0000-4000-8000-000000000001', finishedAt: '2026-09-19T00:00:00.000Z' });
});
test('停机页缩小窗口，常驻面板保留确认区空间', () => {
  for (const [html, height] of [['', 280], ['<html data-runtime-inactive>', 170]]) {
    let size;
    vm.runInNewContext(source, { figma: { showUI: (_, options) => { size = options; }, ui: {} }, __html__: html, setTimeout, clearTimeout });
    assert.equal(size.width, 340);
    assert.equal(size.height, height);
    assert.equal(size.themeColors, true);
  }
});
test('大结果以字符串跨宿主传递，避免大量数字数组逐项转换', async () => {
  const f = fixture();
  await f.run('return Array.from({length: 40000}, (_, i) => i % 256);');
  const envelope = f.messages[0];
  assert.equal(envelope.type, 'serialized-result');
  const result = JSON.parse(envelope.serialized);
  assert.equal(result.ok, true);
  assert.equal(result.output.length, 40000);
  assert.equal(result.output[39999], 39999 % 256);
});
test('自动上下文从当前选择识别 Frame，多区域选择保持需要确认', async () => {
  const f = fixture();
  const page = f.target.parent;
  const frame = { id: '2:1', name: '选中画板', type: 'FRAME', parent: page, children: [f.target] };
  f.target.parent = frame;
  f.figma.currentPage = page;
  page.selection = [f.target];
  await f.figma.ui.onmessage({ type: 'context-request', contextNonce: 'context-test' });
  assert.equal(f.messages[0].context.target.id, frame.id);
  assert.equal(f.messages[0].context.selection[0].id, f.target.id);
  assert.equal(f.messages[0].contextNonce, 'context-test');
  page.selection = [frame, { id: '2:2', type: 'FRAME', name: '其他区域', parent: page }];
  await f.figma.ui.onmessage({ type: 'context-request', contextNonce: 'context-test' });
  assert.equal(f.messages.at(-1).context.target, null);
  assert.equal(f.messages.at(-1).context.needsSelection, true);
  assert.equal(f.checkpoints.length, 0);
});
test('隐藏面板仅调用隐藏接口，后续任务继续执行', async () => {
  const f = fixture();
  let hidden = 0;
  f.figma.ui.hide = () => { hidden++; };
  await f.figma.ui.onmessage({ type: 'hide-ui' });
  assert.equal(hidden, 1);
  assert.equal(f.messages.length, 0);
  await f.run('return target.id;');
  assert.equal(f.messages[0].ok, true);
});
test('复杂画板可导出预览并标明摘要截断，完整写入仍受节点预算保护', async () => {
  const f = fixture();
  let exports = 0;
  Object.assign(f.target, { type: 'FRAME', children: Array.from({ length: 2100 }, (_, i) => ({
    id: `4:${i}`, type: 'TEXT', name: '测试文字'
  })), exportAsync: async options => {
    assert.equal(options.format, 'PNG');
    exports++;
    return new Uint8Array([137, 80, 78, 71]);
  } });
  await f.figma.ui.onmessage({ id: 'preview', operation: 'preview', binding: { fileKey: 'abc', nodeId: '1:2' } });
  assert.equal(exports, 1);
  assert.equal(f.messages[0].ok, true);
  assert.equal(f.messages[0].before.truncated, true);
  assert.equal(f.messages[0].before.children, undefined);
  assert.equal(f.messages[0].png.length, 4);
  assert.equal(f.messages[0].bindingVerified.nodeId, f.target.id);
  await f.run('target.name="不应修改";');
  assert.equal(f.messages[1].executionStarted, false);
  assert.match(f.messages[1].error, /2000/);
  assert.equal(f.target.name, '标题');
  assert.equal(f.checkpoints.length, 0);
  assert.equal(f.undoCalls.length, 0);
});
test('超过深度上限的快照拒绝写入，尚未进入快照确认或 Undo 边界', async () => {
  const f = fixture();
  let current = f.target;
  for (let depth = 0; depth < 34; depth++) {
    const child = { id: `8:${depth}`, name: '保留内容', type: 'FRAME', parent: current };
    current.children = [child]; current = child;
  }
  await f.run('target.name="不应修改";');
  assert.equal(f.messages[0].ok, false);
  assert.equal(f.messages[0].executionStarted, false);
  assert.match(f.messages[0].error, /快照被截断/);
  assert.equal(f.target.name, '标题');
  assert.equal(f.checkpoints.length, 0);
  assert.equal(f.undoCalls.length, 0);
});
test('二十层组件树完整保存后可执行，保留深层变化', async () => {
  const f = fixture();
  let current = f.target;
  for (let depth = 0; depth < 20; depth++) {
    const child = { id: `7:${depth}`, name: '深层内容', type: 'FRAME', parent: current };
    current.children = [child]; current = child;
  }
  await f.run('let n=target; while(n.children?.length) n=n.children[0]; n.name="深层修改";');
  assert.equal(f.messages[0].ok, true);
  let before = f.messages[0].before, after = f.messages[0].after;
  for (let depth = 0; depth < 20; depth++) { before=before.children[0]; after=after.children[0]; }
  assert.equal(before.name, '深层内容');
  assert.equal(after.name, '深层修改');
});
test('局部目标仅允许绑定后代，越界时不读取目标正文也不执行脚本', async () => {
  const f = fixture();
  const job = { id: 'local', operation: 'run', targetNodeId: f.target.id,
    binding: { fileKey: 'abc', nodeId: f.target.parent.id }, code: 'target.characters="局部修改"; return target.id;' };
  await f.figma.ui.onmessage(job);
  assert.equal(f.messages[0].ok, true);
  assert.equal(f.checkpoints[0].bindingVerified.nodeId, f.target.id);
  assert.equal(f.messages[0].bindingVerified.nodeId, f.target.id);
  const outside = fixture();
  await outside.figma.ui.onmessage({ ...job, binding: { fileKey: 'abc', nodeId: '9:9' } });
  assert.equal(outside.messages[0].executionStarted, false);
  assert.equal(outside.messages[0].before, undefined);
  assert.equal(outside.messages[0].after, undefined);
  assert.equal(outside.target.characters, '原文');
});

test('快照确认期间局部目标被移出绑定区域时拒绝写入', async () => {
  const f = fixture('abc', true, target => { target.parent = { id: '9:9', type: 'FRAME', parent: target.parent.parent }; });
  const page = f.target.parent;
  f.target.parent = { id: '1:3', type: 'FRAME', parent: page };
  await f.figma.ui.onmessage({ id: 'local', operation: 'run', targetNodeId: f.target.id,
    binding: { fileKey: 'abc', nodeId: '1:3' }, code: 'target.characters="不应修改";' });
  assert.equal(f.messages[0].executionStarted, false);
  assert.equal(f.target.characters, '原文');
});
test('大页面 inspect 返回带截断标记的顶层目录，写入仍拒绝超预算快照', async () => {
  const f = fixture();
  Object.assign(f.target, { type: 'PAGE', loadAsync: async () => {}, children: [{
    id: '2:1', type: 'FRAME', name: '测试区域', children: Array.from({ length: 2100 }, (_, i) => ({ id: `3:${i}`, type: 'TEXT', name: '测试文字' }))
  }] });
  await f.figma.ui.onmessage({ id: 'inspect', operation: 'inspect', binding: { fileKey: 'abc', nodeId: '1:2' } });
  assert.equal(f.messages[0].ok, true);
  assert.equal(f.messages[0].output.children[0].truncated, true);
  assert.equal(f.messages[0].output.children[0].children, undefined);
  await f.run('target.characters="不应修改";');
  assert.equal(f.messages[1].executionStarted, false);
  assert.match(f.messages[1].error, /2000/);
  assert.equal(f.target.characters, '原文');
});
test('布局、截断、变量和原型进入独立快照，等待时变化会阻止脚本', async () => {
  const f = fixture();
  Object.assign(f.target, { paddingBottom: 24, textTruncation: 'ENDING', maxLines: 3,
    layoutSizingHorizontal: 'FILL', overflowDirection: 'VERTICAL',
    reactions: [{ actions: [{ type: 'NODE', destinationId: '2:1' }] }],
    boundVariables: { width: { type: 'VARIABLE_ALIAS', id: 'VariableID:1' } },
    fills: [{ type: 'SOLID', color: { r: 0, g: 0, b: 0 } }] });
  await f.run('target.paddingBottom=32; target.reactions[0].actions[0].destinationId="2:2";');
  assert.equal(f.messages[0].before.paddingBottom, 24);
  assert.equal(f.messages[0].after.paddingBottom, 32);
  assert.equal(f.messages[0].before.reactions[0].actions[0].destinationId, '2:1');
  assert.equal(f.messages[0].after.reactions[0].actions[0].destinationId, '2:2');
  assert.equal(f.messages[0].before.boundVariables.width.id, 'VariableID:1');
  assert.equal(f.messages[0].before.maxLines, 3);
  const changed = fixture('abc', true, target => { target.paddingBottom = 30; });
  changed.target.paddingBottom = 10;
  await changed.run('target.characters="不应覆盖";');
  assert.equal(changed.messages[0].executionStarted, false);
  assert.equal(changed.target.characters, '原文');
});
function fixture(key = 'abc', checkpointOk = true, onCheckpoint = () => {}, approval = true) {
  const messages = [];
  const page = { id: '1:1', type: 'PAGE', name: '页面', loadAsync: async () => {} };
  const target = { id: '1:2', type: 'TEXT', name: '标题', characters: '原文', parent: page, removed: false };
  const checkpoints = [], undoCalls = [], approvalEvents = [];
  const figma = { fileKey: key, mode: 'default', editorType: 'figma', commitUndo() { undoCalls.push(target.characters); }, showUI() {}, ui: { show() { approvalEvents.push('show'); }, postMessage: m => {
    if (m.type === 'approval-request') {
      approvalEvents.push('request');
      if (approval !== 'defer') figma.ui.onmessage({ type: 'approval-ack', id: m.id, approved: approval });
    } else if (m.type === 'checkpoint') {
      checkpoints.push(m);
      onCheckpoint(target);
      figma.ui.onmessage({ type: 'checkpoint-ack', id: m.id, ok: checkpointOk });
    } else messages.push(m);
  } }, getNodeByIdAsync: async id => id === target.id ? target : null, setCurrentPageAsync: async () => {} };
  vm.runInNewContext(source, { figma, __html__: '', setTimeout, clearTimeout });
  const run = (code, risk) => figma.ui.onmessage({ id: 'job', operation: 'run', binding: { fileKey: 'abc', nodeId: '1:2' }, code, risk });
  return { run, messages, target, checkpoints, figma, undoCalls, approvalEvents };
}
test('每批脚本前后划分 Undo 边界，部分失败也保留边界且不自动撤销', async () => {
  const f = fixture();
  f.figma.triggerUndo = () => assert.fail('禁止自动撤销');
  await f.run('target.characters="第一次修改";');
  await f.run('target.characters="第二次部分修改"; throw Error("中途失败");');
  assert.deepEqual(f.undoCalls, ['原文', '第一次修改', '第一次修改', '第二次部分修改']);
  assert.equal(f.target.characters, '第二次部分修改');
  for (const message of f.messages) {
    assert.equal(message.undoBoundaries.before, 'committed');
    assert.equal(message.undoBoundaries.after, 'committed');
  }
});
test('开始边界失败拒绝写入，结束边界失败保留原始错误和读回', async () => {
  const before = fixture();
  before.figma.commitUndo = () => { throw Error('边界不可用'); };
  await before.run('target.characters="不应写入";');
  assert.equal(before.target.characters, '原文');
  assert.equal(before.messages[0].executionStarted, false);
  assert.equal(before.messages[0].undoBoundaries.before, 'failed');
  const after = fixture(); let calls = 0;
  after.figma.commitUndo = () => { if (++calls === 2) throw Error('结束失败'); };
  await after.run('target.characters="部分修改"; throw Error("原始错误");');
  assert.equal(after.messages[0].ok, false);
  assert.equal(after.messages[0].after.characters, '部分修改');
  assert.match(after.messages[0].error, /原始错误.*结束失败/);
  assert.equal(after.messages[0].undoBoundaries.after, 'failed');
});
test('file key 缺失或错误时拒绝执行脚本', async () => {
  for (const key of ['', 'other']) {
    const f = fixture(key);
    await f.run('target.characters="被改写";');
    assert.equal(f.target.characters, '原文');
    assert.equal(f.messages[0].ok, false);
    assert.equal(f.messages[0].before, undefined);
    assert.equal(f.messages[0].after, undefined);
  }
});
test('高风险被拒绝时不执行也不保存写入快照，允许后执行', async () => {
  for (const approved of [false, true]) {
    const f = fixture('abc', true, () => {}, approved);
    await f.run('target.characters="高风险修改";', { level: 'high', reason: '测试修改' });
    assert.equal(f.target.characters, approved ? '高风险修改' : '原文');
    assert.equal(f.checkpoints.length, approved ? 1 : 0);
    assert.equal(f.messages[0].ok, approved);
    assert.deepEqual(f.approvalEvents, ['show', 'request']);
  }
});
test('隐藏面板的高风险请求先显示，等待明确决定期间保持原文', async () => {
  const f = fixture('abc', true, () => {}, 'defer');
  const pending = f.run('target.characters="确认后的修改";', { level: 'high', reason: '测试确认显示' });
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(f.approvalEvents, ['show', 'request']);
  assert.equal(f.target.characters, '原文');
  assert.equal(f.checkpoints.length, 0);
  await f.figma.ui.onmessage({ type: 'approval-ack', id: 'job', approved: false });
  await pending;
  assert.equal(f.target.characters, '原文');
  assert.equal(f.messages[0].executionStarted, false);
});
test('确认面板显示失败时不执行脚本', async () => {
  const f = fixture();
  f.figma.ui.show = () => { throw Error('面板无法显示'); };
  await f.run('target.characters="不应执行";', { level: 'high', reason: '测试显示失败' });
  assert.equal(f.target.characters, '原文');
  assert.equal(f.checkpoints.length, 0);
  assert.equal(f.messages[0].ok, false);
  assert.match(f.messages[0].error, /面板无法显示/);
});
test('读回失败保留未知状态，确认删除才记录 null', async () => {
  const f = fixture();
  await f.run('Object.defineProperty(target,"name",{get(){throw Error("读取失败")}});');
  assert.equal(f.messages[0].ok, false);
  assert.equal(f.messages[0].before.name, '标题');
  assert.equal(f.messages[0].after, undefined);
  const removed = fixture();
  await removed.run('target.removed=true; throw Error("删除后失败");');
  assert.equal(removed.messages[0].after, null);
});
test('成功和部分失败都保存真实前后读回', async () => {
  const f = fixture();
  await f.run('target.characters="新内容"; return target.id;');
  assert.equal(f.checkpoints[0].before.characters, '原文');
  assert.equal(f.messages[0].before.characters, '原文');
  assert.equal(f.messages[0].after.characters, '新内容');
  await f.run('target.characters="部分写入"; throw Error("中断");');
  assert.equal(f.messages[1].ok, false);
  assert.equal(f.messages[1].before.characters, '新内容');
  assert.equal(f.messages[1].after.characters, '部分写入');
});
test('修改前快照未确认时禁止执行脚本', async () => {
  const f = fixture('abc', false);
  await f.run('target.characters="不应写入";');
  assert.equal(f.target.characters, '原文');
  assert.equal(f.messages[0].executionStarted, false);
  assert.equal(f.messages[0].ok, false);
});
test('等待快照期间用户修改目标时停止，保留用户修改', async () => {
  const f = fixture('abc', true, target => { target.characters = '用户新输入'; });
  await f.run('target.characters="脚本覆盖";');
  assert.equal(f.target.characters, '用户新输入');
  assert.equal(f.messages[0].executionStarted, false);
});
test('返回值含 BigInt 或循环引用时回传明确失败，保留已执行修改', async () => {
  for (const code of ['return 1n;', 'const result={}; result.self=result; return result;']) {
    const f = fixture();
    await f.run('target.characters="已执行修改";' + code);
    assert.equal(f.messages[0].ok, false);
    assert.equal(f.messages[0].executionStarted, true);
    assert.equal(f.messages[0].after.characters, '已执行修改');
    assert.match(f.messages[0].error, /JSON/);
    JSON.stringify(f.messages[0]);
  }
});
