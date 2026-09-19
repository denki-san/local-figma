import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { prepareManager, startManager } from '../src/session-manager.mjs';

test('一次准备复用固定插件位置，重复连接保留配对与绑定', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'test_manager_'));
  let server;
  t.after(async () => { await server?.close(); await fs.rm(directory, { recursive: true, force: true }); });
  const url = 'https://figma.com/design/abc/Test?node-id=1-2';
  const first = await prepareManager(url, { directory });
  assert.equal(first.reused, false);
  server = await startManager({ directory, port: 0 });
  const manifest = await fs.readFile(first.manifest, 'utf8');
  const pairFile = path.join(directory, '.figma-agent/pairing.json');
  const pair = await fs.readFile(pairFile, 'utf8');
  const second = await prepareManager(url, { directory });
  assert.equal(second.reused, true);
  assert.equal(second.manifest, first.manifest);
  assert.equal(await fs.readFile(first.manifest, 'utf8'), manifest);
  assert.equal(await fs.readFile(pairFile, 'utf8'), pair);
  await assert.rejects(prepareManager('https://figma.com/design/other/Test?node-id=1-2', { directory }), /原连接已保留/);
  assert.equal(await fs.readFile(pairFile, 'utf8'), pair);
});

test('未设置目标或错误链接不会启动会话', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'test_manager_empty_'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  await assert.rejects(startManager({ directory, port: 0 }), /首次连接/);
  await assert.rejects(prepareManager('https://example.com/design/abc?node-id=1-2', { directory }));
  assert.deepEqual(await fs.readdir(directory), []);
});
