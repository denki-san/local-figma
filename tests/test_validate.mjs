import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { save } from '../src/project.mjs';
import { validateTree, validateRun } from '../src/validate.mjs';

test('截断组合与缺失字体检查保留视觉复核边界', () => {
  const text = { id: '1:2', type: 'TEXT', name: '正文', characters: '长正文', fontName: { family: 'Example', style: 'Regular' }, fontSize: 14, lineHeight: { unit: 'AUTO' }, letterSpacing: { unit: 'PIXELS', value: 0 }, textAutoResize: 'HEIGHT', textTruncation: 'ENDING', maxLines: null, maxHeight: null };
  assert(validateTree(text).some(c => c.ruleId === 'truncation-settings'));
  assert(!validateTree({ ...text, maxLines: 3 }).some(c => c.ruleId === 'truncation-settings'));
  assert(!validateTree({ ...text, maxHeight: 120 }).some(c => c.ruleId === 'truncation-settings'));
  assert(validateTree({ ...text, maxLines: 3, textTruncation: 'DISABLED' }).some(c => c.ruleId === 'truncation-settings'));
  assert(validateTree({ ...text, maxLines: 0 }).some(c => c.ruleId === 'max-lines' && c.status === 'failed'));
  assert(validateTree({ ...text, hasMissingFont: true }).some(c => c.ruleId === 'missing-font'));
  assert(!validateTree({ ...text, visible: false, hasMissingFont: true }).some(c => c.ruleId === 'missing-font'));
});

const target = { id: '1:1', type: 'FRAME', name: '正文容器', width: 100, height: 100, clipsContent: true,
  children: [{ id: '1:2', type: 'TEXT', name: 'Text 123', x: 0, y: 90, width: 100, height: 30, rotation: 0, characters: '', fontSize: 'MIXED', fontName: 'MIXED', textAutoResize: 'NONE' }] };
test('提示混合样式、命名、空文字与裁切风险，保留缺失字段的覆盖缺口', () => {
  const checks = validateTree(target);
  for (const rule of ['mixed-typography', 'meaningful-name', 'empty-text', 'clip-bounds', 'text-fit']) assert(checks.some(c => c.ruleId === rule && c.status === 'warning'));
  assert(checks.some(c => c.ruleId === 'typography-coverage' && c.status === 'skipped'));
  assert(!checks.some(c => c.status === 'failed'));
  const hidden = structuredClone(target); hidden.visible = false;
  assert.equal(validateTree(hidden).filter(c => c.status === 'warning').length, 0);
  const rotated = structuredClone(target); rotated.children[0].rotation = 30;
  assert(validateTree(rotated).some(c => c.ruleId === 'clip-bounds' && c.status === 'skipped'));
});
test('缺失、删除、截断和重复节点不能形成完整通过结论', () => {
  assert.equal(validateTree(undefined)[0].status, 'failed');
  assert.equal(validateTree(null)[0].status, 'failed');
  assert(validateTree({ ...target, truncated: true }).some(c => c.status === 'skipped'));
  assert.throws(() => validateTree({ ...target, children: [target] }), /重复/);
});
test('离线 validate 输出独立证据状态，CLI 待评审返回 2，执行失败返回 1', async t => {
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'test_figma_validate_'));
  t.after(() => fs.rm(cwd, { recursive: true, force: true }));
  const id = '12345678-1234-1234-1234-123456789012';
  const dir = path.join(cwd, '.figma-agent/runs', id);
  await save(path.join(dir, 'job.json'), { id, operation: 'run' });
  await save(path.join(dir, 'result.json'), { id, ok: true, before: target, after: target });
  const report = await validateRun(cwd, id);
  assert.equal(report.status, 'needs-review');
  assert.equal(report.evidenceLevel.visual, 'not-run');
  assert.equal(report.evidenceLevel.scriptArtifact, 'unknown');
  const cli = fileURLToPath(new URL('../bin/figma-local.mjs', import.meta.url));
  const run = promisify(execFile);
  await assert.rejects(run(process.execPath, [cli, 'validate', id], { cwd }), e => e.code === 2 && JSON.parse(e.stdout).status === 'needs-review');
  await save(path.join(dir, 'result.json'), { id, ok: false, before: target });
  assert.equal((await validateRun(cwd, id)).status, 'failed');
  await assert.rejects(run(process.execPath, [cli, 'validate', id], { cwd }), e => e.code === 1);
  await save(path.join(dir, 'job.json'), { id, operation: 'preview' });
  await save(path.join(dir, 'result.json'), { id, ok: true, before: target });
  assert.equal((await validateRun(cwd, id)).evidenceLevel.readback, 'passed');
});
