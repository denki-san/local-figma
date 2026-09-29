import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { executeWorkflowStep } from '../src/20260930-workflow-runtime.mjs';
import { validatePlan, workflowCommand, readProgress, stepCode } from '../src/20260930-workflow.mjs';
import { init, json, root, save } from '../src/project.mjs';
import { start } from '../src/bridge.mjs';

const plan = () => ({ version: 1, id: 'sample', title: '静态组件', capabilities: [], steps: [{ id: 'card', title: '创建卡片', operation: { kind: 'create', type: 'FRAME', properties: { name: 'Card', width: 300, height: 200, fill: '#FFFFFF' } }, assertions: [{ property: 'name', equals: 'Card' }, { property: 'width', equals: 300 }, { property: 'fill', equals: '#FFFFFF' }] }] });
async function project(t, cleanup = true) {
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'test_20260930-workflow-'));
  if (cleanup) t.after(() => fs.rm(cwd, { recursive: true, force: true }));
  await init(cwd, 'https://www.figma.com/design/abc/test?node-id=1-2');
  return cwd;
}
async function importPlan(cwd, p) {
  const file = path.join(cwd, 'test_plan.json'); await save(file, p);
  return workflowCommand(cwd, ['import', file]);
}
function figmaFixture() {
  let next = 10;
  const nodes = new Map();
  function make(type, name = '') {
    const data = new Map();
    const node = { id: `1:${next++}`, type, name, width: 100, height: 100, x: 0, y: 0, visible: true, opacity: 1, cornerRadius: 0, fills: [], children: [], reactions: [], overflowDirection: 'NONE',
      getPluginData: () => { throw Error('Development plugin has no ID'); },
      getSharedPluginData: (ns, k) => data.get(ns + ':' + k) || '', setSharedPluginData: (ns, k, v) => data.set(ns + ':' + k, v),
      resize(w, h) { this.width = w; this.height = h; },
      appendChild(child) { if (child.parent) child.parent.children = child.parent.children.filter(n => n !== child); child.parent = this; this.children.push(child); },
      async setReactionsAsync(r) { this.reactions = r; }
    };
    if (type === 'TEXT') Object.assign(node, { characters: '', fontSize: 12, fontName: { family: 'Inter', style: 'Regular' } });
    nodes.set(node.id, node); return node;
  }
  const page = make('PAGE', 'Page'), rootNode = make('FRAME', 'Root'); page.appendChild(rootNode);
  const figma = { getNodeByIdAsync: async id => nodes.get(id) || null, loadFontAsync: async () => {}, currentPage: page };
  for (const [type, method] of Object.entries({ FRAME: 'createFrame', RECTANGLE: 'createRectangle', TEXT: 'createText', ELLIPSE: 'createEllipse', COMPONENT: 'createComponent' })) figma[method] = () => { const n = make(type); page.appendChild(n); return n; };
  return { figma, rootNode, page, make };
}
test('模式、操作、断言在提交前严格校验', () => {
  assert.equal(validatePlan(plan()).id, 'sample');
  for (const mutate of [p => delete p.capabilities, p => p.steps[0].assertions = [], p => p.steps[0].operation.properties.width = -1, p => p.steps.push(p.steps[0]), p => p.steps[0].operation.properties.reactions = [], p => p.steps[0].assertions[0].property = '__proto__']) {
    const p = plan(); mutate(p); assert.throws(() => validatePlan(p));
  }
  const p = plan(); p.steps[0].operation = { kind: 'scroll', direction: 'VERTICAL' };
  assert.throws(() => validatePlan(p), /滚动未授权/); p.capabilities = ['scroll']; assert.doesNotThrow(() => validatePlan(p));
});
test('重跑创建复用同一节点，断言由实际图层属性计算', async () => {
  const f = figmaFixture(), p = plan(), task = { step: p.steps[0], key: 'binding:sample:card', capabilities: [] };
  const a = await executeWorkflowStep(f.figma, f.rootNode, task);
  const b = await executeWorkflowStep(f.figma, f.rootNode, task);
  assert.equal(a.verified, true); assert.equal(b.nodeId, a.nodeId); assert.equal(b.reused, true); assert.equal(f.rootNode.children.length, 1);
  task.step.assertions[0].equals = 'Wrong';
  const c = await executeWorkflowStep(f.figma, f.rootNode, task);
  assert.equal(c.verified, false); assert.equal(c.assertions[0].actual, 'Card');
});
test('部分属性写入失败后重试不重复创建', async () => {
  const f = figmaFixture(), p = plan();
  p.steps[0].operation = { kind: 'create', type: 'TEXT', properties: { name: 'Title', characters: 'Hello' } };
  p.steps[0].assertions = [{ property: 'characters', equals: 'Hello' }];
  const task = { step: p.steps[0], key: 'binding:sample:title', capabilities: [] };
  f.figma.loadFontAsync = async () => { throw Error('font unavailable'); };
  await assert.rejects(executeWorkflowStep(f.figma, f.rootNode, task));
  assert.equal(f.rootNode.children.length, 1);
  f.figma.loadFontAsync = async () => {};
  assert.equal((await executeWorkflowStep(f.figma, f.rootNode, task)).verified, true);
  assert.equal(f.rootNode.children.length, 1);
});
test('精确路径拒绝歧义、越界和类型变化；失效 ID 可用唯一路径恢复', async () => {
  const f = figmaFixture(), a = f.make('FRAME', 'Card'); f.rootNode.appendChild(a);
  const step = { target: { id: '9:9', path: ['Card'], type: 'FRAME' }, operation: { kind: 'update', properties: { width: 42 } }, assertions: [{ property: 'width', equals: 42 }] };
  assert.equal((await executeWorkflowStep(f.figma, f.rootNode, { step, capabilities: [] })).nodeId, a.id);
  f.rootNode.appendChild(f.make('FRAME', 'Card'));
  await assert.rejects(executeWorkflowStep(f.figma, f.rootNode, { step, capabilities: [] }), /重名/);
  step.target = { id: f.page.id };
  await assert.rejects(executeWorkflowStep(f.figma, f.rootNode, { step, capabilities: [] }), /范围/);
  step.target = { id: a.id, type: 'TEXT' };
  await assert.rejects(executeWorkflowStep(f.figma, f.rootNode, { step, capabilities: [] }), /类型/);
});
test('静态稿以新任务补交互时复用原节点；未声明能力拒绝执行', async () => {
  const f = figmaFixture(), a = f.make('FRAME', 'A'), b = f.make('FRAME', 'B'); f.rootNode.appendChild(a); f.rootNode.appendChild(b);
  const step = { target: { id: a.id }, operation: { kind: 'connect', destination: { id: b.id } }, assertions: [{ property: 'reactionCount', equals: 1 }] };
  await assert.rejects(executeWorkflowStep(f.figma, f.rootNode, { step, capabilities: [] }), /能力/);
  const task = { step, capabilities: ['navigation'] };
  assert.equal((await executeWorkflowStep(f.figma, f.rootNode, task)).verified, true);
  await executeWorkflowStep(f.figma, f.rootNode, task);
  assert.equal(a.reactions.length, 1); assert.equal(f.rootNode.children.length, 2);
});
test('中断后认领原请求，等待后读取同一 job；完成的步骤不重跑', async t => {
  const cwd = await project(t); await importPlan(cwd, plan());
  const requests = []; let waits = 0;
  const dependencies = { submit: async body => { requests.push(body); if (requests.length === 1) throw Error('response lost'); return { id: body.requestId }; }, wait: async () => ++waits === 1 ? { waitStatus: 'timeout', journalComplete: false } : { waitStatus: 'completed', journalComplete: true, result: { ok: true, output: { verified: true } } } };
  assert.equal((await workflowCommand(cwd, ['run', 'sample'], dependencies)).state, 'waiting');
  assert.equal((await workflowCommand(cwd, ['run', 'sample'], dependencies)).state, 'waiting');
  assert.equal(requests[0].requestId, requests[1].requestId);
  assert.equal((await workflowCommand(cwd, ['run', 'sample'], dependencies)).state, 'done');
  await workflowCommand(cwd, ['run', 'sample'], dependencies);
  assert.equal(requests.length, 2); assert.equal(waits, 2);
  assert.equal((await readProgress(cwd)).state, 'done');
});
test('机器断言失败阻止下一步，明确 retry 新建尝试但保留旧结果', async t => {
  const cwd = await project(t), p = plan(); p.steps.push({ ...p.steps[0], id: 'second' }); await importPlan(cwd, p);
  let calls = 0;
  const deps = { submit: async b => ({ id: b.requestId }), wait: async () => ({ waitStatus: 'completed', journalComplete: true, result: { ok: true, output: { verified: ++calls > 1 } } }) };
  const first = await workflowCommand(cwd, ['run', p.id], deps); assert.equal(first.state, 'failed'); assert.equal(calls, 1);
  await workflowCommand(cwd, ['run', p.id], deps); assert.equal(calls, 1);
  const retried = await workflowCommand(cwd, ['retry', p.id], deps); assert.equal(retried.state, 'done'); assert.equal(calls, 3);
  assert.equal(retried.steps[0].attempts.length, 2); assert.equal(retried.steps[0].attempts[0].result.output.verified, false);
});
test('人工检查点阻止继续，确认必须对应当前步骤且保留说明', async t => {
  const cwd = await project(t), p = plan(); p.steps[0].humanReview = true; await importPlan(cwd, p);
  const deps = { submit: async b => ({ id: b.requestId }), wait: async () => ({ waitStatus: 'completed', journalComplete: true, result: { ok: true, output: { verified: true } } }) };
  assert.equal((await workflowCommand(cwd, ['run', p.id], deps)).state, 'awaiting-review');
  await assert.rejects(workflowCommand(cwd, ['approve', p.id, 'wrong', '检查完成']));
  await workflowCommand(cwd, ['approve', p.id, 'card', '用户确认布局和文字']);
  const done = await workflowCommand(cwd, ['run', p.id], deps);
  assert.equal(done.state, 'done'); assert.equal(done.steps[0].review.note, '用户确认布局和文字');
});
test('计划导入后不可原地改写，日志绑定其他文件拒绝执行', async t => {
  const cwd = await project(t); await importPlan(cwd, plan());
  await assert.rejects(importPlan(cwd, plan()), /已存在/);
  const file = path.join(root(cwd), 'workflows/sample.json'); const j = await json(file); j.plan.title = 'tamper'; await save(file, j);
  await assert.rejects(workflowCommand(cwd, ['run', 'sample']), /已变化/);
});
test('真实桥接复用提交 ID，拒绝内容变化，重启后仍识别已完成请求', async t => {
  const cwd = await project(t, false); let server = await start(cwd, 0);
  t.after(async () => { await server.close(); await fs.rm(cwd, { recursive: true, force: true }); });
  const credentials = async () => {
    const session = await json(path.join(root(cwd), 'session.json'));
    const html = await fs.readFile(path.join(root(cwd), 'plugin/ui.html'), 'utf8');
    const plugin = JSON.parse(html.match(/const config = (.*?);/)[1]);
    return { session, plugin };
  };
  let auth = await credentials();
  async function call(route, token, body) {
    const response = await fetch(`http://127.0.0.1:${server.port}${route}`, { method: body ? 'POST' : 'GET', headers: { 'X-Session-Token': token, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    return { status: response.status, body: await response.json(), progress: response.headers.get('X-Figma-Workflow') };
  }
  await importPlan(cwd, plan());
  const poll = await call('/poll?client=test', auth.plugin.token); assert.equal(JSON.parse(decodeURIComponent(poll.progress)).total, 1);
  const body = { requestId: crypto.randomUUID(), operation: 'run', code: 'return 1;' };
  const first = await call('/job', auth.session.token, body);
  assert.equal(first.status, 202);
  const again = await call('/job', auth.session.token, body); assert.equal(again.body.id, first.body.id); assert.equal(again.body.reused, true);
  assert.equal((await call('/job', auth.session.token, { ...body, code: 'return 2;' })).status, 400);
  await call('/poll?client=test', auth.plugin.token);
  await call('/complete', auth.plugin.token, { id: first.body.id, ok: true, output: 1 });
  await server.close(); server = await start(cwd, 0); auth = await credentials();
  assert.equal((await call('/job', auth.session.token, body)).body.id, first.body.id);
  const incomplete = crypto.randomUUID(); await fs.mkdir(path.join(root(cwd), 'runs', incomplete));
  assert.match((await call('/job', auth.session.token, { ...body, requestId: incomplete })).body.error, /不完整/);
});
test('生成脚本可独立执行，不依赖 CLI 模块作用域', async () => {
  const f = figmaFixture(), p = plan();
  const run = new Function('figma', 'target', 'return (async()=>{' + stepCode(p, p.steps[0], 'binding') + '})()');
  assert.equal((await run(f.figma, f.rootNode)).verified, true);
});

test('原任务结果未知时保留恢复证据，resolve 后只读核验通过才继续', async t => {
  const cwd = await project(t); await importPlan(cwd, plan());
  const submitted = [];
  const deps = { submit: async b => { submitted.push(b); return { id: b.requestId }; }, wait: async () => ({ waitStatus: 'needs-review', journalComplete: false, recovery: { reason: 'bridge restarted' }, instruction: 'inspect then resolve' }) };
  const stopped = await workflowCommand(cwd, ['run', 'sample'], deps);
  assert.equal(stopped.state, 'needs-review'); assert.equal(stopped.steps[0].attempts[0].recovery.instruction, 'inspect then resolve');
  await workflowCommand(cwd, ['run', 'sample'], deps); assert.equal(submitted.length, 1);
  await assert.rejects(workflowCommand(cwd, ['reconcile', 'sample'], { ...deps, readResult: async () => ({}) }), /resolve/);
  const done = await workflowCommand(cwd, ['reconcile', 'sample'], { ...deps, readResult: async () => ({ resolution: { status: 'reviewed-without-replay' } }), wait: async () => ({ waitStatus: 'completed', journalComplete: true, result: { ok: true, output: { verified: true } } }) });
  assert.equal(done.state, 'done'); assert.equal(done.steps[0].attempts.length, 2);
  assert.equal(done.steps[0].attempts[1].verifyOnly, true);
  assert.match(submitted[1].code, /"verifyOnly":true/);
});
test('恢复核验不补写缺失属性，弱断言不能掩盖部分完成', async () => {
  const f = figmaFixture(), p = plan(); p.steps[0].assertions = [{ property: 'exists', equals: true }];
  const task = { step: p.steps[0], key: 'binding:sample:card', capabilities: [] };
  await executeWorkflowStep(f.figma, f.rootNode, task);
  f.rootNode.children[0].width = 42;
  const result = await executeWorkflowStep(f.figma, f.rootNode, { ...task, verifyOnly: true });
  assert.equal(result.verified, false); assert.equal(f.rootNode.children[0].width, 42);
  const other = figmaFixture();
  await assert.rejects(executeWorkflowStep(other.figma, other.rootNode, { ...task, verifyOnly: true }), /未发现/);
  assert.equal(other.rootNode.children.length, 0);
});
test('产物移动、删除或标记损坏时拒绝重复创建', async () => {
  for (const kind of ['move', 'delete', 'marker']) {
    const f = figmaFixture(), p = plan(), task = { step: p.steps[0], key: 'binding:sample:card', capabilities: [] };
    await executeWorkflowStep(f.figma, f.rootNode, task);
    const made = f.rootNode.children[0];
    if (kind === 'move') { const nested = f.make('FRAME', 'Nested'); f.rootNode.appendChild(nested); nested.appendChild(made); }
    if (kind === 'delete') { f.figma.getNodeByIdAsync = async () => null; f.rootNode.children = []; }
    if (kind === 'marker') made.setSharedPluginData('localFigmaWorkflow', 'localFigmaStep', 'changed');
    await assert.rejects(executeWorkflowStep(f.figma, f.rootNode, task), /产物/);
  }
});
test('修改文案保留已有字体，补点击连线保留其他触发行为', async () => {
  const f = figmaFixture(), text = f.make('TEXT', 'Title'); f.rootNode.appendChild(text);
  text.fontName = { family: 'Roboto', style: 'Bold' };
  await executeWorkflowStep(f.figma, f.rootNode, { step: { target: { id: text.id }, operation: { kind: 'update', properties: { characters: 'New' } }, assertions: [{ property: 'characters', equals: 'New' }] }, capabilities: [] });
  assert.deepEqual(text.fontName, { family: 'Roboto', style: 'Bold' });
  const dest = f.make('FRAME', 'Dest'); f.rootNode.appendChild(dest);
  text.reactions = [{ trigger: { type: 'ON_HOVER' }, actions: [] }];
  await executeWorkflowStep(f.figma, f.rootNode, { step: { target: { id: text.id }, operation: { kind: 'connect', destination: { id: dest.id } }, assertions: [{ property: 'reactionCount', equals: 2 }] }, capabilities: ['navigation'] });
  assert.equal(text.reactions[0].trigger.type, 'ON_HOVER');
});

test('真实 CLI→桥接→插件代码贯通两个步骤，人工确认后续跑不重复建层', async t => {
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const vm = await import('node:vm');
  const cli = new URL('../bin/figma-local.mjs', import.meta.url).pathname;
  const cwd = await project(t, false); const server = await start(cwd, 0);
  t.after(async () => { await server.close(); await fs.rm(cwd, { recursive: true, force: true }); });
  const p = plan(); p.steps[0].humanReview = true;
  p.steps.push({ id: 'label', title: '添加标题', target: { path: ['Card'], type: 'FRAME' }, operation: { kind: 'create', type: 'TEXT', properties: { name: 'Label', characters: 'Hello', fontSize: 20 } }, assertions: [{ property: 'characters', equals: 'Hello' }] });
  const planPath = path.join(cwd, 'test_plan.json'); await save(planPath, p);
  const command = async (...args) => {
    try { const r = await promisify(execFile)(process.execPath, [cli, 'workflow', ...args], { cwd }); return { code: 0, value: JSON.parse(r.stdout) }; }
    catch (e) { if (!e.stdout) throw e; return { code: e.code, value: JSON.parse(e.stdout) }; }
  };
  assert.equal((await command('import', planPath)).value.state, 'ready');
  const html = await fs.readFile(path.join(root(cwd), 'plugin/ui.html'), 'utf8');
  const config = JSON.parse(html.match(/const config = (.*?);/)[1]);
  async function call(route, body) {
    const response = await fetch(`http://127.0.0.1:${server.port}${route}`, { method: body ? 'POST' : 'GET', headers: { 'X-Session-Token': config.token, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    const value = await response.json(); assert.equal(response.ok, true, JSON.stringify(value)); return value;
  }
  const f = figmaFixture(); f.rootNode.id = '1:2';
  const originalGet = f.figma.getNodeByIdAsync;
  f.figma.getNodeByIdAsync = async id => id === '1:2' ? f.rootNode : originalGet(id);
  f.page.loadAsync = async () => {}; f.page.selection = [];
  const saves = []; let undoCount = 0;
  Object.assign(f.figma, { fileKey: 'abc', mode: 'default', editorType: 'figma', showUI() {}, commitUndo() { undoCount++; }, setCurrentPageAsync: async () => {}, ui: { postMessage(message) {
    if (message.type === 'checkpoint') saves.push((async () => { const result = await call('/checkpoint', message); await f.figma.ui.onmessage({ type: 'checkpoint-ack', id: message.id, ok: result.saved }); })());
    else saves.push(call('/complete', message));
  } } });
  vm.runInNewContext(await fs.readFile(new URL('../plugin/main.js', import.meta.url), 'utf8'), { figma: f.figma, __html__: '', setTimeout, clearTimeout });
  await call('/poll?client=e2e');
  async function drive() {
    let completed = false;
    const running = command('run', 'sample').finally(() => { completed = true; });
    const deadline = Date.now() + 5000;
    while (!completed && Date.now() < deadline) {
      const job = await call('/poll?client=e2e');
      if (job) { await f.figma.ui.onmessage(job); await Promise.all(saves.splice(0)); }
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    assert.equal(completed, true, '流水线必须在测试预算内返回'); return running;
  }
  const paused = await drive(); assert.equal(paused.code, 2); assert.equal(paused.value.state, 'awaiting-review');
  assert.equal(f.rootNode.children.length, 1); assert.equal(f.rootNode.children[0].children.length, 0);
  await command('approve', 'sample', 'card', '用户检查卡片布局通过');
  const completed = await drive(); assert.equal(completed.code, 0); assert.equal(completed.value.state, 'done');
  assert.equal(f.rootNode.children.length, 1); assert.equal(f.rootNode.children[0].children[0].characters, 'Hello'); assert.equal(undoCount, 4);
  await command('run', 'sample'); assert.equal(undoCount, 4);
});

test('晚到的完整结果优先于 needs-review，无需新请求或 resolution', async t => {
  const cwd = await project(t); await importPlan(cwd, plan()); let submits = 0, waits = 0;
  const deps = { submit: async b => { submits++; return { id: b.requestId }; }, wait: async () => ++waits === 1 ? { waitStatus: 'needs-review', journalComplete: false, recovery: 'lost' } : { waitStatus: 'completed', journalComplete: true, result: { ok: true, output: { verified: true } } } };
  assert.equal((await workflowCommand(cwd, ['run', 'sample'], deps)).state, 'needs-review');
  assert.equal((await workflowCommand(cwd, ['run', 'sample'], deps)).state, 'done');
  assert.equal(submits, 1); assert.equal(waits, 2);
});
test('同时恢复同一过期锁只能有一个执行者', async t => {
  const cwd = await project(t); await importPlan(cwd, plan());
  await fs.writeFile(path.join(root(cwd), 'workflow.lock'), JSON.stringify({ pid: 2147483647 }));
  let releaseWait, entered;
  const holding = new Promise(resolve => { releaseWait = resolve; });
  const started = new Promise(resolve => { entered = resolve; });
  let submits = 0;
  const deps = { submit: async b => { submits++; return { id: b.requestId }; }, wait: async () => { entered(); await holding; return { waitStatus: 'completed', journalComplete: true, result: { ok: true, output: { verified: true } } }; } };
  const attempts = [workflowCommand(cwd, ['run', 'sample'], deps), workflowCommand(cwd, ['run', 'sample'], deps)];
  const settled = Promise.allSettled(attempts);
  await started; releaseWait();
  const result = await settled;
  assert.equal(submits, 1); assert.equal(result.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal((await workflowCommand(cwd, ['status', 'sample'])).state, 'done');
});
