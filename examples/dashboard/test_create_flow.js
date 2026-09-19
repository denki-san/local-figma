// 公开合成流程：原生说明页、滚动区、确认变体、弹层与返回；保留锚点和既有流程。
const page=figma.currentPage,prefix='test_public_flow｜';
if(target.type!=='FRAME'||target.parent?.id!==page.id)throw Error('请选择同页独立Frame作为锚点');
const check=()=>{if(figma.currentPage!==page||target.removed||target.parent?.id!==page.id||page.children.some(n=>n.name.startsWith(prefix)))throw Error('目标变化或已有同名流程，请先读回');};
check();
await Promise.all(['Regular','Semibold'].map(style=>figma.loadFontAsync({family:'PingFang SC',style})));
check();
const color=hex=>({r:parseInt(hex.slice(0,2),16)/255,g:parseInt(hex.slice(2,4),16)/255,b:parseInt(hex.slice(4,6),16)/255});
const paint=hex=>[{type:'SOLID',color:color(hex)}];
const right=Math.max(...page.children.map(n=>n.x+n.width))+160;
function frame(parent,name,x,y,w,h,fill='FFFFFF'){
 const n=figma.createFrame();parent.appendChild(n);n.name=name;n.resize(w,h);n.x=x;n.y=y;n.fills=paint(fill);n.clipsContent=true;return n;
}
function text(parent,name,value,x,y,w,size=16,strong=false){
 const n=figma.createText();parent.appendChild(n);n.name=name;n.fontName={family:'PingFang SC',style:strong?'Semibold':'Regular'};n.fontSize=size;n.lineHeight={unit:'PIXELS',value:size*1.5};n.characters=value;n.resize(w,size*1.5);n.textAutoResize='HEIGHT';n.x=x;n.y=y;n.fills=paint('1D2129');return n;
}
function button(parent,label,x,y,w=160,enabled=true){
 const n=frame(parent,label,x,y,w,44,enabled?'3366FF':'DDE3EE');n.cornerRadius=8;
 const t=text(n,'按钮文字',label,0,10,w,16,true);t.textAlignHorizontal='CENTER';t.fills=paint(enabled?'FFFFFF':'667085');return n;
}
const click=(n,a)=>n.setReactionsAsync([{trigger:{type:'ON_CLICK'},actions:[a]}]);
const destination=(n,navigation='NAVIGATE')=>({type:'NODE',destinationId:n.id,navigation,transition:null});
const home=frame(page,prefix+'首页',right,0,960,720,'F7F9FC');
const detail=frame(page,prefix+'说明',right+1120,0,960,720,'F7F9FC');
const done=frame(page,prefix+'结果',right+2240,0,960,720,'F7F9FC');
for(const root of [home,detail,done])text(root,'模拟标记','LOCAL FIGMA · 公开合成原型 · 不连接业务服务',40,24,880,13);
text(home,'标题','把资料整理成一份清晰的周报',40,100,840,32,true);
text(home,'说明','一个完整的模拟流程：阅读说明、确认范围、查看结果。',40,162,840);
const card=frame(home,'任务卡片',40,240,880,208);card.cornerRadius=16;
text(card,'任务名称','周报资料整理',28,28,800,24,true);
text(card,'任务介绍','汇总合成资料并生成演示结果。可随时取消，不读取真实文件。',28,82,800);
const entry=button(card,'查看工作说明',28,136,180);
await click(entry,destination(detail));
text(detail,'标题','工作说明',40,80,780,28,true);
const close=button(detail,'返回首页',760,76,160);await click(close,{type:'BACK'});
const scroll=frame(detail,'说明滚动区',40,144,880,432);scroll.cornerRadius=12;scroll.overflowDirection='VERTICAL';
for(let i=0;i<6;i++){
 text(scroll,`章节${i+1}`,`${i+1}. ${['输入范围','整理方式','输出结构','人工检查','取消与返回','演示边界'][i]}`,24,24+i*140,820,20,true);
 text(scroll,`正文${i+1}`,'本示例使用公开合成内容，保留原生文字与可编辑结构。\n这里只演示界面流程，不上传文件、不连接账号、不执行后台业务。',24,64+i*140,820,16);
}
const footer=frame(detail,'固定操作区',40,600,880,80);footer.cornerRadius=12;
text(footer,'底部提示','阅读完成后，可打开确认弹层。',24,28,600,14);
const start=button(footer,'开始模拟',696,18,160);
text(done,'标题','模拟任务已创建',40,112,840,32,true);
text(done,'结果说明','你已完成交互演示。没有提交账号、处理真实资料或启动后台任务。',40,184,840);
const back=button(done,'返回工作说明',40,280,180);await click(back,{type:'BACK'});
const restart=button(done,'返回首页',244,280,160);await click(restart,destination(home));
const variants=[false,true].map(checked=>{
 const n=figma.createComponent();page.appendChild(n);n.name=`确认=${checked?'是':'否'}`;n.resize(480,280);n.fills=paint('FFFFFF');n.cornerRadius=12;return n;
});
const states=figma.combineAsVariants(variants,page);states.name=prefix+'确认组件';states.x=right;states.y=900;
const controls=[];
for(const [i,variant] of variants.entries()){
 variant.x=16+i*512;variant.y=16;
 text(variant,'弹层标题','确认模拟范围',24,24,432,24,true);
 text(variant,'弹层说明','不上传文件，不连接真实业务。',24,70,432,16);
 const toggle=button(variant,i?'已确认，点击取消确认':'点击确认模拟范围',24,124,432,!!i);
 const cancel=button(variant,'取消',232,212,96);await click(cancel,{type:'CLOSE'});
 const submit=button(variant,'确认开始',344,212,112,!!i);
 await click(toggle,destination(variants[1-i],'CHANGE_TO'));
 if(i)await click(submit,destination(done));
 controls.push({toggle:toggle.id,cancel:cancel.id,submit:submit.id});
}
const overlay=frame(page,prefix+'弹层',right+2240,900,480,280);overlay.cornerRadius=12;
const instance=variants[0].createInstance();overlay.appendChild(instance);instance.x=0;instance.y=0;
// 真实案例曾遇到继承切换未生效，在初始实例触发区显式关联目标变体。
await click(instance.findOne(n=>n.type==='FRAME'&&n.name==='点击确认模拟范围'),destination(variants[1],'CHANGE_TO'));
await click(start,{...destination(overlay,'OVERLAY'),resetInteractiveComponents:true});
const createdRoots=new Set([home.id,detail.id,done.id,overlay.id,states.id]);
page.flowStartingPoints=[...(page.flowStartingPoints||[]).filter(f=>!createdRoots.has(f.nodeId)),{nodeId:home.id,name:'test_公开流程｜阅读与确认'}];
return {home:home.id,detail:detail.id,done:done.id,overlay:overlay.id,states:states.id,scroll:scroll.id,footer:footer.id,controls,realClicksRequired:true};
