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
test('真实 tarball 离线安装后命令、场景、插件资源与示例可用', { timeout: 60000 }, async t => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'test_figma_install_'));
  t.after(() => fs.rm(temp, { recursive: true, force: true }));
  const cache = path.join(temp, 'cache');
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const packed = await exec(npm, ['pack', '--json', '--ignore-scripts', '--offline', '--cache', cache, '--pack-destination', temp], { cwd: repository });
  const pack = JSON.parse(packed.stdout)[0];
  const files = pack.files.map(f => f.path);
  assert(files.includes('LICENSE'));
  assert(files.includes('plugin/main.js'));
  assert(files.includes('plugin/ui.html'));
  assert(files.includes('src/evidence.mjs'));
  assert(files.includes('examples/briefs/refine.json'));
  assert(files.includes('examples/briefs/design.json'));
  assert(files.includes('examples/dashboard/test_create_dashboard.js'));
  assert(files.includes('examples/dashboard/test_create_flow.js'));
  assert(files.includes('examples/dashboard/test_verify_dashboard.js'));
  assert(files.includes('examples/dashboard/test_verify_prototype.js'));
  for (const script of ['test_export_html_source.js', 'test_render_html.mjs', 'test_serve_html.mjs']) assert(files.includes('examples/dashboard/' + script));
  for (const file of ['test_capture_metric_row.js', 'test_build_metric_row.mjs', 'metric-row.json']) assert(files.includes('examples/dashboard/' + file));
  assert(files.includes('examples/dashboard/test_refine_metric.js'));
  assert(files.includes('examples/dashboard/test_verify_refinement.js'));
  assert(files.includes('examples/dashboard/README.md'));
  assert(files.includes('examples/dashboard/preview.png'));
  assert(files.includes('docs/design-review.md'));
  assert(files.includes('docs/first-task.md'));
  assert(files.every(f => !f.startsWith('.figma-agent/') && !f.startsWith('tests/') && !f.startsWith('.learnings/')));
  assert(files.every(f => !/^docs\/test[-_]/.test(f) && !f.startsWith('test_release/') && !f.endsWith('.tgz')));
  // 按实际打包清单检查公开文档，避免本地可访问、安装后缺失的链接。
  const shipped = new Set(files);
  for (const file of files.filter(file => file.endsWith('.md'))) {
    const content = await fs.readFile(path.join(repository, file), 'utf8');
    assert(!/\/Users\/[^\s/]+\//.test(content), `${file} 包含个人本机路径`);
    assert(!/\/var\/folders\/|\/private\/var\/folders\//.test(content), `${file} 包含本机临时路径`);
    for (const match of content.matchAll(/\]\(([^\s)]+)(?:\s+"[^"]*")?\)/g)) {
      const href = match[1];
      if (/^[a-z][a-z\d+.-]*:|^#|^\/\//i.test(href)) continue;
      const clean = href.split(/[?#]/)[0];
      if (!clean) continue;
      const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(file), clean));
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
  assert((await cli(['help'])).commands.includes('instance <已确认的同页主组件ID>'));
  await assert.rejects(cli(['status']), error => error.code === 1 && JSON.parse(error.stdout).error.includes('figma-local connect'));
  assert.equal((await cli(['init', 'https://figma.com/design/example/Demo?node-id=1-2'])).binding.nodeId, '1:2');
  const refineGuide = await cli(['guide', 'refine']);
  assert.equal(refineGuide.brief.mode, 'refine');
  assert.match(refineGuide.nextAction, /Agent/);
  assert.equal((await cli(['guide', 'design'])).brief.mode, 'design');
  await assert.rejects(cli(['guide-check', 'design']), error => error.code === 2 && JSON.parse(error.stdout).readyForPlanning === false);
  // 从安装包读取示例，验证用户安装后也能完成规划检查。
  for (const mode of ['refine', 'design']) {
    await fs.copyFile(path.join(installed, 'examples/briefs', `${mode}.json`), path.join(project, '.figma-agent', `brief-${mode}.json`));
    await assert.rejects(cli(['guide-check', mode]), error => {
      const report = JSON.parse(error.stdout);
      return error.code === 2 && report.readyForPlanning && !report.readyForExecution;
    });
  }
  assert.deepEqual((await cli(['history'])).runs, []);
  const { start } = await import(pathToFileURL(path.join(installed, 'src/bridge.mjs')));
  const bridge = await start(project, 0);
  try {
    const manifest = JSON.parse(await fs.readFile(bridge.manifest, 'utf8'));
    assert.equal(manifest.main, 'main.js');
    const pluginDir = path.dirname(bridge.manifest);
    assert.equal(await fs.readFile(path.join(pluginDir, 'main.js'), 'utf8'), await fs.readFile(path.join(installed, 'plugin/main.js'), 'utf8'));
    assert.equal((await cli(['status'])).connected, false);
    const ui = await fs.readFile(path.join(pluginDir, 'ui.html'), 'utf8');
    assert.equal(ui.includes('SESSION_CONFIG'), false);
  } finally { await bridge.close(); }
  const script = await fs.readFile(path.join(installed, 'examples/partial-edit/update-text.js'), 'utf8');
  const dashboard = await fs.readFile(path.join(installed, 'examples/dashboard/test_create_dashboard.js'), 'utf8');
  const preview = await fs.readFile(path.join(installed, 'examples/dashboard/preview.png'));
  assert.deepEqual([...preview.subarray(0, 8)], [137,80,78,71,13,10,26,10]);
  assert.equal(preview.readUInt32BE(16), 1440);
  assert.equal(preview.readUInt32BE(20), 1024);
  // 公开截图仅允许Figma导出器标记，不携带任意文字元数据或EXIF。
  for (let offset = 8; offset < preview.length;) {
    const size = preview.readUInt32BE(offset), type = preview.toString('ascii', offset + 4, offset + 8);
    assert(!['zTXt', 'iTXt', 'eXIf'].includes(type));
    if (type === 'tEXt') assert.equal(preview.subarray(offset + 8, offset + 8 + size).toString(), 'Software\0Figma');
    offset += size + 12;
  }
  const readme = await fs.readFile(path.join(installed, 'README.md'), 'utf8');
  assert.match(readme, /\]\(examples\/dashboard\/preview\.png\)/);
  // 验证插件函数体可解析；此检查不模拟或宣称真实画布完成。
  assert.doesNotThrow(() => new Function('figma', 'target', 'return (async()=>{' + dashboard + '\n})()'));
  assert(!/getNodeByIdAsync\(['"]|79Cror|SESSION_CONFIG|X-Session-Token/.test(dashboard));
  const verifyDashboard = await fs.readFile(path.join(installed, 'examples/dashboard/test_verify_dashboard.js'), 'utf8');
  assert.doesNotThrow(() => new Function('figma', 'target', 'return (async()=>{' + verifyDashboard + '\n})()'));
  assert(!/getNodeByIdAsync\(['"]|79Cror|SESSION_CONFIG|X-Session-Token/.test(verifyDashboard));
  const refineMetric = await fs.readFile(path.join(installed, 'examples/dashboard/test_refine_metric.js'), 'utf8');
  assert.doesNotThrow(() => new Function('figma', 'target', 'return (async()=>{' + refineMetric + '\n})()'));
  assert(!/getNodeByIdAsync\(['"]|SESSION_CONFIG|X-Session-Token/.test(refineMetric));
  const verifyRefinement = await fs.readFile(path.join(installed, 'examples/dashboard/test_verify_refinement.js'), 'utf8');
  assert.doesNotThrow(() => new Function('figma', 'target', 'return (async()=>{' + verifyRefinement + '\n})()'));
  let loaded = false;
  const target = { id: '1:2', type: 'TEXT', fontName: { family: 'Example', style: 'Regular' }, characters: '旧文案' };
  const invoke = new Function('figma', 'target', 'return (async()=>{' + script + '\n})()');
  const result = await invoke({ mixed: Symbol(), loadFontAsync: async () => { loaded = true; } }, target);
  assert(loaded);
  assert.equal(target.characters, '替换为你的新文案');
  assert.deepEqual(result.changedNodeIds, ['1:2']);
});
