import { isNodeId } from './node-id.mjs';
import { textOperation, fillOperation } from './edit-operations.mjs';
// 高层操作由 Agent 调用；用户无需提供脚本或节点 ID。
export function selectedPrototypeEdit(state, destinationId) {
  if (!state?.connected || state.stale) throw Error('正在重连，稍后再修改');
  const selection = state.context?.selection;
  if (!Array.isArray(selection) || selection.length !== 1) throw Error('请选中一个原型触发图层');
  if (!isNodeId(destinationId)) throw Error('Agent需要提供已确认的目标画板ID');
  return {operation:'run',targetNodeId:selection[0].id,code:`
const pageId=${JSON.stringify(state.context.pageId)},destinationId=${JSON.stringify(destinationId)};
if(target.removed || figma.currentPage.id!==pageId || figma.currentPage.selection.length!==1 || figma.currentPage.selection[0].id!==target.id)throw Error('选择已变化，本次未修改');
if(typeof target.setReactionsAsync!=='function' || !Array.isArray(target.reactions))throw Error('当前图层不支持原型连接');
let sourceFrame=target;
for(let node=target;node && node.type!=='PAGE';node=node.parent){
  if(node.locked || node.visible===false)throw Error('触发区域已锁定或隐藏');
  if(['COMPONENT','COMPONENT_SET'].includes(node.type))throw Error('当前区域属于主组件，请先确认修改范围');
  if(node.parent?.type==='PAGE')sourceFrame=node;
}
const destination=figma.currentPage.children.find(node=>node.id===destinationId);
if(!destination || destination.type!=='FRAME' || destination.removed || destination.visible===false)throw Error('目标需要是当前页可见的顶层Frame');
if(destination.id===sourceFrame.id)throw Error('目标与当前画板相同，请重新确认跳转目的地');
const before=JSON.parse(JSON.stringify(target.reactions));
if(before.some(reaction=>reaction.trigger?.type==='ON_CLICK'))throw Error('已有点击交互，请先明确替换范围');
const action={type:'NODE',destinationId,navigation:'NAVIGATE',transition:null};
await target.setReactionsAsync([...before,{trigger:{type:'ON_CLICK'},actions:[action]}]);
const after=target.reactions,added=after[before.length];
const actual=added?.actions?.[0] || added?.action;
if(after.length!==before.length+1 || JSON.stringify(after.slice(0,before.length))!==JSON.stringify(before) || added?.trigger?.type!=='ON_CLICK' || actual?.type!=='NODE' || actual.destinationId!==destinationId || actual.navigation!=='NAVIGATE')throw Error('原型连接读回不一致，请检查画布');
return {operation:'prototype',changedNodeIds:[target.id],destinationId,interactionReview:'not-run'};
`};
}

export function selectedArrangeEdit(state, operation, mode) {
  if (!state?.connected || state.stale) throw Error('正在重连，稍后再修改');
  const modes = operation === 'align' ? ['left','right','top','bottom','horizontal-center','vertical-center'] : operation === 'distribute' ? ['horizontal','vertical'] : [];
  if (!modes.includes(mode)) throw Error('对齐或分布方向无效');
  const selection = state.context?.selection;
  const minimum = operation === 'align' ? 2 : 3;
  if (!Array.isArray(selection) || selection.length < minimum || selection.length > 100) throw Error('请选中'+minimum+'至100个同一Frame内的图层');
  const parentId = selection[0].parentId;
  if (!parentId || selection.some(node=>node.parentId!==parentId || node.parentType!=='FRAME') || new Set(selection.map(node=>node.id)).size!==selection.length) throw Error('需要同一Frame内的不同图层；请刷新插件上下文');
  // 以共同父Frame保存快照，确保所有被修改的兄弟节点都在证据范围内。
  return { operation:'run', targetNodeId:parentId, code:`
const expectedPage=${JSON.stringify(state.context.pageId)}, ids=${JSON.stringify(selection.map(node=>node.id))};
const operation=${JSON.stringify(operation)}, mode=${JSON.stringify(mode)};
if(target.removed || target.type!=='FRAME' || figma.currentPage.id!==expectedPage)throw Error('目标已变化，本次未修改');
const selected=figma.currentPage.selection;
if(selected.length!==ids.length || selected.some(node=>!ids.includes(node.id)))throw Error('选择已变化，本次未修改');
if(target.layoutMode!=='NONE')throw Error('父容器使用Auto Layout，请调整布局参数');
for(let node=target;node && node.type!=='PAGE';node=node.parent){
  if(node.locked)throw Error('选区祖先已锁定，本次未修改');
  if(['COMPONENT','COMPONENT_SET','INSTANCE'].includes(node.type))throw Error('父容器属于组件，请先确认修改范围');
}
for(const node of selected){
  if(node.removed || node.parent?.id!==target.id || node.locked || node.visible===false || ['COMPONENT','COMPONENT_SET'].includes(node.type))throw Error('选中图层受保护或位置已变化');
  if(!['x','y','width','height','rotation'].every(key=>Number.isFinite(node[key])) || Math.abs(node.rotation)>0.0001 || node.width<=0 || node.height<=0)throw Error('旋转或无效尺寸图层需单独处理');
}
const horizontal=mode==='horizontal' || ['left','right','horizontal-center'].includes(mode);
const axis=horizontal?'x':'y', size=horizontal?'width':'height';
const ordered=[...selected].sort((a,b)=>a[axis]-b[axis] || a.id.localeCompare(b.id));
const start=Math.min(...ordered.map(node=>node[axis])),end=Math.max(...ordered.map(node=>node[axis]+node[size]));
const plan=[];
if(operation==='align'){
  for(const node of ordered){
    const position=['left','top'].includes(mode)?start:['right','bottom'].includes(mode)?end-node[size]:(start+end-node[size])/2;
    plan.push({node,position});
  }
}else{
  const last=ordered[ordered.length-1],lastEdge=last[axis]+last[size];
  if(lastEdge!==end)throw Error('外侧边界顺序不明确，请先调整重叠图层');
  const gap=(end-start-ordered.reduce((sum,node)=>sum+node[size],0))/(ordered.length-1);
  if(gap<0)throw Error('空间不足以等间距分布，请先扩大选区跨度');
  let position=start;
  for(const node of ordered){plan.push({node,position});position+=node[size]+gap;}
}
for(const item of plan)item.node[axis]=item.position;
if(plan.some(item=>!Number.isFinite(item.node[axis]) || Math.abs(item.node[axis]-item.position)>0.001))throw Error('修改后位置读回不一致，请检查画布');
return {operation,mode,changedNodeIds:plan.map(item=>item.node.id),positions:plan.map(item=>({id:item.node.id,x:item.node.x,y:item.node.y}))};
` };
}

export function selectedFontEdit(state, values) {
  if (!state?.connected || state.stale) throw Error('正在重连，稍后再修改');
  const selection = state.context?.selection;
  if (!Array.isArray(selection) || selection.length !== 1 || selection[0].type !== 'TEXT') throw Error('请先在 Figma 中选中一处文字');
  if (!values || !Object.keys(values).length || Object.keys(values).some(key => !['family', 'style', 'size'].includes(key))) throw Error('至少指定字号，或成对指定字体与字重样式');
  if (values.size !== undefined && (!Number.isFinite(values.size) || values.size < 1 || values.size > 1000)) throw Error('字号需为 1–1000');
  if (values.family !== undefined || values.style !== undefined) {
    if (['family', 'style'].some(key => typeof values[key] !== 'string' || !values[key].trim() || values[key].length > 200)) throw Error('family 与 style 需要同时指定非空名称');
  }
  return { operation: 'run', targetNodeId: selection[0].id, code: `
const expectedPage = ${JSON.stringify(state.context.pageId)};
const values = ${JSON.stringify(values)};
function check() {
  if (target.removed || target.type !== 'TEXT' || figma.currentPage.id !== expectedPage || figma.currentPage.selection.length !== 1 || figma.currentPage.selection[0].id !== target.id) throw Error('选择已变化，本次未修改');
  for (let node=target; node && node.type!=='PAGE'; node=node.parent) {
    if (node.locked) throw Error('选中区域已锁定，本次未修改');
    if (['COMPONENT','COMPONENT_SET'].includes(node.type)) throw Error('当前文字属于主组件，请先确认组件修改范围');
  }
  if (target.textStyleId) throw Error('文字已绑定样式或混合样式，请先明确样式修改范围');
  if (!target.fontName || target.fontName===figma.mixed || target.fontSize===figma.mixed) throw Error('混合字体或字号需按文字范围单独处理');
  if (['fontFamily','fontStyle','fontWeight','fontSize'].some(key=>target.boundVariables?.[key])) throw Error('字体已绑定变量，请使用变量调整流程');
  if (values.family && target.fontName.variationSettings) throw Error('可变字体轴需明确处理，当前仅支持保留字体调整字号');
}
function fingerprint() {
  return JSON.stringify({characters:target.characters,fontName:target.fontName,fontSize:target.fontSize,textStyleId:target.textStyleId,boundVariables:target.boundVariables,parentId:target.parent?.id,lineHeight:target.lineHeight,letterSpacing:target.letterSpacing});
}
check();
const before=fingerprint();
const font=values.family ? {family:values.family,style:values.style} : target.fontName;
await figma.loadFontAsync(target.fontName);
if (values.family) await figma.loadFontAsync(font);
check();
if (fingerprint()!==before) throw Error('字体加载期间文字或样式已变化，本次未覆盖');
if (values.family) target.fontName=font;
if (values.size!==undefined) target.fontSize=values.size;
const after={fontName:target.fontName,fontSize:target.fontSize};
if ((values.family && (after.fontName.family!==font.family || after.fontName.style!==font.style)) || (values.size!==undefined && (!Number.isFinite(after.fontSize) || Math.abs(after.fontSize-values.size)>0.001))) throw Error('修改后字体读回不一致，请检查画布');
return {changedNodeIds:[target.id],operation:'font',after};
` };
}

export function selectedFillEdit(state, hex) {
  if (!state?.connected || state.stale) throw Error('正在重连，稍后再修改');
  const selection = state.context?.selection;
  const types = ['FRAME', 'RECTANGLE', 'ELLIPSE', 'VECTOR', 'TEXT', 'INSTANCE'];
  if (!Array.isArray(selection) || selection.length !== 1 || !types.includes(selection[0].type)) throw Error('请先选中一个可填充的图层');
  return fillOperation({ targetId: selection[0].id, pageId: state.context.pageId, type: selection[0].type, requireSelection: true }, hex);
}

export function selectedLayoutEdit(state, values) {
  if (!state?.connected || state.stale) throw Error('正在重连，稍后再修改');
  const selection = state.context?.selection;
  if (!Array.isArray(selection) || selection.length !== 1 || selection[0].type !== 'FRAME') throw Error('请先在 Figma 中选中一个独立 Frame');
  const entries = Object.entries(values || {});
  if (!entries.length) throw Error('至少指定 width、height、gap 或 padding 中的一项');
  for (const [key, value] of entries) {
    const size = ['width', 'height'].includes(key);
    if (!['width', 'height', 'gap', 'padding'].includes(key) || !Number.isFinite(value) || value < (size ? 0.01 : 0) || value > (size ? 100000 : 10000)) throw Error('布局参数无效：尺寸需为 0.01–100000，间距需为 0–10000');
  }
  return { operation: 'run', targetNodeId: selection[0].id, code: `
const expectedPage = ${JSON.stringify(state.context.pageId)};
const values = ${JSON.stringify(values)};
if (target.removed || target.type !== 'FRAME' || figma.currentPage.id !== expectedPage || figma.currentPage.selection.length !== 1 || figma.currentPage.selection[0].id !== target.id) throw Error('选择已变化，本次未修改');
for (let node = target; node && node.type !== 'PAGE'; node = node.parent) {
  if (node.locked) throw Error('选中区域已锁定，本次未修改');
  if (['COMPONENT', 'COMPONENT_SET', 'INSTANCE'].includes(node.type)) throw Error('当前区域属于组件，请先确认组件修改范围');
}
if ((values.gap !== undefined || values.padding !== undefined) && !['HORIZONTAL', 'VERTICAL'].includes(target.layoutMode)) throw Error('间距仅用于已有的水平或垂直 Auto Layout');
if (values.width !== undefined && ['HUG', 'FILL'].includes(target.layoutSizingHorizontal)) throw Error('宽度受自动布局控制，请先明确尺寸模式');
if (values.height !== undefined && ['HUG', 'FILL'].includes(target.layoutSizingVertical)) throw Error('高度受自动布局控制，请先明确尺寸模式');
if (values.width !== undefined || values.height !== undefined) target.resize(values.width ?? target.width, values.height ?? target.height);
if (values.gap !== undefined) target.itemSpacing = values.gap;
if (values.padding !== undefined) for (const key of ['paddingTop','paddingRight','paddingBottom','paddingLeft']) target[key] = values.padding;
const after = { width: target.width, height: target.height, gap: target.itemSpacing, paddingTop: target.paddingTop, paddingRight: target.paddingRight, paddingBottom: target.paddingBottom, paddingLeft: target.paddingLeft };
for (const [key, value] of Object.entries(values)) {
  const keys = key === 'padding' ? ['paddingTop','paddingRight','paddingBottom','paddingLeft'] : [key];
  if (keys.some(k => Math.abs(after[k] - value) > 0.001 || !Number.isFinite(after[k]))) throw Error('修改后布局读回不一致，请检查画布');
}
return { changedNodeIds: [target.id], operation: 'layout', after };
` };
}

export function selectedTextEdit(state, text) {
  if (!state?.connected || state.stale) throw Error('正在重连，稍后再修改');
  const selection = state.context?.selection;
  if (!Array.isArray(selection) || selection.length !== 1 || selection[0].type !== 'TEXT') throw Error('请先在 Figma 中选中一处文字');
  return textOperation({ targetId: selection[0].id, pageId: state.context.pageId, requireSelection: true }, text);
}
