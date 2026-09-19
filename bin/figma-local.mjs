#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { init, brief, json, root } from '../src/project.mjs';
import { start } from '../src/bridge.mjs';
import { localResult, history, diffRun } from '../src/evidence.mjs';
import { doctor } from '../src/doctor.mjs';
import { validateRun } from '../src/validate.mjs';
import { checkGuide } from '../src/guide.mjs';
import { recover } from '../src/recover.mjs';
import { parseArguments } from '../src/arguments.mjs';
import { waitForResult } from '../src/wait.mjs';
import { scenarios } from '../src/scenarios.mjs';
import { prepareManager, startManager, managerDirectory } from '../src/session-manager.mjs';
import { selectedTextEdit, selectedLayoutEdit, selectedFillEdit, selectedFontEdit, selectedArrangeEdit, selectedPrototypeEdit } from '../src/operations.mjs';
import { selectedInstanceCreate } from '../src/instance-operation.mjs';
import { selectedInstanceProperty } from '../src/instance-properties.mjs';
import { selectedFillVariable } from '../src/variable-operation.mjs';
import { builtinCommands, extensionCommand, runExtension } from '../src/extensions.mjs';

let cwd = process.cwd();
const out = value => process.stdout.write(JSON.stringify(value, null, 2) + '\n');
const propertyHelp = ['props <完整属性名> --value <文字或true/false>', 'bind-fill <已确认的颜色变量ID>'];
try {
  const raw = process.argv.slice(2);
  const requested = raw[0] || 'help';
  const { command, arg, risk, targetNodeId, timeoutSeconds, layoutValues, fontValues, propertyValue, inspectId, previousPluginStopped } =
    requested === 'extension' || !builtinCommands.has(requested) ? { command: requested } : parseArguments(raw);
  // 老项目保留显式本地绑定；普通工作目录自动使用固定会话。
  if (!['init', 'setup', 'serve', 'help'].includes(command)) {
    try { await fs.access(root(cwd)); }
    catch (error) {
      if (error.code !== 'ENOENT') throw error;
      try { await fs.access(path.join(root(managerDirectory()), 'binding.json')); cwd = managerDirectory(); }
      catch (managerError) { if (managerError.code !== 'ENOENT') throw managerError; }
    }
  }
  if (command === 'help') out({ commands: [...propertyHelp, 'init <figma-url>', 'connect', 'doctor', 'recover', 'resolve <原任务ID> --inspect <核验任务ID> --previous-plugin-stopped', 'extension list|add|disable|remove', 'status', 'context', 'text <新文字>', 'fill <#RRGGBB>', 'font [--size <字号>] [--family <字体名> --style <样式名>]', 'align <left|right|top|bottom|horizontal-center|vertical-center>', 'distribute <horizontal|vertical>', 'prototype <同页目标Frame的ID>', 'instance <已确认的同页主组件ID>', 'layout [--width <宽>] [--height <高>] [--gap <间距>] [--padding <内边距>]', 'inspect [--node <ID>]', 'preview [--node <ID>]', 'design-system [--node <ID>]', 'run <script.js> [--node <ID>] [--high-risk <风险说明>]', 'result <job-id>', 'wait <job-id> [--timeout <秒>]', 'history', 'diff <job-id>', 'validate <job-id>', `guide <${Object.keys(scenarios).join('|')}>`, `guide-check <${Object.keys(scenarios).join('|')}>`], installation: 'Node.js 22+；init 后 connect，导入返回的 manifest 并运行插件', script: '可信 JavaScript 函数体，可访问 figma 与 target，并通过 return 返回结果' });
  else if (command === 'extension') out(await extensionCommand(cwd, raw.slice(1)));
  else if (!builtinCommands.has(command)) {
    const report = await runExtension(cwd, command, raw.slice(1));
    out(report.output); process.exitCode = report.exitCode;
  }
  else if (command === 'init') out(await init(cwd, arg));
  else if (command === 'setup') out(await prepareManager(arg));
  else if (command === 'recover') out(await recover(cwd));
  else if (command === 'guide') out(await brief(cwd, arg));
  else if (command === 'guide-check') {
    const report = await checkGuide(cwd, arg); out(report);
    if (!report.readyForExecution) process.exitCode = 2;
  }
  else if (command === 'doctor') {
    const result = await doctor(cwd); out(result);
    if (!result.ready) process.exitCode = 1;
  }
  else if (command === 'history') out(await history(cwd));
  else if (command === 'wait') {
    const record = await waitForResult(cwd, arg, timeoutSeconds); out(record);
    process.exitCode = record.waitStatus !== 'completed' ? 2 : record.result.ok ? 0 : 1;
  }
  else if (command === 'diff') out(await diffRun(cwd, arg));
  else if (command === 'validate') {
    const report = await validateRun(cwd, arg); out(report);
    process.exitCode = report.status === 'failed' ? 1 : report.status === 'needs-review' ? 2 : 0;
  }
  else if (command === 'result') {
    const record = await localResult(cwd, arg); out(record);
    if (record.result?.ok === false) process.exitCode = 1;
  }
  else if (command === 'connect' || command === 'serve') {
    const persistentPlugin = command === 'serve' || cwd === managerDirectory();
    const bridge = persistentPlugin ? await startManager() : await start(cwd);
    out({ listening: `127.0.0.1:${bridge.port}`, manifest: bridge.manifest, instruction: persistentPlugin
      ? '持久会话开发入口：首次导入插件，后续服务重启沿用配对。尚未提供后台安装器；未确认操作会阻止新写入。'
      : 'Figma → Plugins → Development → Import plugin from manifest；运行插件并保持窗口打开。停止终端用 Ctrl-C。' });
    let stopping = false;
    const stop = async () => { if (stopping) return; stopping = true; await bridge.close(); };
    process.once('SIGINT', stop); process.once('SIGTERM', stop);
  } else {
    if (!['status', 'context', 'text', 'fill', 'font', 'layout', 'align', 'distribute', 'prototype', 'instance', 'props', 'bind-fill', 'inspect', 'preview', 'design-system', 'run', 'resolve'].includes(command)) throw Error('未知命令，请运行 figma-local help');
    let session;
    try { session = await json(path.join(root(cwd), 'session.json')); }
    catch (error) {
      if (error.code === 'ENOENT') throw Object.assign(Error('当前目录没有连接会话。请先运行 figma-local doctor；已初始化的项目运行 figma-local connect，并在 Figma 中打开对应开发插件。'), { code: 'ENOENT' });
      throw error;
    }
    const headers = { 'Content-Type': 'application/json', 'X-Session-Token': session.token };
    let endpoint = command === 'context' ? '/context' : '/status', options = { headers, signal: AbortSignal.timeout(10000) };
    if (['text', 'fill', 'font', 'layout', 'align', 'distribute', 'prototype', 'instance', 'props', 'bind-fill'].includes(command)) {
      const response = await fetch(`http://127.0.0.1:${session.port}/context`, options);
      if (!response.ok) throw Error('当前选择暂不可用，请检查连接');
      const state = await response.json();
      const operation = command === 'bind-fill' ? selectedFillVariable(state, arg) : command === 'props' ? selectedInstanceProperty(state, arg, propertyValue) : command === 'instance' ? selectedInstanceCreate(state, arg) : command === 'prototype' ? selectedPrototypeEdit(state, arg) : ['align','distribute'].includes(command) ? selectedArrangeEdit(state, command, arg) : command === 'text' ? selectedTextEdit(state, arg) : command === 'fill' ? selectedFillEdit(state, arg) : command === 'font' ? selectedFontEdit(state, fontValues) : selectedLayoutEdit(state, layoutValues);
      endpoint = '/job'; options.method = 'POST'; options.body = JSON.stringify(operation);
    }
    if (['inspect', 'preview', 'design-system', 'run'].includes(command)) {
      endpoint = '/job'; options.method = 'POST';
      const code = command === 'run' ? await fs.readFile(path.resolve(arg || ''), 'utf8') : '';
      options.body = JSON.stringify({ operation: command, code, risk, targetNodeId });
    }
    if (command === 'resolve') {
      endpoint = '/resolve'; options.method = 'POST';
      options.body = JSON.stringify({ id: arg, inspectId, previousPluginStopped });
    }
    const response = await fetch(`http://127.0.0.1:${session.port}${endpoint}`, options);
    const result = await response.json(); out(result);
    if (!response.ok || result.ok === false) process.exitCode = 1;
  }
} catch (error) { out({ error: error.message, code: error.code || 'COMMAND_FAILED' }); process.exitCode = 1; }
