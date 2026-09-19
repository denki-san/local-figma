import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const code = await fs.readFile(new URL('../examples/dashboard/test_verify_prototype.js', import.meta.url), 'utf8');
function fixture() {
  const page = {children: [], flowStartingPoints: []};
  function frame(id, name) {
    const node = {id, name, type: 'FRAME', parent: page, children: [], findAll(fn) { return this.children.filter(fn); }};
    page.children.push(node); return node;
  }
  const root = frame('1:1', 'test_dashboard_public｜任务运行概览·7天');
  const month = frame('1:2', 'test_dashboard_public｜任务运行概览·30天');
  const modal = frame('1:3', 'test_dashboard_public｜模拟运行详情');
  const nodes = [];
  function link(parent, name, action) {
    const node = {name, type: 'FRAME', parent, reactions: [{trigger: {type: 'ON_CLICK'}, actions: [action]}]};
    parent.children.push(node); nodes.push(node);
    parent.children.push({name, type: 'TEXT', parent: node});
  }
  link(root, '近 30 天', {type: 'NODE', destinationId: month.id, navigation: 'NAVIGATE'});
  link(month, '近 7 天', {type: 'NODE', destinationId: root.id, navigation: 'NAVIGATE'});
  for (const parent of [root, month]) link(parent, '运行记录｜周报资料整理', {type: 'NODE', destinationId: modal.id, navigation: 'OVERLAY'});
  link(modal, '关闭详情', {type: 'CLOSE'});
  page.flowStartingPoints.push({nodeId: root.id, name: 'test_公开示例｜任务运行概览'});
  return {page, root, month, modal, nodes, run: () => new Function('figma', 'target', 'return (async()=>{' + code + '})()')({currentPage: page}, root)};
}
test('公开原型检查五条连线并保留真实点击待验收边界', async () => {
  const f = fixture();
  const before = JSON.stringify(f.nodes.map(n => n.reactions));
  const result = await f.run();
  assert.equal(result.checkedLinks, 5);
  assert.equal(result.realClicksRequired, true);
  assert.equal(JSON.stringify(f.nodes.map(n => n.reactions)), before);
});
test('公开原型拒绝错目的地、额外动作、错触发、隐藏祖先、重复节点和缺失起点', async () => {
  for (const mutate of [
    f => { f.nodes[0].reactions[0].actions[0].destinationId = 'wrong'; },
    f => { f.nodes[2].reactions[0].actions[0].navigation = 'NAVIGATE'; },
    f => { f.nodes[4].reactions[0].actions.push({type: 'BACK'}); },
    f => { f.nodes[0].reactions[0].trigger.type = 'ON_HOVER'; },
    f => { f.month.visible = false; },
    f => { f.nodes[0].visible = false; },
    f => { f.root.children.push(f.nodes[0]); },
    f => { f.page.flowStartingPoints = []; }
  ]) { const f = fixture(); mutate(f); await assert.rejects(f.run()); }
});
