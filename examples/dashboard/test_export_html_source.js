// 只读导出公开合成案例；输出使用局部逻辑标识，避免携带真实文件与节点ID。
const names=['test_dashboard_public｜任务运行概览·7天','test_dashboard_public｜任务运行概览·30天','test_dashboard_public｜模拟运行详情'];
const roots=names.map(name=>{const matches=figma.currentPage.children.filter(n=>n.name===name && n.type==='FRAME');if(matches.length!==1)throw Error('需要唯一公开案例画板：'+name);return matches[0];});
if(target.id!==roots[0].id)throw Error('请绑定公开案例7天画板');
let count=0;
function paints(value){
  if(!Array.isArray(value))throw Error('不支持混合填充');
  const visible=value.filter(p=>p.visible!==false);
  if(visible.some(p=>p.type!=='SOLID') || visible.length>1)throw Error('公开HTML案例仅支持单层纯色');
  return visible.map(p=>({color:{r:p.color.r,g:p.color.g,b:p.color.b},opacity:p.opacity??1}));
}
function serialize(node,key,root=false){
  if(++count>1000)throw Error('公开案例超出节点预算');
  if(!['FRAME','INSTANCE','TEXT'].includes(node.type))throw Error('不支持的案例图层类型：'+node.type);
  if(node.visible===false)throw Error('公开案例存在隐藏层，请先明确导出范围');
  if(Math.abs(node.rotation)>0.001 || (node.effects||[]).some(e=>e.visible!==false))throw Error('旋转或效果尚未包含在此公开案例转换中');
  const value={key,type:node.type,name:node.name,x:root?0:node.x,y:root?0:node.y,width:node.width,height:node.height,opacity:node.opacity,clipsContent:node.clipsContent===true,fills:paints(node.fills),strokes:paints(node.strokes),strokeWeight:node.strokeWeight,strokeAlign:node.strokeAlign,radii:['topLeftRadius','topRightRadius','bottomRightRadius','bottomLeftRadius'].map(k=>Number.isFinite(node[k])?node[k]:0)};
  if(node.type==='TEXT'){
    if(node.hasMissingFont || node.fontName===figma.mixed || node.fontSize===figma.mixed || node.lineHeight===figma.mixed || node.letterSpacing===figma.mixed)throw Error('缺失或混合字体、行高、字距需要单独处理');
    Object.assign(value,{characters:node.characters,fontName:{family:node.fontName.family,style:node.fontName.style},fontSize:node.fontSize,lineHeight:node.lineHeight,letterSpacing:node.letterSpacing,textAlignHorizontal:node.textAlignHorizontal});
  }else value.children=node.children.map((child,index)=>serialize(child,key+'.'+index));
  return value;
}
return {format:'public-dashboard-v1',scope:'固定桌面公开合成案例',views:roots.map((root,index)=>serialize(root,['week','month','detail'][index],true)),count,limitations:['只支持本例纯色原生结构','固定视口','交互由案例专用HTML逻辑实现并须实点验收']};
