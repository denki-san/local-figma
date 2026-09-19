import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { init, save, json } from '../src/project.mjs';
import { recover } from '../src/recover.mjs';
import { start } from '../src/bridge.mjs';

async function fixture(t) {
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'test_figma_recover_'));
  t.after(() => fs.rm(cwd, { recursive: true, force: true }));
  await init(cwd, 'https://figma.com/design/example/Test?node-id=1-2');
  return { cwd, dir: path.join(cwd, '.figma-agent') };
}
test('旧 PID 仍存在或锁格式错误时拒绝恢复，不清理凭证', async t => {
  const { cwd, dir } = await fixture(t);
  await save(path.join(dir, 'session.json'), { token: '测试凭证' });
  for (const value of [String(process.pid), '-1', '非法']) {
    await fs.writeFile(path.join(dir, 'bridge.lock'), value);
    await assert.rejects(recover(cwd));
    assert.equal((await json(path.join(dir, 'session.json'))).token, '测试凭证');
    assert.equal(await fs.readFile(path.join(dir, 'bridge.lock'), 'utf8'), value);
    await assert.rejects(fs.access(path.join(dir, 'recovery.lock')));
  }
});
test('确认旧进程退出后保留任务证据、归档锁、清除凭证并支持重新连接', async t => {
  const { cwd, dir } = await fixture(t);
  const child = spawn(process.execPath, ['-e', 'process.exit(0)'], { stdio: 'ignore' });
  const pid = child.pid;
  await once(child, 'exit');
  await fs.writeFile(path.join(dir, 'bridge.lock'), String(pid));
  await save(path.join(dir, 'session.json'), { token: '测试凭证' });
  await fs.mkdir(path.join(dir, 'plugin'));
  await fs.writeFile(path.join(dir, 'plugin/ui.html'), '测试凭证');
  const id = '12345678-1234-1234-1234-123456789012';
  const runDir = path.join(dir, 'runs', id);
  const original = { id, state: 'running', operation: 'run', bindingId: (await json(path.join(dir, 'binding.json'))).id };
  await save(path.join(runDir, 'job.json'), original);
  await save(path.join(runDir, 'before.json'), { id, before: { id: '1:2' } });
  const output = await recover(cwd);
  assert.deepEqual(output.unfinishedRunIds, [id]);
  assert.deepEqual(await json(path.join(runDir, 'job.json')), original);
  assert.equal((await json(path.join(runDir, 'recovery.json'))).status, 'needs-document-review');
  assert.equal(await fs.readFile(path.join(output.archive, 'bridge.lock'), 'utf8'), String(pid));
  await assert.rejects(fs.access(path.join(dir, 'session.json')));
  assert.equal((await fs.readFile(path.join(dir, 'plugin/ui.html'), 'utf8')).includes('测试凭证'), false);
  await assert.rejects(fs.access(path.join(dir, 'bridge.lock')));
  const bridge = await start(cwd, 0);
  await bridge.close();
  assert.deepEqual(await json(path.join(runDir, 'job.json')), original);
});
test('真实桥接子进程异常退出后恢复，已交付任务保持待核验', { timeout: 10000 }, async t => {
  const { cwd, dir } = await fixture(t);
  const moduleUrl = new URL('../src/bridge.mjs', import.meta.url).href;
  const child = spawn(process.execPath, ['--input-type=module', '-e',
    `const {start}=await import(${JSON.stringify(moduleUrl)}); await start(${JSON.stringify(cwd)},0); process.stdout.write('ready');`
  ], { stdio: ['ignore', 'pipe', 'pipe'] });
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) {
      const exited = once(child, 'exit'); child.kill('SIGKILL'); await exited;
    }
  });
  await once(child.stdout, 'data');
  const session = await json(path.join(dir, 'session.json'));
  const ui = await fs.readFile(path.join(dir, 'plugin/ui.html'), 'utf8');
  const plugin = JSON.parse(ui.match(/const config = (.*);/)[1]);
  const base = `http://127.0.0.1:${session.port}`;
  await fetch(base + '/poll?client=test', { headers: { 'X-Session-Token': plugin.token } });
  const response = await fetch(base + '/job', { method: 'POST', headers: { 'X-Session-Token': session.token }, body: JSON.stringify({ operation: 'run', code: 'return 42;' }) });
  const job = await response.json();
  await fetch(base + '/poll?client=test', { headers: { 'X-Session-Token': plugin.token } });
  await assert.rejects(recover(cwd), /仍存在/);
  const exited = once(child, 'exit'); child.kill('SIGKILL'); await exited;
  const restored = await recover(cwd);
  assert.deepEqual(restored.unfinishedRunIds, [job.id]);
  assert.equal((await json(path.join(dir, 'runs', job.id, 'job.json'))).state, 'running');
  assert.equal((await json(path.join(dir, 'runs', job.id, 'recovery.json'))).status, 'needs-document-review');
  assert.equal(await fs.readFile(path.join(dir, 'runs', job.id, 'script.js'), 'utf8'), 'return 42;');
});
