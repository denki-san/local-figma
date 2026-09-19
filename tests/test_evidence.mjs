import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { save } from '../src/project.mjs';
import { diffTrees, diffRun, localResult, history } from '../src/evidence.mjs';

const cli = fileURLToPath(new URL('../bin/figma-local.mjs', import.meta.url));
const run = promisify(execFile);
const id = '12345678-1234-1234-1234-123456789012';
const before = { id: '1:1', name: '容器', children: [
  { id: '1:2', name: '正文', characters: '原文', visible: true },
  { id: '1:3', name: '旧标签' }
] };
const after = { id: '1:1', name: '容器', children: [
  { id: '1:4', name: '新标签' },
  { id: '1:2', name: '完整正文', characters: '新文', visible: false }
] };
test('结构 diff 包含新增、移出、属性变化与顺序变化', () => {
  const result = diffTrees(before, after);
  assert.equal(result.changedNodeCount, 3);
  assert.deepEqual(result.changes.map(c => c.type), ['updated', 'moved', 'deleted', 'created']);
  assert.deepEqual(result.changes[0].properties.visible, { before: true, after: false });
  assert.deepEqual(result.changes[0].properties.characters, { before: '原文', after: '新文' });
  assert.equal(result.visualReview, 'not-run');
  assert.equal(diffTrees(before, before).changes.length, 0);
  assert.equal(diffTrees(before, null).changes.length, 3);
});
test('快照缺失、截断与重复节点拒绝比较', () => {
  assert.throws(() => diffTrees(before, undefined), /缺少/);
  assert.throws(() => diffTrees(before, { id: '1:1', truncated: true }), /截断/);
  assert.throws(() => diffTrees(before, { id: '1:1', children: [{ id: '1:1' }] }), /重复/);
});
test('没有会话也能读取结果和历史，失败任务保留部分修改证据', async t => {
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'test_figma_evidence_'));
  t.after(() => fs.rm(cwd, { recursive: true, force: true }));
  assert.deepEqual(await history(cwd), { runs: [] });
  const dir = path.join(cwd, '.figma-agent', 'runs', id);
  await save(path.join(dir, 'job.json'), { id, operation: 'run', state: 'running', createdAt: '2026-09-17T00:00:00Z', code: '私有脚本' });
  assert.equal((await localResult(cwd, id)).result, null);
  await assert.rejects(diffRun(cwd, id), /尚无/);
  await assert.rejects(localResult(cwd, '../session.json'), /ID 无效/);
  await save(path.join(dir, 'result.json'), { id, ok: false, before, after });
  assert.equal((await diffRun(cwd, id)).executionOk, false);
  const historyOutput = JSON.parse((await run(process.execPath, [cli, 'history'], { cwd })).stdout);
  assert.equal(historyOutput.runs[0].hasResult, true);
  assert.equal(historyOutput.runs[0].ok, false);
  assert.equal(JSON.stringify(historyOutput).includes('私有脚本'), false);
  const diffOutput = JSON.parse((await run(process.execPath, [cli, 'diff', id], { cwd })).stdout);
  assert.equal(diffOutput.changedNodeCount, 3);
  await assert.rejects(run(process.execPath, [cli, 'result', id], { cwd }), error => {
    assert.equal(error.code, 1);
    assert.equal(JSON.parse(error.stdout).result.ok, false);
    return true;
  });
  await save(path.join(dir, 'result.json'), { id, ok: true, before, after });
  assert.equal(JSON.parse((await run(process.execPath, [cli, 'result', id], { cwd })).stdout).result.ok, true);
  await save(path.join(dir, 'result.json'), { id: '错误标识', ok: true });
  await assert.rejects(localResult(cwd, id), /不匹配/);
  assert.match((await history(cwd)).runs[0].error, /不匹配/);
});
