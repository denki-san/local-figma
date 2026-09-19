import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { init, json } from '../src/project.mjs';
import { start } from '../src/bridge.mjs';
import { addExtension, listExtensions, configureExtension, runExtension } from '../src/extensions.mjs';

const exec = promisify(execFile);
const cli = fileURLToPath(new URL('../bin/figma-local.mjs', import.meta.url));
const secret = 'test-private-credential-123456';
async function fixture(t, entry = 'export async function execute({args}) { return {exitCode:Number(args[0] || 0),output:{mode:"扩展测试"}}; }') {
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'test_extensions_'));
  const cleanup = [];
  t.after(async () => { for (const close of cleanup) await close(); await fs.rm(cwd, { recursive: true, force: true }); });
  await init(cwd, 'https://figma.com/design/test/Test?node-id=1-2');
  const directory = path.join(cwd, 'test_extension');
  await fs.mkdir(directory);
  await fs.writeFile(path.join(directory, 'local-figma-extension.json'), JSON.stringify({ apiVersion: 1, id: 'test-addon', name: '测试扩展', entry: 'test_entry.mjs', apiKeyEnv: 'TEST_EXTENSION_API_KEY', disclosure: '测试发送当前任务摘要。' }));
  await fs.writeFile(path.join(directory, 'test_entry.mjs'), entry);
  return { cwd, directory, cleanup };
}

test('普通版无需扩展配置，扩展清单默认为空且帮助命令正常', async t => {
  const { cwd } = await fixture(t);
  assert.deepEqual(await listExtensions(cwd, { env: {} }), { extensions: [] });
  const help = await exec(process.execPath, [cli, 'help'], { cwd });
  assert(JSON.parse(help.stdout).commands.includes('text <新文字>'));
  await assert.rejects(fs.access(path.join(cwd, '.figma-agent', 'extension-credentials.json')));
});

test('安装仅读取清单；未启用或未配置密钥时不加载扩展代码', async t => {
  const { cwd, directory } = await fixture(t, 'throw Error("扩展代码已被提前加载");');
  await addExtension(cwd, directory);
  assert.equal((await listExtensions(cwd)).extensions[0].enabled, false);
  await assert.rejects(runExtension(cwd, 'test-addon', [], { env: {} }), /尚未启用/);
  await assert.rejects(configureExtension(cwd, { id: 'test-addon', enabled: true, allowRemoteContext: true }, { env: {} }), /API key/);
  await assert.rejects(configureExtension(cwd, { id: 'test-addon', enabled: true, allowRemoteContext: false, apiKey: secret }, { env: {} }), /允许发送/);
  await assert.rejects(fs.access(path.join(cwd, '.figma-agent', 'extension-credentials.json')));
});

test('密钥仅写入受限文件，列表和设置响应只返回配置状态', async t => {
  const { cwd, directory } = await fixture(t);
  await addExtension(cwd, directory);
  const result = await configureExtension(cwd, { id: 'test-addon', enabled: true, allowRemoteContext: true, apiKey: secret }, { env: {} });
  assert.equal(result.extensions[0].ready, true);
  assert.equal(JSON.stringify(result).includes(secret), false);
  const file = path.join(cwd, '.figma-agent', 'extension-credentials.json');
  assert.equal((await fs.stat(file)).mode & 0o777, 0o600);
  assert.equal((await json(file))['test-addon'].apiKey, secret);
  assert.equal((await fs.readFile(path.join(cwd, '.figma-agent', 'extensions.json'), 'utf8')).includes(secret), false);
  await configureExtension(cwd, { id: 'test-addon', enabled: false, allowRemoteContext: false, clearApiKey: true }, { env: {} });
  assert.equal((await listExtensions(cwd, { env: {} })).extensions[0].configured, false);
  assert.equal((await fs.readFile(file, 'utf8')).includes(secret), false);
});

test('环境密钥仍需显式启用，禁用后普通命令保持可用', async t => {
  const { cwd, directory } = await fixture(t);
  const env = { TEST_EXTENSION_API_KEY: secret };
  await addExtension(cwd, directory);
  const before = (await listExtensions(cwd, { env })).extensions[0];
  assert.equal(before.configured, true); assert.equal(before.ready, false);
  await configureExtension(cwd, { id: 'test-addon', enabled: true, allowRemoteContext: true }, { env });
  assert.equal((await runExtension(cwd, 'test-addon', ['0'], { env })).exitCode, 0);
  await configureExtension(cwd, { id: 'test-addon', enabled: false, allowRemoteContext: false }, { env });
  await assert.rejects(runExtension(cwd, 'test-addon', [], { env }), /尚未启用/);
  assert(JSON.parse((await exec(process.execPath, [cli, 'help'], { cwd })).stdout).commands.length);
});

test('扩展不能覆盖普通命令，入口不能通过符号链接越出安装目录', async t => {
  const { cwd, directory } = await fixture(t);
  const file = path.join(directory, 'local-figma-extension.json');
  const definition = await json(file);
  await fs.writeFile(file, JSON.stringify({ ...definition, id: 'text' }));
  await assert.rejects(addExtension(cwd, directory), /清单无效/);
  await fs.writeFile(file, JSON.stringify(definition));
  await fs.unlink(path.join(directory, definition.entry));
  const outside = path.join(cwd, 'test_outside.mjs'); await fs.writeFile(outside, 'export const test = 1;');
  await fs.symlink(outside, path.join(directory, definition.entry));
  await assert.rejects(addExtension(cwd, directory), /安装目录内/);
});

test('真实 CLI 保留扩展退出码，返回值与异常中的密钥会被隐藏', async t => {
  const { cwd, directory } = await fixture(t, 'export async function execute({args,credentials}) { if(args[0]==="throw") throw Error(credentials.apiKey); return {exitCode:Number(args[0]||0),output:{secret:credentials.apiKey,executionOk:args[0]==="0"}}; }');
  await addExtension(cwd, directory);
  await configureExtension(cwd, { id: 'test-addon', enabled: true, allowRemoteContext: true, apiKey: secret });
  const success = await exec(process.execPath, [cli, 'test-addon', '0'], { cwd });
  assert.equal(JSON.parse(success.stdout).secret, '[已隐藏]');
  for (const value of ['1', '2', 'throw']) await assert.rejects(exec(process.execPath, [cli, 'test-addon', value], { cwd }), error => {
    assert.equal(error.code, value === 'throw' ? 1 : Number(value));
    assert.equal(error.stdout.includes(secret), false); assert.equal(error.stderr.includes(secret), false);
    return true;
  });
});

test('插件设置通过当前插件连接认证；桥接状态和普通队列不受坏扩展配置影响', async t => {
  const { cwd, directory, cleanup } = await fixture(t);
  await addExtension(cwd, directory);
  const bridge = await start(cwd, 0);
  cleanup.push(() => bridge.close());
  const session = await json(path.join(cwd, '.figma-agent', 'session.json'));
  const html = await fs.readFile(path.join(path.dirname(bridge.manifest), 'ui.html'), 'utf8');
  const plugin = JSON.parse(html.match(/const config = (.*);/)[1]);
  const call = async (route, token, data) => {
    const response = await fetch(`http://127.0.0.1:${bridge.port}${route}`, { method: data ? 'POST' : 'GET', headers: { 'X-Session-Token': token }, body: data ? JSON.stringify(data) : undefined });
    return { status: response.status, body: await response.json(), session: response.headers.get('X-Figma-Session') };
  };
  const input = { client: 'current', id: 'test-addon', enabled: true, allowRemoteContext: true, apiKey: secret };
  assert.equal((await call('/extensions', session.token)).status, 403);
  assert.equal((await call('/extensions', plugin.token, input)).status, 409);
  assert.equal((await call('/poll?client=current', plugin.token)).session, session.sessionId);
  const configured = await call('/extensions', plugin.token, input);
  assert.equal(configured.status, 200); assert.equal(JSON.stringify(configured).includes(secret), false);
  assert.equal((await call('/extensions', plugin.token)).body.extensions[0].ready, true);
  await fs.writeFile(path.join(cwd, '.figma-agent', 'extensions.json'), '损坏配置');
  assert.equal((await call('/status', session.token)).body.connected, true);
  assert.equal((await call('/job', session.token, { operation: 'inspect' })).status, 202);
});

test('含引号及反斜杠的密钥在嵌套值、字段名和异常 JSON 文本中隐藏', async t => {
  const { cwd, directory } = await fixture(t, 'export async function execute({args,credentials}) { const key=credentials.apiKey; if(args[0]==="throw") throw Error(JSON.stringify({key})); return {exitCode:0,output:{nested:[{[key]:key}],json:JSON.stringify({key})}}; }');
  const escapedKey = 'test-"quoted"-\\\\secret';
  await addExtension(cwd, directory);
  await configureExtension(cwd, { id: 'test-addon', enabled: true, allowRemoteContext: true, apiKey: escapedKey });
  const result = await runExtension(cwd, 'test-addon', []);
  assert.deepEqual(result.output.nested, [{ '[已隐藏]': '[已隐藏]' }]);
  assert.equal(result.output.json, '{"key":"[已隐藏]"}');
  await assert.rejects(runExtension(cwd, 'test-addon', ['throw']), error => error.message === '{"key":"[已隐藏]"}');
});
