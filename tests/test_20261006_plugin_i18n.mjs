import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { createPluginI18n } from '../src/20261006-plugin-i18n.mjs';
import { fixture } from './helpers/test_20261006_plugin_ui_fixture.mjs';
import { init } from '../src/project.mjs';
import { start } from '../src/bridge.mjs';

const cases = [['zh-CN', 'zh-CN', '已连接'], ['zh-TW', 'zh-CN', '已连接'], ['zh-HK', 'zh-CN', '已连接'], ['en-US', 'en', 'Connected'], ['ja-JP', 'en', 'Connected'], ['unknown', 'en', 'Connected']];
test('浏览器语言选择中文与英文回退，序列化函数无外部依赖', async () => {
  for (const [language, locale, connected] of cases) {
    const i18n = createPluginI18n(language);
    assert.equal(i18n.locale, locale); assert.equal(i18n.t('connected'), connected);
    const standalone = vm.runInNewContext('(' + createPluginI18n.toString() + ')(' + JSON.stringify(language) + ')');
    assert.equal(standalone.t('connected'), connected);
    const f = fixture(language); await f.tick();
    assert.equal(f.document.documentElement.lang, locale); assert.equal(f.state.textContent, connected);
  }
  assert.equal(createPluginI18n(undefined).locale, 'en');
});

test('系统文本插值不翻译用户内容，未知设置错误提供英文说明', () => {
  const en = createPluginI18n('en-US');
  assert.equal(en.t('selected', { name: '已连接' }), 'Selected: 已连接');
  assert.equal(en.t('selectedCount', { count: 3 }), 'Selected 3 items');
  assert.equal(en.localize('仅保存到本机'), 'Stored only on this computer');
  assert.equal(en.localize('用户自由输入'), '用户自由输入');
  assert.equal(en.error('扩展作者自定义错误'), 'Extension request failed. Ask the Agent to check the local configuration.');
  assert.equal(en.error('Connection changed'), 'Connection changed');
  assert.equal(createPluginI18n('zh-CN').error('扩展作者自定义错误'), '扩展作者自定义错误');
  assert.throws(() => en.t('nonexistent'), /Unknown plugin message/);
});

for (const language of ['zh-CN', 'en-US']) {
  const chinese = language.startsWith('zh');
  test(language + ' 静态控件与连接、处理、恢复和错误状态', async () => {
    const f = fixture(language);
    assert.equal(f.element('settings-open').textContent, chinese ? '设置' : 'Settings');
    assert.equal(f.element('hide-panel').textContent, chinese ? '隐藏' : 'Hide');
    assert.equal(f.element('extension-key').placeholder, chinese ? '仅保存到本机' : 'Stored only on this computer');
    await f.tick(); assert.equal(f.state.textContent, chinese ? '已连接' : 'Connected');
    f.responses.push(Error('Failed to fetch')); await f.tick();
    assert.equal(f.state.textContent, chinese ? '正在恢复连接' : 'Reconnecting');
    assert.equal(f.element('state-detail').textContent, chinese ? '连接暂时中断，正在自动恢复。' : 'Connection interrupted. Reconnecting automatically.');
    const timeout = Error('signal timed out'); timeout.name = 'TimeoutError';
    f.responses.push(timeout); await f.tick();
    assert.equal(f.element('state-detail').textContent, chinese ? '连接超时，正在自动恢复。' : 'Connection timed out. Reconnecting automatically.');
    f.responses.push({ ok: false, status: 401 }); await f.tick();
    assert.equal(f.state.textContent, chinese ? '连接需检查' : 'Connection needs attention');
    f.responses.push({ body: { id: 'one', operation: 'run' } }); await f.tick();
    assert.equal(f.state.textContent, chinese ? '正在处理' : 'Processing');
    await f.complete({ id: 'one', ok: false, error: '字体未找到' }); await f.tick();
    assert.equal(f.state.textContent, chinese ? '任务需检查' : 'Task needs review');
    assert.equal(f.element('state-detail').textContent, chinese ? '回到 Agent 对话查看结果。' : 'Return to the Agent chat to review the result.');
  });

  test(language + ' 设置保存、后端错误及密钥占位符', async () => {
    const f = fixture(language);
    f.responses.push({ body: { extensions: [{ id: 'demo', name: '中文扩展名称', configured: true, enabled: false, disclosure: '作者说明原文' }] } });
    await f.element('settings-open').onclick();
    assert.equal(f.element('extension-choice').value, 'demo');
    assert.equal(f.element('extension-disclosure').textContent, '作者说明原文');
    assert.equal(f.element('extension-key').placeholder, chinese ? '已配置，留空保留；调用时验证' : 'Configured. Leave blank to keep; verified when used.');
    f.element('extension-enabled').checked = true;
    f.responses.push({ body: { extensions: [{ id: 'demo', name: '中文扩展名称', enabled: true }] } });
    await f.element('settings-save').onclick();
    assert.equal(f.element('settings-message').textContent, chinese ? '设置已保存。可以让 Agent 使用扩展。' : 'Settings saved. The Agent can now use the extension.');
    f.responses.push({ ok: false, status: 400, body: { error: '未知后端中文错误' } }); await f.element('settings-save').onclick();
    assert.equal(f.element('settings-message').textContent, chinese ? '未知后端中文错误' : 'Extension request failed. Ask the Agent to check the local configuration.');
    f.responses.push({ body: { extensions: [] } }); await f.element('settings-open').onclick();
    assert.equal(f.element('settings-note').textContent, chinese ? '当前使用普通版。需要可选能力时，让 Agent 安装可信的本地扩展。' : 'Standard editing is active. Ask the Agent to install a trusted local extension when needed.');
  });

  test(language + ' 风险确认保留理由、hash和脚本且不自动批准', async () => {
    const f = fixture(language); f.responses.push({ body: { id: 'one', operation: 'run' } }); await f.tick();
    const code = 'return "中文代码内容";', hash = 'abc123';
    await f.complete({ type: 'approval-request', id: 'one', reason: '用户中文理由', scriptHash: hash, code, binding: { fileKey: 'abc', nodeId: '1:2' } });
    assert.equal(f.state.textContent, chinese ? '请确认修改' : 'Confirm this change');
    assert.equal(f.element('approval-reason').textContent, '用户中文理由');
    assert.equal(f.element('approve').textContent, chinese ? '允许本次修改' : 'Allow this change');
    assert.equal(f.element('reject').textContent, chinese ? '取消本次修改' : 'Cancel this change');
    const detail = f.element('approval-details').textContent;
    assert.ok(detail.includes(code)); assert.ok(detail.includes(hash)); assert.ok(detail.includes(chinese ? '原因：用户中文理由' : 'Reason: 用户中文理由'));
    assert.equal(f.calls.filter(call => call.url.endsWith('/approve')).length, 0);
    f.responses.push({ ok: false, status: 400 }); await f.element('approve').onclick();
    assert.equal(f.element('state-detail').textContent, chinese ? '确认未保存，请再试一次。' : 'Decision was not saved. Please try again.');
  });

  test(language + ' 工作流所有状态与断言进度双语，用户标题保持原文', async () => {
    const labels = chinese ? ['已就绪', '执行中', '等待结果', '检查未通过', '需要恢复核验', '等待人工验收', '已完成'] : ['Ready', 'Running', 'Waiting for result', 'Check failed', 'Recovery review required', 'Awaiting review', 'Done'];
    for (const [index, state] of ['ready', 'running', 'waiting', 'failed', 'needs-review', 'awaiting-review', 'done'].entries()) {
      const f = fixture(language); f.responses.push({ progress: encodeURIComponent(JSON.stringify({ current: 1, total: 2, target: '中文任务标题', state, mode: 'static', failure: { property: 'width', expected: '320', actual: '280' } })) }); await f.tick();
      assert.equal(f.element('workflow-step').textContent, '1/2 · 中文任务标题 · ' + labels[index]);
      assert.equal(f.element('workflow-last').textContent, chinese ? '静态设计 · width：预期 320，实际 280' : 'Static design · width: expected 320, actual 280');
    }
    const f = fixture(language); f.responses.push({ progress: encodeURIComponent(JSON.stringify({ current: 2, total: 2, target: '中文标题', state: 'done', mode: 'prototype', previousTitle: '中文前一步' })) }); await f.tick();
    assert.equal(f.element('workflow-last').textContent, chinese ? '交互原型 · 中文前一步：已通过' : 'Interactive prototype · 中文前一步: passed');
  });
}

test('英文 UI 保留中文节点名，系统目标问题通过 key 翻译', async () => {
  const f = fixture('en-US'); await f.tick(); const contextNonce = f.contexts[0].pluginMessage.contextNonce;
  await f.complete({ type: 'target-info', contextNonce, name: '已连接', issueKey: 'outside' });
  await f.complete({ type: 'context-update', contextNonce, context: { selection: [{ name: '请确认修改' }] } });
  await f.tick();
  assert.equal(f.element('target-name').textContent, '已连接');
  assert.equal(f.element('selection-name').textContent, 'Selected: 请确认修改');
  assert.equal(f.state.textContent, 'Target needs attention');
  assert.equal(f.element('state-detail').textContent, 'The selection is outside the target. Select content within it or send a new link to the Agent.');
  await f.complete({ type: 'target-info', contextNonce, nameKey: 'openFile', issueKey: 'wrongFile' });
  assert.equal(f.element('target-name').textContent, 'Open the linked file');
});

test('bridge 注入自包含双语 UI，main 保留目标提示 key，停用页双语运行', async t => {
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'test_20261006_plugin_i18n_'));
  await init(cwd, 'https://figma.com/design/abc/Test?node-id=1-2');
  const bridge = await start(cwd, 0);
  t.after(async () => { await bridge.close(); await fs.rm(cwd, { recursive: true, force: true }); });
  const pluginDir = path.join(cwd, '.figma-agent/plugin');
  const html = await fs.readFile(path.join(pluginDir, 'ui.html'), 'utf8');
  const main = await fs.readFile(path.join(pluginDir, 'main.js'), 'utf8');
  assert.doesNotMatch(html, /SESSION_I18N|SESSION_CONFIG/);
  assert.match(html, /function createPluginI18n/); assert.match(main, /issueKey/);
  assert.equal([...html.matchAll(/<script>/g)].length, 1);
  await bridge.close();
  const inactive = await fs.readFile(path.join(pluginDir, 'ui.html'), 'utf8');
  assert.match(inactive, /data-runtime-inactive/);
  for (const [language, state, detail] of [['zh-CN', '连接已断开', '回到 Agent 对话让它重连，再在 Figma 运行插件。'], ['en-US', 'Disconnected', 'Ask the Agent to reconnect, then run the plugin in Figma.']]) {
    const nodes = { state: {}, detail: {} }, document = { documentElement: {}, querySelector: selector => selector === '[role="status"]' ? nodes.state : nodes.detail };
    vm.runInNewContext(inactive.match(/<script>([\s\S]*)<\/script>/)[1], { navigator: { language }, document });
    assert.equal(nodes.state.textContent, state); assert.equal(nodes.detail.textContent, detail);
  }
});

test('扩展声明按浏览器语言选显式翻译，缺少翻译原文保留', async () => {
  for (const [language, expected] of [['zh-CN', '发送任务设计上下文。'], ['zh-TW', '发送任务设计上下文。'], ['en-US', 'Sends the task design context.'], ['ja-JP', 'Sends the task design context.']]) {
    const f = fixture(language);
    const item = { id: 'addon', name: '作者的中文扩展名', enabled: false, disclosure: '原始作者声明', disclosureI18n: { en: 'Sends the task design context.', 'zh-CN': '发送任务设计上下文。' } };
    f.responses.push({ body: { extensions: [item] } }); await f.element('settings-open').onclick();
    assert.equal(f.element('extension-disclosure').textContent, expected);
    f.responses.push({ body: { extensions: [{ ...item, disclosureI18n: undefined }] } }); await f.element('settings-open').onclick();
    assert.equal(f.element('extension-disclosure').textContent, '原始作者声明');
    f.responses.push({ body: { extensions: [{ ...item, disclosureI18n: language.startsWith('zh') ? { en: 'English only' } : { 'zh-CN': '只有中文' } }] } }); await f.element('settings-open').onclick();
    assert.equal(f.element('extension-disclosure').textContent, '原始作者声明');
  }
});
