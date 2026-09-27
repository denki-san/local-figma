import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { start } from '../src/bridge.mjs';
import { contract } from './helpers/test_schema.mjs';

const exec = promisify(execFile);
const cliFile = fileURLToPath(new URL('../bin/figma-local.mjs', import.meta.url));
test('真实 CLI、HTTP、插件 UI 与执行器贯通；文档 API 使用明确模拟', { timeout: 20000 }, async t => {
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'test_figma_e2e_'));
  let bridge, closed = false;
  t.after(async () => { if (bridge && !closed) await bridge.close(); await fs.rm(cwd, { recursive: true, force: true }); });
  const cli = async (...args) => JSON.parse((await exec(process.execPath, [cliFile, ...args], { cwd })).stdout);
  await cli('init', 'https://figma.com/design/example/Test?node-id=1-1');
  bridge = await start(cwd, 0);
  const pluginDir = path.dirname(bridge.manifest);
  const html = await fs.readFile(path.join(pluginDir, 'ui.html'), 'utf8');
  const main = await fs.readFile(path.join(pluginDir, 'main.js'), 'utf8');
  const state = { textContent: '' }, pending = new Set(), backgroundErrors = [];
  const elements = new Map([['state', state]]);
  const element = id => { if (!elements.has(id)) elements.set(id, {}); return elements.get(id); };
  let tick, activeJobId, characters = '原文', mutationCount = 0;
  const track = promise => {
    const work = Promise.resolve(promise).catch(error => backgroundErrors.push(error)).finally(() => pending.delete(work));
    pending.add(work);
  };
  const page = { id: '1:1', type: 'PAGE', loadAsync: async () => {} };
  const target = { id: '1:2', type: 'TEXT', name: '正文', parent: page, width: 100, height: 20,
    fontSize: 14, fontName: { family: 'Example', style: 'Regular' }, textStyleId: 'style-a',
    get characters() { return characters; },
    set characters(value) {
      // 在真实修改动作发生的瞬间检查磁盘，证明快照确认先于写入。
      const checkpoint = JSON.parse(readFileSync(path.join(cwd, '.figma-agent/runs', activeJobId, 'before.json'), 'utf8'));
      assert.equal(checkpoint.before.characters, characters);
      mutationCount++; characters = value;
    },
    exportAsync: async () => new Uint8Array([137, 80, 78, 71])
  };
  const window = {};
  let panelShows = 0;
  const events = new Map();
  const parent = { postMessage: message => track(figma.ui.onmessage(structuredClone(message.pluginMessage))) };
  const figma = { fileKey: 'example', mode: 'default', editorType: 'figma', showUI() {}, commitUndo() {},
    on(name, callback) { events.set(name, callback); },
    ui: { show() { panelShows++; }, postMessage: message => track(window.onmessage({ source: null, data: { pluginMessage: structuredClone(message) } })) },
    getNodeByIdAsync: async id => id === target.id ? target : id === page.id ? page : null, setCurrentPageAsync: async () => {},
    getStyleByIdAsync: async id => ({ id, name: '正文样式', type: 'TEXT' })
  };
  vm.runInNewContext(main, { figma, __html__: html, setTimeout, clearTimeout });
  vm.runInNewContext(html.match(/<script>([\s\S]*)<\/script>/)[1], {
    window, parent, crypto, fetch, AbortSignal, TextEncoder, document: { visibilityState: 'visible', addEventListener: () => {}, getElementById: element },
    setInterval: callback => { tick = callback; }
  });
  await tick();
  assert.equal((await cli('doctor')).ready, true);
  async function finish(job, approve = false) {
    activeJobId = job.id;
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      await tick();
      if (approve && element('approval').hidden === false) await element('approve').onclick();
      if (backgroundErrors.length) throw backgroundErrors[0];
      try {
        const journal = JSON.parse(await fs.readFile(path.join(cwd, '.figma-agent/runs', job.id, 'job.json'), 'utf8'));
        if (['done', 'failed'].includes(journal.state)) {
          contract('job', journal);
          contract('result', journal.result);
          return journal;
        }
      } catch (error) { if (error.code !== 'ENOENT') throw error; }
      await delay(10);
    }
    throw Error(`任务未在测试时限内完成：${state.textContent}`);
  }
  await fs.writeFile(path.join(cwd, 'test_update.js'), 'target.characters="新文案"; return target.id;');
  const written = await cli('run', 'test_update.js', '--node', '1:2');
  await finish(written);
  const result = await cli('result', written.id);
  assert.equal(result.result.ok, true);
  assert.equal(result.journalComplete, true);
  assert(result.checkpointFile);
  assert.equal(mutationCount, 1);
  const difference = await cli('diff', written.id);
  contract('diff', difference);
  assert.equal(difference.changes[0].properties.characters.after, '新文案');
  await assert.rejects(cli('validate', written.id), error => {
    const report = JSON.parse(error.stdout);
    contract('validation', report);
    return error.code === 2 && report.evidenceLevel.visual === 'not-run';
  });
  const resources = await cli('design-system', '--node', '1:2');
  await finish(resources);
  assert.equal((await cli('result', resources.id)).result.output.styles[0].name, '正文样式');
  const preview = await cli('preview', '--node', '1:2');
  await finish(preview);
  assert.equal((await cli('result', preview.id)).result.preview, 'preview.png');
  assert.equal((await fs.stat(path.join(cwd, '.figma-agent/runs', preview.id, 'preview.png'))).size, 4);
  // 上面的导出仅验证二进制传输；四字节模拟数据不构成截图或视觉验证。
  await fs.writeFile(path.join(cwd, 'test_partial.js'), 'target.characters="部分修改"; throw Error("模拟失败");');
  const failed = await cli('run', 'test_partial.js', '--node', '1:2');
  await finish(failed);
  await assert.rejects(cli('result', failed.id), error => error.code === 1 && JSON.parse(error.stdout).result.after.characters === '部分修改');
  assert.equal((await cli('diff', failed.id)).executionOk, false);
  assert.equal(mutationCount, 2);
  await fs.writeFile(path.join(cwd, 'test_declared_risk.js'), 'return 7;');
  const risky = await cli('run', 'test_declared_risk.js', '--high-risk', '合成测试确认流程', '--node', '1:2');
  await finish(risky, true);
  assert.equal(panelShows, 1);
  assert.equal((await cli('result', risky.id)).result.output, 7);
  const approval = JSON.parse(await fs.readFile(path.join(cwd, '.figma-agent/runs', risky.id, 'approval.json'), 'utf8'));
  assert.equal(approval.approved, true);
  await fs.writeFile(path.join(cwd, 'test_large_result.js'), 'target.characters="超大结果后的文案"; return "x".repeat(17 * 1024 * 1024);');
  const oversized = await cli('run', 'test_large_result.js', '--node', '1:2');
  const oversizedJournal = await finish(oversized);
  assert.equal(oversizedJournal.state, 'failed');
  assert.equal(oversizedJournal.result.executionStarted, true);
  assert.equal(oversizedJournal.result.before.characters, '部分修改');
  assert.equal(oversizedJournal.result.after.characters, '超大结果后的文案');
  assert.equal(oversizedJournal.result.output, undefined);
  assert.equal(mutationCount, 3);
  await assert.rejects(cli('result', oversized.id), error => error.code === 1 && JSON.parse(error.stdout).result.ok === false);
  // 真实 CLI 的布局入口沿用当前选择；文档布局行为在此明确模拟。
  Object.assign(target, { type: 'FRAME', layoutMode: 'VERTICAL', layoutSizingHorizontal: 'FIXED', layoutSizingVertical: 'FIXED',
    resize(width, height) { this.width = width; this.height = height; } });
  page.selection = [target]; figma.currentPage = page;
  events.get('selectionchange')();
  await tick(); await Promise.all([...pending]); await tick();
  assert.equal((await cli('context')).context.selection[0].type, 'FRAME');
  const layout = await cli('layout', '--width', '360', '--height', '240', '--gap', '16', '--padding', '24');
  await finish(layout);
  const layoutResult = (await cli('result', layout.id)).result;
  assert.equal(layoutResult.output.operation, 'layout');
  assert.equal(layoutResult.after.width, 360);
  assert.equal(layoutResult.after.height, 240);
  assert.equal(layoutResult.after.itemSpacing, 16);
  assert.equal(layoutResult.after.paddingLeft, 24);
  // 文字锁定保护通过真实命令及传输执行；Figma 锁定属性仍使用模拟文档。
  target.type = 'TEXT';
  target.locked = true;
  figma.loadFontAsync = async () => {};
  events.get('selectionchange')();
  await tick(); await Promise.all([...pending]); await tick();
  const lockedText = await cli('text', '禁止覆盖锁定文字');
  const lockedJournal = await finish(lockedText);
  assert.equal(lockedJournal.state, 'failed');
  assert.match(lockedJournal.result.error, /已锁定/);
  assert.equal(lockedJournal.result.after.characters, '超大结果后的文案');
  assert.equal(mutationCount, 3);
  target.locked = false;
  const unlockedText = await cli('text', '解锁后的高层修改');
  await finish(unlockedText);
  assert.equal((await cli('result', unlockedText.id)).result.output.characters, '解锁后的高层修改');
  assert.equal(mutationCount, 4);
  target.fills = [{ type: 'SOLID', color: { r: 0, g: 0, b: 0 }, opacity: 0.5 }];
  const colored = await cli('fill', '#3366FF');
  await finish(colored);
  const coloredResult = (await cli('result', colored.id)).result;
  assert.equal(coloredResult.ok, true);
  assert.equal(coloredResult.output.operation, 'fill');
  assert.deepEqual(coloredResult.after.fills[0].color, { r: 0.2, g: 0.4, b: 1 });
  assert.equal(coloredResult.after.fills[0].opacity, 0.5);
  target.textStyleId = '';
  target.boundVariables = {};
  const fontChanged = await cli('font', '--family', 'Example', '--style', 'Bold', '--size', '20');
  await finish(fontChanged);
  const fontResult = (await cli('result', fontChanged.id)).result;
  assert.equal(fontResult.ok, true);
  assert.equal(fontResult.output.operation, 'font');
  assert.deepEqual(fontResult.after.fontName, { family: 'Example', style: 'Bold' });
  assert.equal(fontResult.after.fontSize, 20);
  assert.equal(fontResult.after.characters, '解锁后的高层修改');
  target.type = 'FRAME'; target.layoutMode = 'NONE';
  let positionWrites = 0;
  target.children = [0, 50, 150].map((initial, index) => {
    let x = initial, y = index * 20;
    const checkpointBeforeWrite = () => {
      const checkpoint = JSON.parse(readFileSync(path.join(cwd, '.figma-agent/runs', activeJobId, 'before.json'), 'utf8'));
      assert.equal(checkpoint.before.id, target.id);
      assert.deepEqual(checkpoint.before.children.map(node => node.id), ['2:0','2:1','2:2']);
      positionWrites++;
    };
    return {id:'2:'+index,type:'RECTANGLE',name:'合成图层',parent:target,width:20+index*10,height:10,rotation:0,
      get x(){return x;},set x(value){checkpointBeforeWrite();x=value;},
      get y(){return y;},set y(value){checkpointBeforeWrite();y=value;}};
  });
  page.selection = target.children;
  events.get('selectionchange')();
  await tick(); await Promise.all([...pending]); await tick();
  const aligned = await cli('align', 'top');
  const alignedJournal = await finish(aligned);
  assert.equal(alignedJournal.result.ok, true);
  assert.equal(alignedJournal.result.before.id, target.id);
  assert.deepEqual(alignedJournal.result.after.children.map(node => node.y), [0,0,0]);
  const distributed = await cli('distribute', 'horizontal');
  const distributedJournal = await finish(distributed);
  assert.equal(distributedJournal.result.ok, true);
  assert.deepEqual(distributedJournal.result.after.children.map(node => node.x), [0,70,150]);
  assert.equal(positionWrites, 6);
  target.children[2].locked = true;
  const protectedArrange = await cli('align', 'left');
  const protectedJournal = await finish(protectedArrange);
  assert.equal(protectedJournal.result.ok, false);
  assert.equal(positionWrites, 6);
  page.children = [target, { id:'3:1', type:'FRAME', parent:page }];
  page.selection = [target];
  target.reactions = [];
  target.setReactionsAsync = async reactions => { target.reactions = reactions; };
  events.get('selectionchange')();
  await tick(); await Promise.all([...pending]); await tick();
  const linked = await cli('prototype', '3:1');
  const linkedJournal = await finish(linked);
  assert.equal(linkedJournal.result.ok, true);
  assert.deepEqual(linkedJournal.result.before.reactions, []);
  assert.equal(linkedJournal.result.after.reactions[0].actions[0].destinationId, '3:1');
  assert.equal(linkedJournal.result.output.interactionReview, 'not-run');
  await Promise.all([...pending]);
  assert.equal(backgroundErrors.length, 0);
  await bridge.close(); closed = true;
  assert.equal((await cli('history')).runs.length, 15);
  assert.equal((await cli('result', written.id)).result.output, '1:2');
  await assert.rejects(fs.access(path.join(cwd, '.figma-agent/session.json')));
});
