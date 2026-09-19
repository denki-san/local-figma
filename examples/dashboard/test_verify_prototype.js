// 只读核验公开案例连线；真实点击和视觉验收必须另行进行。
const page = figma.currentPage;
function unique(nodes, name) {
  const matches = nodes.filter(n => n.name === name);
  if (matches.length !== 1) throw Error('需要唯一节点：' + name);
  return matches[0];
}
const root = unique(page.children, 'test_dashboard_public｜任务运行概览·7天');
const month = unique(page.children, 'test_dashboard_public｜任务运行概览·30天');
const modal = unique(page.children, 'test_dashboard_public｜模拟运行详情');
if (target.id !== root.id || [root, month, modal].some(n => n.type !== 'FRAME')) throw Error('请绑定公开示例7天画板');
function child(root, name) { return unique(root.findAll(n => n.name === name && n.type === 'FRAME'), name); }
function visible(node) {
  for (let n = node; n && n !== page; n = n.parent) {
    if (n.visible === false) throw Error('交互节点或祖先隐藏：' + node.name);
  }
}
const links = [
  [child(root, '近 30 天'), {type: 'NODE', destinationId: month.id, navigation: 'NAVIGATE'}],
  [child(month, '近 7 天'), {type: 'NODE', destinationId: root.id, navigation: 'NAVIGATE'}],
  [child(root, '运行记录｜周报资料整理'), {type: 'NODE', destinationId: modal.id, navigation: 'OVERLAY'}],
  [child(month, '运行记录｜周报资料整理'), {type: 'NODE', destinationId: modal.id, navigation: 'OVERLAY'}],
  [child(modal, '关闭详情'), {type: 'CLOSE'}]
];
for (const destination of [root, month, modal]) visible(destination);
for (const [node, expected] of links) {
  visible(node);
  const reactions = node.reactions;
  if (!Array.isArray(reactions) || reactions.length !== 1 || reactions[0].trigger?.type !== 'ON_CLICK') throw Error('点击触发不唯一：' + node.name);
  const actions = reactions[0].actions;
  if (!Array.isArray(actions) || actions.length !== 1) throw Error('点击动作不唯一：' + node.name);
  if (Object.entries(expected).some(([key, value]) => actions[0][key] !== value)) throw Error('点击目的地或动作不符：' + node.name);
}
const starts = page.flowStartingPoints.filter(point => point.nodeId === root.id && point.name === 'test_公开示例｜任务运行概览');
if (starts.length !== 1) throw Error('缺少唯一公开原型起点');
return {structurePassed: true, checkedLinks: links.length, realClicksRequired: true, pathToClick: '7天→30天→详情→关闭→7天', boundary: '未验证滚动、组件状态、真实业务或点击后的来源保持'};
