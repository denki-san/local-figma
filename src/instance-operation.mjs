import { isNodeId } from './node-id.mjs';

// 复用已确认的同页主组件；来源只读，写入范围为当前选中的独立 Frame。
export function selectedInstanceCreate(state, componentId) {
  if (!state?.connected || state.stale) throw Error('正在重连，稍后再修改');
  const selection = state.context?.selection;
  if (!Array.isArray(selection) || selection.length !== 1 || selection[0].type !== 'FRAME') throw Error('请选中用于放置实例的独立 Frame');
  if (!isNodeId(componentId)) throw Error('Agent需要提供已确认的本地主组件ID');
  return {operation: 'run', targetNodeId: selection[0].id, code: `
const pageId=${JSON.stringify(state.context.pageId)},componentId=${JSON.stringify(componentId)};
function checkTarget(){
  if(target.removed || target.type!=='FRAME' || figma.currentPage.id!==pageId || figma.currentPage.selection.length!==1 || figma.currentPage.selection[0].id!==target.id)throw Error('选择已变化，本次未创建');
  for(let node=target;node && node.type!=='PAGE';node=node.parent){
    if(node.locked || node.visible===false)throw Error('目标区域已锁定或隐藏');
    if(['COMPONENT','COMPONENT_SET','INSTANCE'].includes(node.type))throw Error('目标属于组件，请先确认修改范围');
  }
}
checkTarget();
const component=await figma.getNodeByIdAsync(componentId);
checkTarget();
if(!component || component.removed || component.type!=='COMPONENT' || component.remote)throw Error('需要已存在的本地主组件');
let sourcePage=component;
for(;sourcePage && sourcePage.type!=='PAGE';sourcePage=sourcePage.parent){
  if(sourcePage.id===target.id)throw Error('主组件位于目标内部，请选择独立放置区域');
}
if(sourcePage?.id!==pageId)throw Error('主组件需要位于当前页面');
if(!Number.isFinite(component.width) || !Number.isFinite(component.height) || component.width<=0 || component.height<=0)throw Error('主组件尺寸无效');
let position=null;
if(target.layoutMode==='NONE'){
  const children=target.children;
  if(children.some(n=>!Number.isFinite(n.y) || !Number.isFinite(n.height) || Math.abs(n.rotation)>0.0001))throw Error('目标内有旋转或无效位置图层，请先明确放置位置');
  const y=children.length?Math.max(0,...children.map(n=>n.y+n.height))+16:0;
  if(component.width>target.width || y+component.height>target.height)throw Error('目标空间不足，请先调整画板尺寸或使用Auto Layout');
  position={x:0,y};
}else if(!['HORIZONTAL','VERTICAL'].includes(target.layoutMode))throw Error('当前布局模式需要明确放置方式');
else{
  // Hug 容器可能改变外层布局；局部目标快照不能涵盖外层兄弟的重排。
  const canResize=target.primaryAxisSizingMode==='AUTO' || target.counterAxisSizingMode==='AUTO' || target.layoutSizingHorizontal==='HUG' || target.layoutSizingVertical==='HUG';
  if(canResize && target.parent?.type!=='PAGE' && !(target.parent?.type==='FRAME' && target.parent.layoutMode==='NONE'))throw Error('实例追加可能改变选区外布局，请选择独立画板或固定容器尺寸');
  const pending=[...target.children];
  for(let count=0;pending.length;count++){
    if(count>=2000)throw Error('容器子树过大，请缩小放置范围');
    const node=pending.pop();
    if(node.locked || ['COMPONENT','COMPONENT_SET'].includes(node.type))throw Error('自动布局包含锁定图层或主组件，追加可能移动受保护内容');
    if(node.children)pending.push(...node.children);
  }
}
const previousIds=target.children.map(n=>n.id);
const instance=component.createInstance();
target.appendChild(instance);
if(position){instance.x=position.x;instance.y=position.y;}
const linked=await instance.getMainComponentAsync();
if(instance.removed || instance.parent?.id!==target.id || linked?.id!==componentId || target.children.length!==previousIds.length+1 || previousIds.some((id,i)=>target.children[i].id!==id))throw Error('实例创建后读回不一致，请检查画布，禁止直接重试');
return {operation:'instance',createdNodeIds:[instance.id],changedNodeIds:[target.id],componentId,parentId:target.id,visualReview:'not-run',placement:position || 'auto-layout-append'};
`};
}
