import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { save } from '../src/project.mjs';
import { waitForResult } from '../src/wait.mjs';
import { parseArguments } from '../src/arguments.mjs';
import { localResult } from '../src/evidence.mjs';

const id = '12345678-1234-1234-1234-123456789012';
const cli = fileURLToPath(new URL('../bin/figma-local.mjs', import.meta.url));
const exec = promisify(execFile);
async function fixture(t) {
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'test_figma_wait_'));
  t.after(() => fs.rm(cwd, { recursive: true, force: true }));
  const dir = path.join(cwd, '.figma-agent/runs', id);
  const job = { id, operation: 'inspect', state: 'running' };
  await save(path.join(dir, 'job.json'), job);
  return { cwd, dir, job };
}

test('wait 等待结果和终态日志均完成，保持只读且无需会话凭证', async t => {
  const { cwd, dir, job } = await fixture(t);
  const result = { id, ok: true, output: 42 };
  await save(path.join(dir, 'result.json'), result);
  let finished = false;
  const pending = waitForResult(cwd, id, 2).then(r => { finished = true; return r; });
  await delay(100);
  assert.equal(finished, false);
  await save(path.join(dir, 'job.json'), { ...job, state: 'done', result: { ...result, output: '不一致' } });
  assert.equal((await localResult(cwd, id)).journalComplete, false);
  await save(path.join(dir, 'job.json'), { ...job, state: 'done', result });
  const record = await pending;
  assert.equal(record.waitStatus, 'completed');
  assert.equal(record.result.output, 42);
  assert.deepEqual((await fs.readdir(dir)).sort(), ['job.json', 'result.json']);
});

test('wait 超时保留 running 和未知结果，CLI 返回 2 且不重放', async t => {
  const { cwd, dir } = await fixture(t);
  const baseline = await fs.readFile(path.join(dir, 'job.json'), 'utf8');
  await assert.rejects(exec(process.execPath, [cli, 'wait', id, '--timeout', '1'], { cwd }), error => {
    assert.equal(error.code, 2);
    const record = JSON.parse(error.stdout);
    assert.equal(record.waitStatus, 'timeout');
    assert.equal(record.recordedState, 'running');
    assert.equal(record.result, null);
    return true;
  });
  assert.equal(await fs.readFile(path.join(dir, 'job.json'), 'utf8'), baseline);
  assert.deepEqual(await fs.readdir(dir), ['job.json']);
});

test('wait 完成失败返回 1，已有恢复提示立即返回待核验', async t => {
  const { cwd, dir, job } = await fixture(t);
  await save(path.join(dir, 'recovery.json'), { status: 'unknown-after-disconnect' });
  assert.equal((await waitForResult(cwd, id, 1)).waitStatus, 'needs-review');
  const result = { id, ok: false, error: '合成失败' };
  await save(path.join(dir, 'result.json'), result);
  await save(path.join(dir, 'job.json'), { ...job, state: 'failed', result });
  await assert.rejects(exec(process.execPath, [cli, 'wait', id], { cwd }), error => {
    assert.equal(error.code, 1);
    assert.equal(JSON.parse(error.stdout).waitStatus, 'completed');
    return true;
  });
});

test('wait 超时参数与任务 ID 严格校验，缺失证据保持错误', async t => {
  const { cwd } = await fixture(t);
  assert.equal(parseArguments(['wait', id, '--timeout', '30']).timeoutSeconds, 30);
  for (const value of ['0', '-1', '301', '1.5', 'x']) assert.throws(() => parseArguments(['wait', id, '--timeout', value]));
  assert.throws(() => parseArguments(['status', '--timeout', '1']));
  assert.throws(() => parseArguments(['wait', id, '--timeout', '1', '--timeout', '2']));
  await assert.rejects(waitForResult(cwd, '../session.json', 1), /ID 无效/);
  await assert.rejects(waitForResult(cwd, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 1), { code: 'ENOENT' });
  const dir = path.join(cwd, '.figma-agent/runs', id);
  await save(path.join(dir, 'result.json'), { id, ok: 'true' });
  await assert.rejects(waitForResult(cwd, id, 1), /结果状态无效/);
});
