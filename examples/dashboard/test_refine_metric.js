// 公开精修用例：仅修改新建副本内的实例覆盖，原实例和主组件保留。
if(target.type!=='FRAME' || target.name!=='test_dashboard_public｜任务运行概览·7天' || target.parent!==figma.currentPage)throw Error('请使用公开示例的7天画板');
const page=figma.currentPage,name='test_refine_public｜指标文案对比';
if(page.children.some(node=>node.name===name))throw Error('对比用例已存在，请先读回，禁止重复创建');
const candidates=target.findAllWithCriteria({types:['INSTANCE']}).filter(node=>node.name==='完成任务');
if(candidates.length!==1)throw Error('需要唯一完成任务实例');
const source=candidates[0],main=await source.getMainComponentAsync();
if(!main || main.name!=='test_dashboard_public｜指标卡片')throw Error('组件来源不匹配');
const children=source.children;
if(children.length!==3 || children.some(node=>node.type!=='TEXT') || children[0].characters!=='完成任务' || children[2].characters!=='较上期增加 12.5%')throw Error('实例结构已变化');
const original=children.map(node=>node.characters),master=main.children.map(node=>node.characters);
for(const font of children.map(node=>node.fontName)){
  if(font===figma.mixed)throw Error('混合字体需另行处理');
  await figma.loadFontAsync(font);
}
await figma.loadFontAsync({family:'PingFang SC',style:'Regular'});
if(source.removed || main.removed || JSON.stringify(source.children.map(node=>node.characters))!==JSON.stringify(original))throw Error('字体加载期间来源变化');
const board=figma.createFrame();board.name=name;board.resize(652,246);board.x=Math.max(...page.children.filter(node=>node!==board).map(node=>node.x+node.width))+160;board.y=0;
const baseline=source.clone(),candidate=source.clone();board.appendChild(baseline);board.appendChild(candidate);
baseline.name='test_refine_public｜修改前';candidate.name='test_refine_public｜修改后';baseline.x=32;candidate.x=342;baseline.y=candidate.y=72;
for(const [value,x] of [['修改前 · 保留基线',32],['修改后 · 仅实例文案',342]]){
  const label=figma.createText();board.appendChild(label);label.fontName={family:'PingFang SC',style:'Regular'};label.fontSize=14;label.characters=value;label.x=x;label.y=28;
}
candidate.children[0].characters='已完成任务';candidate.children[2].characters='对比上期，增长 12.5%';
if(JSON.stringify(source.children.map(node=>node.characters))!==JSON.stringify(original) || JSON.stringify(main.children.map(node=>node.characters))!==JSON.stringify(master))throw Error('来源保护检查失败，请保留现场核验');
if((await candidate.getMainComponentAsync())?.id!==main.id || (await baseline.getMainComponentAsync())?.id!==main.id)throw Error('组件关系不一致');
page.selection=[board];figma.viewport.scrollAndZoomIntoView([board]);
return {board:board.id,baseline:baseline.id,candidate:candidate.id,source:source.id,main:main.id,sourceTextPreserved:true,masterTextPreserved:true,visualReviewRequired:true};
