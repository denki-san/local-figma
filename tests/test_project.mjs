import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { parseTarget, init, brief, json } from '../src/project.mjs';

test('只接受带 node-id 的真实 Figma HTTPS 主机链接', () => {
  assert.equal(parseTarget('https://www.figma.com/design/abc/Test?node-id=12-34').nodeId, '12:34');
  for (const url of ['https://figma.com.evil/design/abc?node-id=1-2', 'http://figma.com/design/abc?node-id=1-2', 'https://figma.com/design/abc', 'https://user@figma.com/design/abc?node-id=1-2']) assert.throws(() => parseTarget(url));
});
test('初始化保留 gitignore，重复初始化不覆盖绑定，两条工作流独立', async t => {
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'test_figma_project_'));
  t.after(() => fs.rm(cwd, { recursive: true, force: true }));
  await fs.writeFile(path.join(cwd, '.gitignore'), 'node_modules/');
  await init(cwd, 'https://figma.com/design/abc/Test?node-id=1-2');
  await assert.rejects(init(cwd, 'https://figma.com/design/other/Test?node-id=3-4'), /已保留原绑定/);
  assert.equal((await json(path.join(cwd, '.figma-agent/binding.json'))).fileKey, 'abc');
  assert.equal(await fs.readFile(path.join(cwd, '.gitignore'), 'utf8'), 'node_modules/\n.figma-agent/\n');
  const design = await brief(cwd, 'design');
  assert(design.brief.steps.some(x => x.includes('参考图')));
  await assert.rejects(brief(cwd, 'design'), /guide-check design/);
  assert.deepEqual(await json(design.file), design.brief);
  assert.equal((await brief(cwd, 'refine')).brief.mode, 'refine');
});

test('尚未初始化时给出明确的需求资料生成指引', async t => {
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'test_figma_guide_start_'));
  t.after(() => fs.rm(cwd, { recursive: true, force: true }));
  await assert.rejects(brief(cwd, 'refine'), /figma-local init/);
});
