export const scenarios = {
  design: {
    title: '从零设计',
    fields: {},
    steps: ['明确用户任务与真实内容', '查找参考图并记录来源、借鉴点', '选择结构方向并确定设计基础', '分区域创建原生图层', '截图对照并验证长内容与状态']
  },
  refine: {
    title: '已有稿精修',
    fields: {},
    steps: ['读取目标、组件与样式', '保存基线截图', '实施局部调整', '核对差异与保护区域', '检查截图及相关交互']
  },
  'design-to-code': {
    title: 'Design to Code',
    fields: { sourceNode: '填写 Figma 来源节点链接', codeProject: '填写目标代码项目目录', runtimeUrl: '填写页面运行地址', assetPlan: '说明图片、图标和字体的导出或复用方式', componentMapping: '说明设计组件与代码组件的对应关系', targetSize: '填写对照视口尺寸', stateCoverage: '说明对照状态及真实交互', comparisonPlan: '说明同尺寸截图对照与差异修正方法' },
    steps: ['读取来源节点和截图', '导出素材并核对字体', '映射现有代码组件', '实现并运行页面', '同尺寸同状态截图对照', '修正差异并实际点击主要路径']
  },
  'code-to-design': {
    title: 'Code to Design',
    fields: { codeProject: '填写来源代码项目目录', runtimeUrl: '填写来源页面运行地址', targetNode: '填写目标 Figma 节点链接', assetPlan: '说明来源图片与字体的取得方式', componentMapping: '说明重复元素如何生成 Component 与 Instance', targetSize: '填写来源页面视口尺寸', stateCoverage: '说明要还原的页面状态', comparisonPlan: '说明浏览器与 Figma 同尺寸截图对照方法' },
    steps: ['运行来源页面并保存截图', '读取布局、计算样式和素材', '映射原生布局与组件', '通过脚本创建可编辑图层', '读回文字与组件实例', '同尺寸对照并修正差异']
  },
  prototype: {
    title: '制作交互原型',
    fields: { sourceNode: '填写起始画板链接', interactionPaths: '逐条说明触发操作、目标状态和返回行为', stateCoverage: '说明跳转、返回、弹层、组件状态、滚动和固定区的覆盖', simulationNotes: '标明账号、支付、数据等模拟行为', comparisonPlan: '说明真实点击路径与截图证据如何记录' },
    steps: ['读取现有画板和组件状态', '列出主要操作及结果', '连接跳转、返回、弹层与组件状态', '配置滚动及固定区域', '真实点击所有主要路径', '交付原型链接、已测路径与模拟限制']
  }
};

export function scenario(mode) {
  if (!Object.hasOwn(scenarios, mode)) throw Error(`场景必须是 ${Object.keys(scenarios).join('、')}`);
  return scenarios[mode];
}
