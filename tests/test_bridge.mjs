import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { init, json } from '../src/project.mjs';
import { start } from '../src/bridge.mjs';
import { setTimeout as delay } from 'node:timers/promises';

test('实例子节点标识经 HTTP 队列原样交付，畸形标识拒绝入队', async t => {
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'test_figma_instance_id_'));
  await init(cwd, 'https://figma.com/design/abc/Test?node-id=1-2');
  const server = await start(cwd, 0);
  t.after(async () => { await server.close(); await fs.rm(cwd, { recursive: true, force: true }); });
  const dir = path.join(cwd, '.figma-agent');
  const session = await json(path.join(dir, 'session.json'));
  const html = await fs.readFile(path.join(dir, 'plugin/ui.html'), 'utf8');
  const plugin = JSON.parse(html.match(/const config = (.*);/)[1]);
  const call = async (route, token, data) => {
    const response = await fetch(`http://127.0.0.1:${server.port}${route}`, { method: data ? 'POST' : 'GET', headers: { 'X-Session-Token': token, 'Content-Type': 'application/json' }, body: data ? JSON.stringify(data) : undefined });
    return { status: response.status, body: await response.json() };
  };
  await call('/poll?client=test', plugin.token);
  for (const targetNodeId of ['I1:2','I1:2;../3:4','1:2;3:4']) {
    assert.equal((await call('/job',session.token,{operation:'inspect',targetNodeId})).status,400);
  }
  const targetNodeId='I153:9884;150:7584';
  const submitted=await call('/job',session.token,{operation:'inspect',targetNodeId});
  assert.equal(submitted.status,202);
  const delivered=await call('/poll?client=test',plugin.token);
  assert.equal(delivered.body.targetNodeId,targetNodeId);
  assert.equal(delivered.body.id,submitted.body.id);
  assert.equal((await call('/complete',plugin.token,{id:submitted.body.id,ok:true,output:{id:targetNodeId}})).status,200);
});

test('插件重开可接续空闲桥接，执行中的任务不会交给新插件', async t => {
  let clock = 0;
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'test_figma_reconnect_'));
  await init(cwd, 'https://figma.com/design/abc/Test?node-id=1-2');
  const server = await start(cwd, 0, { now: () => clock });
  t.after(async () => { await server.close(); await fs.rm(cwd, { recursive: true, force: true }); });
  const dir = path.join(cwd, '.figma-agent');
  const session = await json(path.join(dir, 'session.json'));
  const html = await fs.readFile(path.join(dir, 'plugin/ui.html'), 'utf8');
  const plugin = JSON.parse(html.match(/const config = (.*);/)[1]);
  const call = async (route, token = plugin.token, data) => {
    const response = await fetch(`http://127.0.0.1:${server.port}${route}`, { method: data ? 'POST' : 'GET', headers: { 'X-Session-Token': token, 'Content-Type': 'application/json' }, body: data ? JSON.stringify(data) : undefined });
    return { status: response.status, body: await response.json() };
  };
  await call('/poll?client=old');
  const context = { fileKey: 'abc', pageId: '1:1', selection: [{ id: '1:2' }], target: { id: '1:2' } };
  assert.equal((await call('/context', session.token, { client: 'old', context })).status, 403);
  assert.equal((await call('/context', plugin.token, { client: 'old', context: { ...context, fileKey: 'other' } })).status, 400);
  assert.equal((await call('/context', plugin.token, { client: 'old', context })).status, 200);
  assert.equal((await call('/context', session.token)).body.stale, false);
  assert.equal((await call('/context', plugin.token, {client:'old', context:{...context,revision:4}})).status,200);
  for(const revision of [3,4,undefined]){
    const response=await call('/context',plugin.token,{client:'old',context:{...context,revision,selection:[]}});
    assert.equal(response.body.ignored,'stale-context');
    assert.equal((await call('/context',session.token)).body.context.selection.length,1);
  }
  for(const revision of [-1,1.5,'5'])assert.equal((await call('/context',plugin.token,{client:'old',context:{...context,revision}})).status,400);
  assert.equal((await call('/context',plugin.token,{client:'old',context:{...context,revision:5,selection:[]}})).status,200);
  assert.equal((await call('/context',session.token)).body.context.selection.length,0);
  assert.equal((await call('/poll?client=new')).status, 409);
  clock = 15000;
  assert.equal((await call('/poll?client=new')).status, 200);
  assert.equal((await call('/context', session.token)).body.stale, true);
  assert.equal((await call('/context', plugin.token, { client: 'old', context })).status, 409);
  assert.equal((await call('/context', plugin.token, { client: 'new', context:{...context,revision:0} })).status, 200);
  assert.equal((await call('/context',session.token)).body.context.revision,0);
  assert.equal((await call('/context', session.token)).body.stale, false);
  assert.equal((await call('/poll?client=old')).body.code, 'RETIRED_CLIENT');
  const job = (await call('/job', session.token, { operation: 'run', code: 'return 1;' })).body;
  assert.equal((await call('/poll?client=new')).body.id, job.id);
  clock = 90000;
  assert.equal((await call('/poll?client=third')).body.code, 'OPERATION_UNCERTAIN');
  assert.equal((await call('/poll?client=new')).body, null);
  assert.equal((await call('/complete', plugin.token, { id: job.id, ok: true, output: 1 })).status, 200);
  clock = 110000;
  assert.equal((await call('/poll?client=third')).status, 200);
  assert.equal((await call('/result?id=' + job.id, session.token)).body.output, 1);
});

test('桥接认证、断连拒绝、一次交付、证据和退出清理', async t => {
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'test_figma_bridge_'));
  await init(cwd, 'https://figma.com/design/abc/Test?node-id=1-2');
  const server = await start(cwd, 0);
  t.after(async () => { await server.close(); await fs.rm(cwd, { recursive: true, force: true }); });
  const dir = path.join(cwd, '.figma-agent');
  const session = await json(path.join(dir, 'session.json'));
  const html = await fs.readFile(path.join(dir, 'plugin/ui.html'), 'utf8');
  const plugin = JSON.parse(html.match(/const config = (.*);/)[1]);
  const call = async (route, token, data) => {
    const response = await fetch(`http://127.0.0.1:${server.port}${route}`, { method: data ? 'POST' : 'GET', headers: { 'X-Session-Token': token, 'Content-Type': 'application/json' }, body: data ? JSON.stringify(data) : undefined });
    return { status: response.status, body: await response.json() };
  };
  assert.equal((await call('/status', 'bad')).status, 403);
  assert.equal((await call('/job', session.token, { operation: 'inspect' })).status, 409);
  await call('/poll?client=test', plugin.token);
  assert.equal((await call('/job', session.token, { operation: 'inspect', targetNodeId: '../other' })).status, 400);
  assert.equal((await call('/job', session.token, { operation: 'inspect', targetNodeId: {} })).status, 400);
  const job = (await call('/job', session.token, { operation: 'run', code: 'return 42;' })).body;
  assert.equal((await call('/heartbeat?client=test', session.token)).status, 403);
  assert.equal((await call('/heartbeat?client=other', plugin.token)).status, 409);
  assert.equal((await call('/heartbeat?client=test', plugin.token)).body.active, job.id);
  assert.equal((await call('/result?id=' + job.id, session.token)).body.state, 'queued');
  assert.equal((await call('/poll?client=other', plugin.token)).status, 409);
  assert.equal((await call('/poll?client=test', plugin.token)).body.id, job.id);
  // 超过旧版五秒断连阈值，持续心跳应保持连接且任务仍只交付一次。
  for (let i = 0; i < 5; i++) {
    await delay(1100);
    await call('/heartbeat?client=test', plugin.token);
  }
  assert.equal((await call('/status', session.token)).body.connected, true);
  assert.equal((await call('/result?id=' + job.id, session.token)).body.state, 'running');
  assert.equal((await call('/poll?client=test', plugin.token)).body, null);
  assert.equal((await call('/heartbeat?client=test', plugin.token)).status, 200);
  assert.equal((await call('/status', session.token)).body.connected, true);
  assert.equal((await call('/job', session.token, { operation: 'inspect' })).status, 409);
  await call('/complete', plugin.token, { id: job.id, ok: true, output: 42 });
  assert.equal((await call('/result?id=' + job.id, session.token)).body.output, 42);
  assert.equal(await fs.readFile(path.join(dir, 'runs', job.id, 'script.js'), 'utf8'), 'return 42;');
  assert.equal((await json(path.join(dir, 'runs', job.id, 'result.json'))).ok, true);
  assert.equal((await json(server.manifest)).enablePrivatePluginApi, true);
});

test('隐藏时持续约 60 秒间隔仍为后台连接，状态读取只读且可恢复', async t => {
  let clock = 0;
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'test_figma_hidden_lease_'));
  await init(cwd, 'https://figma.com/design/abc/Test?node-id=1-2');
  const server = await start(cwd, 0, { now: () => clock });
  t.after(async () => { await server.close(); await fs.rm(cwd, { recursive: true, force: true }); });
  const dir = path.join(cwd, '.figma-agent');
  const session = await json(path.join(dir, 'session.json'));
  const html = await fs.readFile(path.join(dir, 'plugin/ui.html'), 'utf8');
  const plugin = JSON.parse(html.match(/const config = (.*);/)[1]);
  const call = async (route, token = plugin.token) => {
    const response = await fetch(`http://127.0.0.1:${server.port}${route}`, { headers: { 'X-Session-Token': token } });
    return { status: response.status, body: await response.json() };
  };
  const status = async () => (await call('/status', session.token)).body;

  await call('/poll?client=plugin&visibility=visible');
  assert.equal((await status()).connectionState, 'ACTIVE');
  clock = 1000;
  await call('/heartbeat?client=plugin&visibility=hidden');
  clock = 61000;
  let state = await status();
  assert.equal(state.connected, true);
  assert.equal(state.connectionState, 'BACKGROUND');
  assert.equal(state.pollAgeMs, 60000);
  await call('/poll?client=plugin&visibility=hidden');
  clock = 121000;
  state = await status();
  assert.equal(state.connected, true);
  assert.equal(state.connectionState, 'BACKGROUND');
  assert.equal(state.pollAgeMs, 60000);
  assert.equal((await call('/heartbeat?client=plugin&visibility=visible', 'invalid')).status, 403);
  assert.equal((await status()).pollAgeMs, 60000);
  assert.equal((await call('/heartbeat?client=plugin&visibility=visible')).status, 200);
  assert.equal((await status()).connectionState, 'ACTIVE');
  await call('/heartbeat?client=plugin&visibility=hidden');
  clock += 90000;
  state = await status();
  assert.equal(state.connected, false);
  assert.equal(state.connectionState, 'STALE');
  assert.equal((await call('/poll?client=plugin&visibility=visible')).status, 200);
  state = await status();
  assert.equal(state.connected, true);
  assert.equal(state.connectionState, 'ACTIVE');
});
