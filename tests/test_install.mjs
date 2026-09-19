import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath, pathToFileURL } from 'node:url';

const exec = promisify(execFile);
const repository = fileURLToPath(new URL('../', import.meta.url));

test('实际安装包只含运行资源，离线安装后 CLI 与插件可用', { timeout: 60000 }, async t => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'test_figma_install_'));
  t.after(() => fs.rm(temp, { recursive: true, force: true }));
  const cache = path.join(temp, 'cache');
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const packed = await exec(npm, ['pack', '--json', '--ignore-scripts', '--offline', '--cache', cache, '--pack-destination', temp], { cwd: repository });
  const pack = JSON.parse(packed.stdout)[0];
  const files = pack.files.map(file => file.path);
  for (const file of ['LICENSE', 'README.md', 'SECURITY.md', 'CONTRIBUTING.md', 'plugin/main.js', 'plugin/ui.html', 'src/evidence.mjs', 'assets/preview.png', 'assets/usage-flow.png', 'docs/quickstart.md', 'docs/first-task.md', 'docs/agent-quickstart.md']) {
    assert(files.includes(file), `安装包缺少 ${file}`);
  }
  assert(files.every(file => !/^(examples|macos|tests|\.figma-agent|\.learnings)\//.test(file)));
  assert(files.every(file => !/^docs\/test[-_]/.test(file) && !file.endsWith('.tgz')));

  const shipped = new Set(files);
  for (const file of files.filter(file => file.endsWith('.md'))) {
    const content = await fs.readFile(path.join(repository, file), 'utf8');
    assert(!/\/Users\/[^\s/]+\//.test(content), `${file} 包含个人本机路径`);
    assert(!/\/(?:private\/)?var\/folders\//.test(content), `${file} 包含本机临时路径`);
    for (const match of content.matchAll(/\]\(([^\s)]+)(?:\s+"[^"]*")?\)/g)) {
      const href = match[1];
      if (/^[a-z][a-z\d+.-]*:|^#|^\/\//i.test(href)) continue;
      const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(file), href.split(/[?#]/)[0]));
      assert(shipped.has(resolved) || files.some(candidate => candidate.startsWith(resolved.replace(/\/$/, '') + '/')), `${file} 的链接未随包分发：${href}`);
    }
  }

  const prefix = path.join(temp, 'installed');
  await exec(npm, ['install', '--global', '--prefix', prefix, '--offline', '--ignore-scripts', '--no-audit', '--no-fund', '--cache', cache, path.join(temp, pack.filename)]);
  const installed = process.platform === 'win32' ? path.join(prefix, 'node_modules', pack.name) : path.join(prefix, 'lib/node_modules', pack.name);
  const bin = process.platform === 'win32' ? path.join(prefix, 'figma-local.cmd') : path.join(prefix, 'bin/figma-local');
  const project = path.join(temp, 'project');
  await fs.mkdir(project);
  const cli = async args => JSON.parse((await exec(bin, args, { cwd: project })).stdout);
  assert((await cli(['help'])).commands.includes('diff <job-id>'));
  await assert.rejects(cli(['status']), error => error.code === 1 && JSON.parse(error.stdout).error.includes('figma-local connect'));
  assert.equal((await cli(['init', 'https://figma.com/design/example/Demo?node-id=1-2'])).binding.nodeId, '1:2');
  assert.equal((await cli(['guide', 'refine'])).brief.mode, 'refine');
  assert.equal((await cli(['guide', 'design'])).brief.mode, 'design');
  assert.deepEqual((await cli(['history'])).runs, []);

  const { start } = await import(pathToFileURL(path.join(installed, 'src/bridge.mjs')));
  const bridge = await start(project, 0);
  try {
    const manifest = JSON.parse(await fs.readFile(bridge.manifest, 'utf8'));
    assert.equal(manifest.main, 'main.js');
    assert.equal(await fs.readFile(path.join(path.dirname(bridge.manifest), 'main.js'), 'utf8'), await fs.readFile(path.join(installed, 'plugin/main.js'), 'utf8'));
    assert.equal((await cli(['status'])).connected, false);
  } finally {
    await bridge.close();
  }
  const preview = await fs.readFile(path.join(installed, 'assets/preview.png'));
  assert.deepEqual([...preview.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  const usageFlow = await fs.readFile(path.join(installed, 'assets/usage-flow.png'));
  assert.deepEqual([...usageFlow.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
});
