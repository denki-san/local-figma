import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { start } from '../src/bridge.mjs';
import { init, json } from '../src/project.mjs';

async function fixture(t, operation = 'inspect', risk, deliver = true) {
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'test_figma_completion_'));
  await init(cwd, 'https://figma.com/design/example/Test?node-id=1-2');
  const bridge = await start(cwd, 0);
  t.after(async () => { await bridge.close(); await fs.rm(cwd, { recursive: true, force: true }); });
  const dir = path.join(cwd, '.figma-agent');
  const session = await json(path.join(dir, 'session.json'));
  const ui = await fs.readFile(path.join(dir, 'plugin/ui.html'), 'utf8');
  const plugin = JSON.parse(ui.match(/const config = (.*);/)[1]);
  const call = async (route, data, role = 'plugin') => {
    const response = await fetch(`http://127.0.0.1:${bridge.port}${route}`, {
      method: data ? 'POST' : 'GET', headers: { 'X-Session-Token': role === 'plugin' ? plugin.token : session.token },
      body: data ? JSON.stringify(data) : undefined
    });
    return { status: response.status, body: await response.json() };
  };
  await call('/poll?client=test');
  const { body: job } = await call('/job', { operation, code: operation === 'run' ? 'return 1;' : '', risk }, 'cli');
  const delivered = deliver ? (await call('/poll?client=test')).body : job;
  return { call, job: delivered, dir: path.join(dir, 'runs', job.id) };
}

test('交付日志保存失败保持 queued，修复后并发领取仍只交付一次', async t => {
  const { call, job, dir } = await fixture(t, 'inspect', undefined, false);
  const journal = path.join(dir, 'job.json');
  await fs.rename(journal, path.join(dir, 'test_saved_job.json'));
  await fs.mkdir(journal);
  assert.equal((await call('/poll?client=test')).status, 400);
  assert.equal((await call('/result?id=' + job.id, null, 'cli')).body.state, 'queued');
  await fs.rmdir(journal);
  await fs.rename(path.join(dir, 'test_saved_job.json'), journal);
  const responses = await Promise.all(Array.from({ length: 10 }, () => call('/poll?client=test')));
  assert.equal(responses.filter(response => response.body?.id === job.id).length, 1);
  assert.equal((await json(journal)).state, 'running');
  assert.equal((await call('/poll?client=test')).body, null);
});

test('并发重复回传仅保存一份结果，后续回传保留原结果', async t => {
  const { call, job, dir } = await fixture(t);
  const results = await Promise.all(Array.from({ length: 10 }, (_, output) => call('/complete', { id: job.id, ok: true, output })));
  assert(results.every(r => r.status === 200));
  const persisted = await json(path.join(dir, 'result.json'));
  const journal = await json(path.join(dir, 'job.json'));
  assert.deepEqual(persisted, journal.result);
  assert.equal(journal.state, 'done');
  await call('/complete', { id: job.id, ok: false, output: '覆盖尝试' });
  assert.deepEqual(await json(path.join(dir, 'result.json')), persisted);
  assert.deepEqual((await call('/result?id=' + job.id, null, 'cli')).body, persisted);
});
test('声明高风险后拒绝未批准快照，确认绑定脚本 hash 且保留决定', async t => {
  const { call, job, dir } = await fixture(t, 'run', { level: 'high', reason: '调整共享定义' });
  const snapshot = { id: job.id, before: { id: '1:2' }, bindingVerified: { fileKey: 'example', nodeId: '1:2', pageId: '1:1' } };
  assert.equal((await call('/checkpoint', snapshot)).status, 400);
  const decision = { id: job.id, scriptHash: job.scriptHash, approved: true };
  assert.equal((await call('/approve', decision, 'cli')).status, 403);
  assert.equal((await call('/approve', { ...decision, scriptHash: '错误脚本' })).status, 400);
  assert.equal((await call('/approve', decision)).status, 200);
  assert.equal((await json(path.join(dir, 'approval.json'))).scriptHash, job.scriptHash);
  assert.equal((await call('/approve', { ...decision, approved: false })).status, 400);
  assert.equal((await call('/checkpoint', snapshot)).status, 200);
});

test('修改前快照仅接受已交付脚本与正确目标，保存后拒绝覆盖', async t => {
  const { call, job, dir } = await fixture(t, 'run');
  const checkpoint = { id: job.id, before: { id: '1:2', name: '原始标题' }, bindingVerified: { fileKey: 'example', nodeId: '1:2', pageId: '1:1' } };
  assert.equal((await call('/checkpoint', checkpoint, 'cli')).status, 403);
  assert.equal((await call('/checkpoint', { ...checkpoint, before: { id: 'wrong' } })).status, 400);
  await fs.mkdir(path.join(dir, 'before.json'));
  assert.equal((await call('/checkpoint', checkpoint)).status, 400);
  await fs.rmdir(path.join(dir, 'before.json'));
  const saved = await Promise.all([call('/checkpoint', checkpoint), call('/checkpoint', checkpoint)]);
  assert(saved.every(r => r.status === 200 && r.body.saved));
  assert.deepEqual(await json(path.join(dir, 'before.json')), checkpoint);
  assert.equal((await call('/checkpoint', { ...checkpoint, before: { ...checkpoint.before, name: '改变后' } })).status, 400);
  assert.equal((await json(path.join(dir, 'before.json'))).before.name, '原始标题');
});

test('任务日志落盘失败不释放写入门禁，重试沿用已保存结果', async t => {
  const { call, job, dir } = await fixture(t);
  const journalPath = path.join(dir, 'job.json');
  // 仅在独立测试目录注入 rename 失败，原日志仍保留。
  await fs.rename(journalPath, path.join(dir, 'test_job_backup.json'));
  await fs.mkdir(journalPath);
  const failed = await call('/complete', { id: job.id, ok: false, output: '部分失败原始证据' });
  assert.equal(failed.status, 400);
  const persisted = await json(path.join(dir, 'result.json'));
  assert.equal(persisted.output, '部分失败原始证据');
  assert.equal((await call('/status', null, 'cli')).body.active, job.id);
  assert.equal((await call('/job', { operation: 'inspect' }, 'cli')).status, 409);
  assert.equal((await fs.readdir(dir)).some(name => name.endsWith('.tmp')), false);
  await fs.rmdir(journalPath);
  await fs.rename(path.join(dir, 'test_job_backup.json'), journalPath);
  assert.equal((await call('/complete', { id: job.id, ok: true, output: '后续不同内容' })).status, 200);
  assert.equal((await call('/status', null, 'cli')).body.active, null);
  assert.equal((await json(journalPath)).state, 'failed');
  assert.deepEqual((await json(journalPath)).result, persisted);
});
