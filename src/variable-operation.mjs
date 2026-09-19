// 只将已有颜色变量绑定到选区，不创建、导入或修改共享变量。
export function selectedFillVariable(state, variableId) {
  if (!state?.connected || state.stale) throw Error('正在重连，稍后再修改');
  const selection=state.context?.selection;
  const types=['FRAME','RECTANGLE','ELLIPSE','VECTOR','TEXT','INSTANCE'];
  if(!Array.isArray(selection)||selection.length!==1||!types.includes(selection[0].type))throw Error('请选择一个可填充图层');
  if(typeof variableId!=='string'||!variableId.trim()||variableId.length>300)throw Error('Agent需要提供已确认的颜色变量ID');
  return {operation:'run',targetNodeId:selection[0].id,code:`
const variableId=${JSON.stringify(variableId)},pageId=${JSON.stringify(state.context.pageId)};
const ancestorIds=()=>{const ids=[];for(let n=target;n;n=n.parent)ids.push(n.id);return JSON.stringify(ids);};
const originalAncestors=ancestorIds();
function check(){
 if(ancestorIds()!==originalAncestors)throw Error('祖先范围已变化，本次未修改');
 if(target.removed||figma.currentPage.id!==pageId||figma.currentPage.selection.length!==1||figma.currentPage.selection[0].id!==target.id)throw Error('选择已变化，本次未修改');
 for(let node=target;node&&node.type!=='PAGE';node=node.parent){
  if(node.locked||node.visible===false)throw Error('目标或祖先已锁定或隐藏');
  if(['COMPONENT','COMPONENT_SET'].includes(node.type))throw Error('共享组件定义需要单独确认');
 }
 if(target.fillStyleId)throw Error('填充已绑定样式，请先明确替换范围');
 if(!Array.isArray(target.fills)||target.fills.length!==1||target.fills[0].type!=='SOLID'||target.fills[0].visible===false)throw Error('首版仅支持单个可见纯色填充');
}
const fingerprint=()=>JSON.stringify({fills:target.fills,fillStyleId:target.fillStyleId,parentId:target.parent?.id,characters:target.characters,fontName:target.fontName});
check();const before=fingerprint();
const variable=await figma.variables.getVariableByIdAsync(variableId);
check();if(!variable||variable.resolvedType!=='COLOR')throw Error('颜色变量不存在或类型不匹配');
if(target.type==='TEXT'){
 if(target.hasMissingFont)throw Error('文字存在缺失字体');
 const fonts=new Map();for(const run of target.getStyledTextSegments(['fontName']))fonts.set(JSON.stringify(run.fontName),run.fontName);
 for(const font of fonts.values())await figma.loadFontAsync(font);
}
check();if(before!==fingerprint())throw Error('等待期间填充或目标发生变化，本次未修改');
const resolved=variable.resolveForConsumer(target);
if(resolved.resolvedType!=='COLOR'||!resolved.value||['r','g','b'].some(k=>!Number.isFinite(resolved.value[k])))throw Error('变量在当前模式下无法解析为颜色');
if(target.fills[0].boundVariables?.color?.id===variable.id)return {operation:'bind-fill',changedNodeIds:[],variableId:variable.id,unchanged:true};
const paint=figma.variables.setBoundVariableForPaint(target.fills[0],'color',variable);
target.fills=[paint];
const actual=target.fills[0];
if(target.fills.length!==1||actual.type!=='SOLID'||actual.boundVariables?.color?.id!==variable.id||['opacity','blendMode','visible'].some(k=>actual[k]!==paint[k]))throw Error('变量绑定读回不一致，请检查画布，禁止直接重试');
return {operation:'bind-fill',changedNodeIds:[target.id],variableId:variable.id,variableName:variable.name,resolvedColor:resolved.value,visualReview:'not-run'};
`};
}
