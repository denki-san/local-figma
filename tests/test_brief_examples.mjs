import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { init, save } from '../src/project.mjs';
import { checkGuide } from '../src/guide.mjs';

test('两条合成示例可进入规划，仍保留真实方向选择门槛', async t => {
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'test_figma_briefs_'));
  t.after(() => fs.rm(cwd, { recursive: true, force: true }));
  await init(cwd, 'https://figma.com/design/example/Test?node-id=1-2');
  for (const mode of ['refine', 'design']) {
    const example = JSON.parse(await fs.readFile(new URL(`../examples/briefs/${mode}.json`, import.meta.url), 'utf8'));
    await save(path.join(cwd, '.figma-agent', `brief-${mode}.json`), example);
    const report = await checkGuide(cwd, mode);
    assert.equal(report.readyForPlanning, true);
    assert.equal(report.readyForExecution, false);
    assert(report.gaps.every(g => g.phase === 'execution'));
    assert.equal(example.acceptedDirection, null);
  }
});
