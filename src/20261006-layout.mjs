// 命令和工作流共用属性定义、前置检查及写入顺序。
export const layoutEnums = {
  layoutMode: ['NONE', 'HORIZONTAL', 'VERTICAL'],
  layoutSizingHorizontal: ['FIXED', 'HUG', 'FILL'],
  layoutSizingVertical: ['FIXED', 'HUG', 'FILL'],
  primaryAxisAlignItems: ['MIN', 'CENTER', 'MAX', 'SPACE_BETWEEN'],
  counterAxisAlignItems: ['MIN', 'CENTER', 'MAX'],
  layoutPositioning: ['AUTO', 'ABSOLUTE'],
  textAutoResize: ['NONE', 'HEIGHT', 'WIDTH_AND_HEIGHT', 'TRUNCATE']
};
export const layoutNumbers = ['itemSpacing', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft'];
export const layoutFields = [...Object.keys(layoutEnums), ...layoutNumbers];
export function validateLayoutProperties(p) {
  for (const [key, allowed] of Object.entries(layoutEnums)) if (key in p && !allowed.includes(p[key])) throw Error('布局枚举无效：' + key);
  for (const key of layoutNumbers) if (key in p && (!Number.isFinite(p[key]) || p[key] < 0 || p[key] > 10000)) throw Error('布局数值需为 0–10000：' + key);
  for (const [size, mode] of [['width', 'layoutSizingHorizontal'], ['height', 'layoutSizingVertical']]) {
    if (size in p && mode in p && p[mode] !== 'FIXED') throw Error('显式尺寸不能与 Hug/Fill 同时设置：' + size);
  }
  if (p.layoutMode === 'NONE' && ['itemSpacing', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'primaryAxisAlignItems', 'counterAxisAlignItems'].some(k => k in p)) throw Error('间距和对齐需要水平或垂直 Auto Layout');
}
export function commandLayoutProperties(values) {
  const aliases = { direction: 'layoutMode', horizontalSizing: 'layoutSizingHorizontal', verticalSizing: 'layoutSizingVertical', primaryAlign: 'primaryAxisAlignItems', counterAlign: 'counterAxisAlignItems', gap: 'itemSpacing' };
  const p = {};
  for (const [key, value] of Object.entries(values || {})) {
    if (key === 'padding') { for (const side of ['Top', 'Right', 'Bottom', 'Left']) p['padding' + side] = value; }
    else if (['width', 'height', ...Object.keys(aliases), ...layoutNumbers.filter(k => k !== 'itemSpacing')].includes(key)) p[aliases[key] || key] = typeof value === 'string' ? value.toUpperCase().replaceAll('-', '_') : value;
    else throw Error('不支持的布局参数：' + key);
  }
  // 四边参数覆盖统一内边距，与参数输入顺序无关。
  for (const side of ['Top', 'Right', 'Bottom', 'Left']) if ('padding' + side in values) p['padding' + side] = values['padding' + side];
  if (!Object.keys(p).length) throw Error('至少指定一个布局参数');
  for (const size of ['width', 'height']) if (size in p && (!Number.isFinite(p[size]) || p[size] <= 0 || p[size] > 100000)) throw Error('尺寸需为 0.01–100000');
  validateLayoutProperties(p);
  return p;
}
// 此函数会序列化到插件，不能依赖模块作用域。
export function applyLayoutProperties(node, p, write = true) {
  const container = ['FRAME', 'COMPONENT', 'COMPONENT_SET', 'INSTANCE'].includes(node.type);
  const mode = p.layoutMode ?? node.layoutMode;
  const auto = ['HORIZONTAL', 'VERTICAL'].includes(mode);
  const parentAuto = ['HORIZONTAL', 'VERTICAL'].includes(node.parent?.layoutMode);
  for (const k of ['layoutMode', 'itemSpacing', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'primaryAxisAlignItems', 'counterAxisAlignItems']) {
    if (k in p && !container) throw Error('容器布局属性要求 Frame 或组件：' + k);
    if (k !== 'layoutMode' && k in p && !auto) throw Error('间距和对齐仅用于已有或本次启用的水平或垂直 Auto Layout');
  }
  if ('textAutoResize' in p && node.type !== 'TEXT') throw Error('textAutoResize 要求 TEXT 节点');
  const positioning = p.layoutPositioning ?? node.layoutPositioning;
  if ('layoutPositioning' in p && !parentAuto) throw Error('定位模式要求 Auto Layout 父容器');
  for (const [axis, size] of [['Horizontal', 'width'], ['Vertical', 'height']]) {
    const key = 'layoutSizing' + axis, sizing = p[key] ?? node[key];
    if (key in p) {
      if (!auto && !parentAuto && node.type !== 'TEXT') throw Error('尺寸模式要求 Auto Layout 容器或其子节点');
      if (sizing === 'HUG' && !auto && node.type !== 'TEXT') throw Error('Hug 要求 Auto Layout 容器或文字节点');
      if (sizing === 'FILL' && (!parentAuto || positioning === 'ABSOLUTE')) throw Error('Fill 要求参与父容器 Auto Layout 排列');
    }
    if (size in p && ['HUG', 'FILL'].includes(sizing)) throw Error('尺寸受自动布局控制，请先明确尺寸模式');
  }
  if (parentAuto && positioning !== 'ABSOLUTE' && ('x' in p || 'y' in p)) throw Error('自动排列节点不能同时设置坐标，请明确绝对定位');
  if (!write) return;
  if ('layoutMode' in p) node.layoutMode = p.layoutMode;
  if ('layoutPositioning' in p) node.layoutPositioning = p.layoutPositioning;
  if ('textAutoResize' in p) node.textAutoResize = p.textAutoResize;
  for (const k of ['itemSpacing', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'primaryAxisAlignItems', 'counterAxisAlignItems', 'layoutSizingHorizontal', 'layoutSizingVertical']) if (k in p) node[k] = p[k];
  if ('width' in p || 'height' in p) node.resize(p.width ?? node.width, p.height ?? node.height);
}
