import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import { init } from '../src/project.mjs';
import { start } from '../src/bridge.mjs';

async function fixture(t) {
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'test_figma_startup_'));
  t.after(() => fs.rm(cwd, { recursive: true, force: true }));
  await init(cwd, 'https://figma.com/design/example/Test?node-id=1-2');
  return { cwd, dir: path.join(cwd, '.figma-agent') };
}
test('manifest 保存失败清除已生成的 UI 凭证，修复后可直接重试', async t => {
  const { cwd, dir } = await fixture(t);
  const manifest = path.join(dir, 'plugin/manifest.json');
  await fs.mkdir(manifest, { recursive: true });
  await assert.rejects(start(cwd, 0));
  const ui = await fs.readFile(path.join(dir, 'plugin/ui.html'), 'utf8');
  assert.match(ui, /data-runtime-inactive/);
  assert.match(ui, /role="status">连接未启动/);
  assert.match(ui, /修复后重新运行插件/);
  assert.match(ui, /var\(--figma-color-text/);
  assert(!ui.includes('X-Session-Token'));
  await assert.rejects(fs.access(path.join(dir, 'bridge.lock')));
  await assert.rejects(fs.access(path.join(dir, 'session.json')));
  await fs.rmdir(manifest);
  const bridge = await start(cwd, 0);
  await Promise.all([bridge.close(), bridge.close(), bridge.close()]);
  await bridge.close();
  const stoppedUi = await fs.readFile(path.join(dir, 'plugin/ui.html'), 'utf8');
  assert.match(stoppedUi, /role="status">连接已断开/);
  assert.match(stoppedUi, /回到 Agent 对话让它重连，再在 Figma 运行插件/);
  assert.match(stoppedUi, /var\(--figma-color-text/);
  assert(!stoppedUi.includes('X-Session-Token'));
  await assert.rejects(fs.access(path.join(dir, 'bridge.lock')));
});
test('端口被占用时保留旧文件，释放本次锁且不影响原监听者', async t => {
  const { cwd, dir } = await fixture(t);
  const listener = net.createServer(socket => socket.end());
  await new Promise(resolve => listener.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => listener.close(resolve)));
  await fs.mkdir(path.join(dir, 'plugin'));
  await fs.writeFile(path.join(dir, 'plugin/ui.html'), '原有提示页');
  await fs.writeFile(path.join(dir, 'session.json'), '原有记录');
  await assert.rejects(start(cwd, listener.address().port), { code: 'EADDRINUSE' });
  assert(listener.listening);
  assert.equal(await fs.readFile(path.join(dir, 'plugin/ui.html'), 'utf8'), '原有提示页');
  assert.equal(await fs.readFile(path.join(dir, 'session.json'), 'utf8'), '原有记录');
  await assert.rejects(fs.access(path.join(dir, 'bridge.lock')));
});
test('启动清理失败保留锁、停止监听并给出明确错误', async t => {
  const { cwd, dir } = await fixture(t);
  await fs.mkdir(path.join(dir, 'session.json'));
  await assert.rejects(start(cwd, 0), error => error instanceof AggregateError && error.message.includes('保留锁'));
  assert.equal(await fs.readFile(path.join(dir, 'bridge.lock'), 'utf8'), String(process.pid));
  assert.match(await fs.readFile(path.join(dir, 'plugin/ui.html'), 'utf8'), /role="status">连接未启动/);
  await assert.rejects(start(cwd, 0), { code: 'EEXIST' });
});
