import { isNodeId } from './node-id.mjs';

function targetGuard(options) {
  const { targetId, pageId, type, scopeId = null, bindingNodeId = null, requireSelection = false, protectInstances = false, protectInvisible = false } = options;
  if (!isNodeId(targetId) || !isNodeId(pageId) || (scopeId !== null && !isNodeId(scopeId)) || (bindingNodeId !== null && !isNodeId(bindingNodeId)) || typeof type !== 'string') throw Error('修改目标与页面范围无效');
  return `
const constraint=${JSON.stringify({ targetId, pageId, type, scopeId, bindingNodeId, requireSelection, protectInstances, protectInvisible })};
function checkTarget() {
  if(target.removed||target.id!==constraint.targetId||target.type!==constraint.type||figma.currentPage.id!==constraint.pageId)throw Error('选择已变化，本次未修改');
  if(constraint.requireSelection&&(figma.currentPage.selection.length!==1||figma.currentPage.selection[0].id!==target.id))throw Error('选择已变化，本次未修改');
  let inside=constraint.scopeId===null, bound=constraint.bindingNodeId===null, targetPage=null;
  for(let node=target;node;node=node.parent){if(node.id===constraint.bindingNodeId)bound=true;if(node.type==='PAGE')targetPage=node.id;}
  if(targetPage!==constraint.pageId)throw Error('目标已移出原页面，本次未修改');
  for(let node=target;node&&node.type!=='PAGE';node=node.parent){
    if(node.id===constraint.scopeId)inside=true;
    if(node.locked)throw Error('选中区域已锁定，本次未修改');
    if(['COMPONENT','COMPONENT_SET'].includes(node.type))throw Error('当前区域属于主组件，请先确认修改范围');
    if(constraint.protectInstances&&node.type==='INSTANCE')throw Error('当前区域属于实例，请先确认修改范围');
    if(constraint.protectInvisible&&node.visible===false)throw Error('目标已隐藏，本次未修改');
  }
  if(!inside||!bound)throw Error('目标已移出原画板或绑定范围，本次未修改');
}
checkTarget();
`;
}

export function textOperation(options, content) {
  if (typeof content !== 'string' || content.length > 50000) throw Error('文字内容无效或过长，请分段修改');
  return { operation: 'run', targetNodeId: options.targetId, code: targetGuard({ ...options, type: 'TEXT' }) + `
const content=${JSON.stringify(content)};
const expected=${JSON.stringify(options.expectedText ?? null)};
if(expected!==null&&target.characters!==expected)throw Error('原文已变化，本次未覆盖');
const before=target.characters;
const fonts=target.fontName===figma.mixed?target.getRangeAllFontNames(0,before.length):[target.fontName];
for(const font of fonts)await figma.loadFontAsync(font);
checkTarget();
if(target.characters!==before)throw Error('文字已发生变化，本次未覆盖');
target.characters=content;
if(target.characters!==content)throw Error('修改后读回不一致，请检查画布');
return {changedNodeIds:[target.id],operation:${JSON.stringify(options.operationLabel || 'text')},characters:target.characters};
` };
}

export function fillOperation(options, hex) {
  if (typeof hex !== 'string' || !/^#[0-9a-f]{6}$/i.test(hex)) throw Error('颜色需要六位十六进制格式，例如 #3366FF');
  if (!['FRAME', 'RECTANGLE', 'ELLIPSE', 'VECTOR', 'TEXT', 'INSTANCE'].includes(options.type)) throw Error('目标类型不支持纯色填充');
  const color = { r: parseInt(hex.slice(1, 3), 16) / 255, g: parseInt(hex.slice(3, 5), 16) / 255, b: parseInt(hex.slice(5, 7), 16) / 255 };
  return { operation: 'run', targetNodeId: options.targetId, code: targetGuard(options) + `
const color=${JSON.stringify(color)};
if(target.fillStyleId)throw Error('填充已绑定样式，请先明确样式修改范围');
const paints=target.fills;
if(!Array.isArray(paints)||paints.length!==1||paints[0].type!=='SOLID'||paints[0].visible===false)throw Error('仅支持单个可见纯色填充；多层、混合样式和图片需单独处理');
if(Object.keys(paints[0].boundVariables||{}).length||target.boundVariables?.fills?.length)throw Error('填充已绑定变量，请使用变量调整流程');
const expected=${JSON.stringify(options.expectedColor ?? null)};
if(expected&&['r','g','b'].some(key=>!Number.isFinite(paints[0].color?.[key])||Math.abs(paints[0].color[key]-expected[key])>0.000001))throw Error('原色已变化，本次未覆盖');
target.fills=[{...paints[0],color}];
const after=target.fills;
if(!Array.isArray(after)||after.length!==1||after[0].type!=='SOLID'||['r','g','b'].some(key=>!Number.isFinite(after[0].color?.[key])||Math.abs(after[0].color[key]-color[key])>0.000001))throw Error('修改后颜色读回不一致，请检查画布');
return {changedNodeIds:[target.id],operation:${JSON.stringify(options.operationLabel || 'fill')},color:after[0].color};
` };
}
