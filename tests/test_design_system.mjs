import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';

const source = await fs.readFile(new URL('../plugin/main.js', import.meta.url), 'utf8');
test('设计系统发现只读汇总已用样式、嵌套变量和主组件，保留不可解析引用', async () => {
  const messages = [], styleCalls = [], variableCalls = [];
  const page = { id: '1:1', type: 'PAGE', loadAsync: async () => {} };
  const mixed = Symbol();
  const component = { id: '2:1', name: '按钮', key: 'component-key', remote: true };
  const target = { id: '1:2', type: 'FRAME', name: '操作区', parent: page, children: [
    { id: '1:3', type: 'TEXT', name: '标题', textStyleId: 'style-a', fillStyleId: mixed,
      boundVariables: { fills: [{ type: 'VARIABLE_ALIAS', id: 'variable-a' }], componentProperties: { size: { type: 'VARIABLE_ALIAS', id: 'variable-a' } } } },
    { id: '1:4', type: 'INSTANCE', name: '确认', fillStyleId: 'style-a', effectStyleId: 'missing', getMainComponentAsync: async () => component },
    { id: '1:5', type: 'INSTANCE', name: '取消', getMainComponentAsync: async () => component,
      boundVariables: { width: { type: 'VARIABLE_ALIAS', id: 'variable-missing' } } }
  ] };
  for (const node of target.children) Object.freeze(node);
  Object.freeze(target);
  const figma = { fileKey: 'example', mode: 'default', editorType: 'figma', mixed,
    showUI() {}, ui: { postMessage: m => messages.push(m) }, getNodeByIdAsync: async () => target, setCurrentPageAsync: async () => {},
    getStyleByIdAsync: async id => { styleCalls.push(id); return id === 'missing' ? null : { id, name: '正文', type: 'TEXT', remote: false }; },
    variables: { getVariableByIdAsync: async id => { variableCalls.push(id); if (id === 'variable-missing') throw Error(); return { id, name: '主色', resolvedType: 'COLOR', variableCollectionId: 'collection-a' }; } }
  };
  vm.runInNewContext(source, { figma, __html__: '', setTimeout, clearTimeout });
  await figma.ui.onmessage({ id: 'job', operation: 'design-system', binding: { fileKey: 'example', nodeId: target.id } });
  assert.equal(messages.length, 1);
  assert.equal(messages[0].ok, true);
  const result = messages[0].output;
  assert.equal(result.scannedNodes, 4);
  assert.equal(result.styles.find(s => s.id === 'style-a').usedBy.length, 2);
  assert.equal(styleCalls.filter(id => id === 'style-a').length, 1);
  assert.equal(variableCalls.filter(id => id === 'variable-a').length, 1);
  assert.equal(result.variables.find(v => v.id === 'variable-a').usedBy.length, 2);
  assert.equal(result.variables.find(v => v.id === 'variable-missing').resolved, false);
  assert.equal(result.components[0].usedBy.length, 2);
  assert.equal(result.components[0].remote, true);
  assert.equal(result.warnings.length, 3);
  assert.equal(JSON.stringify(messages[0].before), JSON.stringify(messages[0].after));
});
