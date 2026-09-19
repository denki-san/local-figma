// 只覆盖当前实例的文字或布尔属性，主组件与其它实例保持只读。
export function selectedInstanceProperty(state, property, value) {
  if (!state?.connected || state.stale) throw Error('正在重连，稍后再修改');
  const selection=state.context?.selection;
  if (!Array.isArray(selection)||selection.length!==1||selection[0].type!=='INSTANCE') throw Error('请选中一个独立组件实例');
  if (typeof property!=='string'||!property.trim()||property.length>300||typeof value!=='string'||value.length>10000) throw Error('需要完整属性名和有效属性值');
  return {operation:'run',targetNodeId:selection[0].id,code:`
const property=${JSON.stringify(property)},raw=${JSON.stringify(value)},pageId=${JSON.stringify(state.context.pageId)};
function check(){
 if(target.removed||target.type!=='INSTANCE'||figma.currentPage.id!==pageId||figma.currentPage.selection.length!==1||figma.currentPage.selection[0].id!==target.id)throw Error('选择已变化，本次未修改');
 for(let n=target;n&&n.type!=='PAGE';n=n.parent){
  if(n.locked||n.visible===false)throw Error('实例或祖先已锁定或隐藏');
  if(n!==target&&['INSTANCE','COMPONENT','COMPONENT_SET'].includes(n.type))throw Error('嵌套或共享定义需要单独确认');
 }
 if(target.parent?.type!=='PAGE'&&!(target.parent?.type==='FRAME'&&target.parent.layoutMode==='NONE'))throw Error('属性变化可能重排选区外布局，请选择独立实例');
 const pending=[target];let count=0;
 while(pending.length){const n=pending.pop();if(++count>2000||n.locked)throw Error('实例过大或包含锁定图层');if(n.children)pending.push(...n.children);}
}
check();
const before=JSON.stringify(target.componentProperties),props=JSON.parse(before);
if(!Object.hasOwn(props,property))throw Error('属性不存在，请使用读回的完整属性名');
const current=props[property];
if(!['TEXT','BOOLEAN'].includes(current.type)||typeof current.value==='object'||current.boundVariables?.value)throw Error('首版仅支持未绑定变量的文字和布尔属性');
if(current.type==='BOOLEAN'&&!['true','false'].includes(raw))throw Error('布尔属性只接受true或false');
const value=current.type==='BOOLEAN'?raw==='true':raw;
const main=await target.getMainComponentAsync();
check();if(!main||main.removed)throw Error('主组件不可用');
const fonts=new Map();
if(current.type==='TEXT')for(const t of target.findAllWithCriteria({types:['TEXT']})){
 if(t.hasMissingFont)throw Error('实例包含缺失字体');
 for(const run of t.getStyledTextSegments(['fontName']))fonts.set(JSON.stringify(run.fontName),run.fontName);
}
for(const font of fonts.values())await figma.loadFontAsync(font);
const linked=await target.getMainComponentAsync();
check();if(linked?.id!==main.id||JSON.stringify(target.componentProperties)!==before)throw Error('等待期间组件或属性变化，本次未修改');
if(current.value===value)return {operation:'props',changedNodeIds:[],property,value,unchanged:true};
target.setProperties({[property]:value});
const after=target.componentProperties;
if(after[property]?.value!==value||Object.keys(after).length!==Object.keys(props).length||Object.keys(props).some(k=>k!==property&&JSON.stringify(after[k])!==JSON.stringify(props[k])))throw Error('属性读回不一致，请检查实例，禁止直接重试');
return {operation:'props',changedNodeIds:[target.id],property,value,componentId:main.id,visualReview:'not-run'};
`};
}
