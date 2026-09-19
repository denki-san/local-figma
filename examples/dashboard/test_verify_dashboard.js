// 只读核对公开示例；结构通过仍需截图和真实点击验收。
const page = figma.currentPage;
function unique(name, type) {
  const nodes = page.children.filter(n => n.name === name && n.type === type);
  if (nodes.length !== 1) throw Error('需要唯一示例节点：' + name);
  return nodes[0];
}
const roots = ['7天', '30天'].map(period => unique('test_dashboard_public｜任务运行概览·' + period, 'FRAME'));
if (target.id !== roots[0].id) throw Error('请将公开示例的7天画板作为目标');
const main = unique('test_dashboard_public｜指标卡片', 'COMPONENT');
const reports = [];
for (const [index, root] of roots.entries()) {
  const texts = root.findAllWithCriteria({ types: ['TEXT'] });
  const instances = root.findAllWithCriteria({ types: ['INSTANCE'] });
  const rect = root.absoluteBoundingBox;
  const outside = texts.filter(n => {
    const b = n.absoluteBoundingBox;
    return !b || b.x < rect.x || b.y < rect.y || b.x + b.width > rect.x + rect.width + 0.01 || b.y + b.height > rect.y + rect.height + 0.01;
  }).map(n => n.id);
  const chart = root.findOne(n => n.name === '运行趋势');
  if (!chart) throw Error('缺少运行趋势');
  const values = chart.children.filter(n => n.name.startsWith('示例完成量｜')).map(n => Number(n.name.split('｜')[1]));
  const links = [];
  for (const instance of instances) links.push((await instance.getMainComponentAsync())?.id);
  const report = {
    id: root.id, width: root.width, height: root.height,
    texts: texts.length, instances: instances.length,
    missingFonts: texts.filter(n => n.hasMissingFont).map(n => n.id), outside,
    componentsLinked: links.every(id => id === main.id),
    bars: values.length, barTotal: values.reduce((a, b) => a + b, 0),
    imageNodes: root.findAll(n => Array.isArray(n.fills) && n.fills.some(f => f.type === 'IMAGE')).length
  };
  if (report.width !== 1440 || report.height !== 1024 || report.texts !== 70 || report.instances !== 4 || report.missingFonts.length || outside.length || !report.componentsLinked || report.bars !== 7 || report.barTotal !== [1248, 5360][index] || report.imageNodes) {
    throw Error('公开示例结构检查失败：' + JSON.stringify(report));
  }
  reports.push(report);
}
return { structurePassed: true, visualReviewRequired: true, realClicksRequired: true, reports };
