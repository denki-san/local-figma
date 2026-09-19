import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import crypto from 'node:crypto';

const html = await fs.readFile(new URL('../plugin/ui.html', import.meta.url), 'utf8');
function fixture() {
  const calls = [], deliveries = [], responses = [];
  const state = { textContent: '' };
  const elements = new Map([['state', state]]);
  const element = id => { if (!elements.has(id)) elements.set(id, {}); return elements.get(id); };
  let tick;
  const contexts = [];
  const parent = { postMessage: message => (message.pluginMessage.type === 'context-request' ? contexts : deliveries).push(message) };
  const window = {};
  vm.runInNewContext(html.match(/<script>([\s\S]*)<\/script>/)[1].replace('SESSION_CONFIG', JSON.stringify({ port: 1234, token: 'test' })), {
    parent, window, crypto: { getRandomValues: values => crypto.getRandomValues(values) }, document: { getElementById: element },
    AbortSignal, TextEncoder, setInterval: callback => { tick = callback; },
    fetch: async (url, options) => {
      calls.push({ url, options });
      const response = responses.shift();
      if (response instanceof Error) throw response;
      return { ok: response?.ok ?? true, status: response?.status ?? 200, json: async () => response?.body ?? null };
    }
  });
  return { calls, deliveries, contexts, responses, tick: () => tick(), state, element,
    complete: (message, source = parent) => window.onmessage({ source, data: { pluginMessage: {
      channelNonce: deliveries[0]?.pluginMessage.channelNonce, ...message
    } } }) };
}
test('连接后自动请求上下文，仅接受本次握手并提交最新选择', async () => {
  const f = fixture();
  await f.tick();
  assert.equal(f.contexts.length, 1);
  const context = { fileKey: 'abc', pageId: '1:1', selection: [] };
  await f.complete({ type: 'context-update', contextNonce: 'wrong', context });
  await f.tick();
  assert.equal(f.calls.filter(c => c.url.endsWith('/context')).length, 0);
  await f.complete({ type: 'context-update', contextNonce: f.contexts[0].pluginMessage.contextNonce, context });
  await f.tick();
  assert.equal(f.calls.filter(c => c.url.endsWith('/context')).length, 1);
  assert.deepEqual(JSON.parse(f.calls.find(c => c.url.endsWith('/context')).options.body).context, context);
});
test('大结果字符串经当前任务握手校验后解析并回传', async () => {
  const f = fixture();
  f.responses.push({ body: { id: 'one', operation: 'run' } });
  await f.tick();
  const channelNonce = f.deliveries[0].pluginMessage.channelNonce;
  await f.complete({ type: 'serialized-result', id: 'one', serialized: JSON.stringify({ id: 'one', channelNonce, ok: true, output: [1, 2, 3] }) });
  await f.tick();
  const sent = JSON.parse(f.calls.find(c => c.url.endsWith('/complete')).options.body);
  assert.deepEqual(sent.output, [1, 2, 3]);
});
test('隐藏按钮发出界面消息，后续轮询仍继续', async () => {
  const f = fixture();
  f.element('hide-panel').onclick();
  assert.equal(f.deliveries[0].pluginMessage.type, 'hide-ui');
  await f.tick();
  assert.equal(f.calls.filter(c => c.url.includes('/poll?')).length, 1);
});
test('执行中持续心跳且不取第二个任务，只接受当前任务结果', async () => {
  const f = fixture();
  f.responses.push({ body: { id: 'one' } });
  await f.tick();
  for (let i = 0; i < 10; i++) await f.tick();
  assert.equal(f.deliveries.length, 1);
  assert.equal(f.calls.filter(c => c.url.includes('/poll?')).length, 1);
  assert.equal(f.calls.filter(c => c.url.includes('/heartbeat?')).length, 10);
  f.complete({ id: 'wrong', ok: true });
  await f.tick();
  assert.equal(f.calls.filter(c => c.url.endsWith('/complete')).length, 0);
  f.complete({ id: 'one', ok: true, channelNonce: 'forged' }, {});
  await f.tick();
  assert.equal(f.calls.filter(c => c.url.endsWith('/complete')).length, 0);
  f.complete({ id: 'one', ok: true }, {});
  await f.tick();
  assert.equal(f.calls.filter(c => c.url.endsWith('/complete')).length, 1);
  assert.equal(f.calls.filter(c => c.url.includes('/poll?')).length, 2);
  assert(!f.calls.find(c => c.url.endsWith('/complete')).options.body.includes('channelNonce'));
});
test('高风险请求展示脚本，点击前不确认，拒绝决定经保存后回传', async () => {
  const f = fixture();
  f.responses.push({ body: { id: 'one' } }); await f.tick();
  await f.complete({ type: 'approval-request', id: 'one', reason: '<风险>', scriptHash: 'hash', code: 'return 1;', binding: { fileKey: 'example', nodeId: '1:2' } });
  assert.equal(f.element('approval').hidden, false);
  assert(f.element('approval-details').textContent.includes('return 1;'));
  assert.equal(f.calls.filter(c => c.url.endsWith('/approve')).length, 0);
  f.responses.push({ body: { approved: false } });
  await f.element('reject').onclick();
  assert.equal(f.deliveries[1].pluginMessage.type, 'approval-ack');
  assert.equal(f.deliveries[1].pluginMessage.approved, false);
  assert.equal(f.element('approval').hidden, true);
});
test('快照保存成功才回传允许执行确认，失败明确拒绝', async () => {
  const f = fixture();
  f.responses.push({ body: { id: 'one' } });
  await f.tick();
  f.responses.push({ body: { saved: true } });
  await f.complete({ type: 'checkpoint', id: 'one', before: { id: '1:2' } });
  assert.equal(f.deliveries[1].pluginMessage.type, 'checkpoint-ack');
  assert.equal(f.deliveries[1].pluginMessage.ok, true);
  f.responses.push(Error('保存超时'));
  await f.complete({ type: 'checkpoint', id: 'one', before: { id: '1:2' } });
  assert.equal(f.deliveries[2].pluginMessage.ok, false);
  assert.equal(f.calls.filter(c => c.url.endsWith('/complete')).length, 0);
});
test('结果回传超时保留结果，下轮重试回传且不重新执行', async () => {
  const f = fixture();
  f.responses.push({ body: { id: 'one' } });
  await f.tick();
  f.complete({ id: 'one', ok: false, error: '部分失败' });
  f.responses.push({}, Error('超时'));
  await f.tick();
  assert.equal(f.state.textContent, '正在重连');
  assert.match(f.element('state-detail').textContent, /超时/);
  await f.tick();
  const sends = f.calls.filter(c => c.url.endsWith('/complete'));
  assert.equal(sends.length, 2);
  assert.equal(sends[0].options.body, sends[1].options.body);
  assert.equal(f.deliveries.length, 1);
  assert(f.calls.every(c => c.options.signal));
});
test('超大输出、PNG 和快照转为有界失败证据，保留执行状态且不重放', async () => {
  const cases = [
    { operation: 'run', message: { output: '界'.repeat(6 * 1024 * 1024), before: { id: '1:2' }, after: { id: '1:2' } } },
    { operation: 'preview', message: { png: Array(5 * 1024 * 1024).fill(255), before: { id: '1:2' } } },
    { operation: 'run', message: { before: { id: '1:2', characters: 'x'.repeat(9 * 1024 * 1024) }, after: { id: '1:2', characters: 'y'.repeat(9 * 1024 * 1024) } } }
  ];
  for (const entry of cases) {
    const f = fixture();
    f.responses.push({ body: { id: 'large', operation: entry.operation } }); await f.tick();
    await f.complete({ id: 'large', ok: true, ...entry.message });
    await f.tick();
    const sent = f.calls.find(c => c.url.endsWith('/complete')).options.body;
    const result = JSON.parse(sent);
    assert(Buffer.byteLength(sent) < 16 * 1024 * 1024);
    assert.equal(result.ok, false);
    assert.equal(result.executionStarted, entry.operation === 'run');
    assert.equal(result.png, undefined); assert.equal(result.output, undefined);
    if (entry.message.after) assert.deepEqual(result.after, entry.message.after);
    assert.equal(f.deliveries.length, 1);
    assert.equal(f.calls.filter(c => c.url.includes('/poll?')).length, 2);
  }
});

test('永久 413 不重复发送同一大结果，下一轮只保存精简失败回执', async () => {
  const f = fixture();
  f.responses.push({ body: { id: 'one', operation: 'run' } }); await f.tick();
  await f.complete({ id: 'one', ok: true, output: '正文' });
  f.responses.push({}, { ok: false, status: 413 }); await f.tick();
  await f.tick();
  const sends = f.calls.filter(c => c.url.endsWith('/complete'));
  assert.equal(sends.length, 2);
  assert.notEqual(sends[0].options.body, sends[1].options.body);
  assert.equal(JSON.parse(sends[1].options.body).ok, false);
  assert.equal(JSON.parse(sends[1].options.body).executionStarted, true);
  assert.equal(f.deliveries.length, 1);
});

test('面板四态区分正常连接、执行、断线重连与凭证处理', async () => {
  const f = fixture();
  await f.tick();
  assert.equal(f.state.textContent, '已连接');
  f.responses.push(Error('Failed to fetch'));
  await f.tick();
  assert.equal(f.state.textContent, '正在重连');
  assert.equal(f.deliveries.length, 0);
  assert.match(f.element('state-detail').textContent, /暂时无法连接本机服务/);
  assert.doesNotMatch(f.element('state-detail').textContent, /Failed to fetch/);
  f.responses.push({ ok: false, status: 401 });
  await f.tick();
  assert.equal(f.state.textContent, '需要你处理');
  assert.equal(f.deliveries.length, 0);
  f.responses.push({ body: { id: 'one', operation: 'run' } });
  await f.tick();
  assert.equal(f.state.textContent, '执行中');
  assert.equal(f.deliveries.length, 1);
});

test('任务失败保存后持续显示待处理，新任务才清除旧错误', async () => {
  const f = fixture();
  f.responses.push({ body: { id: 'one', operation: 'run' } }); await f.tick();
  await f.complete({ id: 'one', ok: false, error: '字体未找到' });
  await f.tick();
  assert.equal(f.state.textContent, '需要你处理');
  assert.match(f.element('state-detail').textContent, /字体未找到/);
  await f.tick();
  assert.equal(f.state.textContent, '需要你处理');
  assert.equal(f.deliveries.length, 1);
  f.responses.push({ body: { id: 'two', operation: 'inspect' } });
  await f.tick();
  assert.equal(f.state.textContent, '执行中');
  assert.doesNotMatch(f.element('state-detail').textContent, /字体未找到/);
});

test('高风险确认立即展示待处理，断线不自动提交决定', async () => {
  const f = fixture();
  f.responses.push({ body: { id: 'one' } }); await f.tick();
  await f.complete({ type: 'approval-request', id: 'one', reason: '测试', scriptHash: 'hash', code: 'return 1;', binding: { fileKey: 'example', nodeId: '1:2' } });
  assert.equal(f.state.textContent, '需要你处理');
  f.responses.push(Error('连接中断')); await f.tick();
  assert.equal(f.state.textContent, '正在重连');
  assert.equal(f.element('approval').hidden, false);
  assert.equal(f.calls.filter(c => c.url.endsWith('/approve')).length, 0);
  await f.tick();
  assert.equal(f.state.textContent, '需要你处理');
});

test('宿主超时文案统一中文，同时保留重连状态', async () => {
  const f = fixture();
  const error = Error('signal timed out'); error.name = 'TimeoutError';
  f.responses.push(error); await f.tick();
  assert.equal(f.state.textContent, '正在重连');
  assert.match(f.element('state-detail').textContent, /本机连接超时/);
  assert.doesNotMatch(f.element('state-detail').textContent, /signal timed out/);
});
