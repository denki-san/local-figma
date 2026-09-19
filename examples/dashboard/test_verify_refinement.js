// 只读检查当前对照；历史主组件保护仍需修改前后独立快照。
const page=figma.currentPage;
if(target.type!=='FRAME' || target.name!=='test_refine_public｜指标文案对比' || target.parent!==page)throw Error('请选择公开精修对比画板');
function unique(nodes,name,type){const found=nodes.filter(node=>node.name===name && node.type===type);if(found.length!==1)throw Error('需要唯一节点：'+name);return found[0];}
const root=unique(page.children,'test_dashboard_public｜任务运行概览·7天','FRAME');
const source=unique(root.findAllWithCriteria({types:['INSTANCE']}),'完成任务','INSTANCE');
const baseline=unique(target.children,'test_refine_public｜修改前','INSTANCE');
const candidate=unique(target.children,'test_refine_public｜修改后','INSTANCE');
const main=unique(page.children,'test_dashboard_public｜指标卡片','COMPONENT');
for(const instance of [source,baseline,candidate]){
  if((await instance.getMainComponentAsync())?.id!==main.id)throw Error('实例已脱离预期主组件');
  if(instance.children.length!==3 || instance.children.some(node=>node.type!=='TEXT' || node.hasMissingFont))throw Error('文字结构或字体不完整');
}
const expectedBefore=['完成任务','1,248','较上期增加 12.5%'];
const expectedAfter=['已完成任务','1,248','对比上期，增长 12.5%'];
const encode=value=>JSON.stringify(value,(_,item)=>typeof item==='symbol'?'MIXED':item);
for(const [instance,expected] of [[source,expectedBefore],[baseline,expectedBefore],[candidate,expectedAfter]]){
  if(encode(instance.children.map(node=>node.characters))!==encode(expected))throw Error('文案不符合预期：'+instance.name);
}
const fields=['type','width','height','rotation','visible','locked','opacity','layoutMode','primaryAxisSizingMode','counterAxisSizingMode','primaryAxisAlignItems','counterAxisAlignItems','layoutSizingHorizontal','layoutSizingVertical','itemSpacing','paddingTop','paddingRight','paddingBottom','paddingLeft','fills','strokes','strokeWeight','strokeAlign','effects','cornerRadius','clipsContent','constraints','fontName','fontSize','lineHeight','letterSpacing','textAutoResize','textTruncation','maxLines','textAlignHorizontal','textAlignVertical','paragraphSpacing','textStyleId','fillStyleId','strokeStyleId','effectStyleId','boundVariables','reactions'];
function properties(node,depth=0){
  const value={};for(const field of fields)if(field in node)value[field]=node[field];
  if(depth){value.x=node.x;value.y=node.y;value.name=node.name;}
  if('children' in node)value.children=node.children.map(child=>properties(child,depth+1));
  return value;
}
if(encode(properties(source))!==encode(properties(baseline)) || encode(properties(baseline))!==encode(properties(candidate)))throw Error('两处文案以外的受检属性发生变化');
for(const instance of [baseline,candidate])for(const node of instance.children){
  if(node.x<0 || node.y<0 || node.x+node.width>instance.width+0.01 || node.y+node.height>instance.height+0.01)throw Error('文字越出卡片边界');
}
return {structurePassed:true,componentLinksVerified:true,sourceMatchesBaseline:true,onlyExpectedTextChanges:true,comparedFields:fields,mainId:main.id,visualReviewRequired:true,historicalMasterProtection:'requires-independent-before-after-snapshots'};
