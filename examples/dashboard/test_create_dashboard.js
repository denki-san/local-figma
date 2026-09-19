// 视觉层级参考：https://ui.shadcn.com/examples/dashboard 。使用合成数据独立实现，不含私有设计资产。
// 依据公开 Dashboard 信息层级创建合成任务概览；全部图形为原生节点。
if(target.type!=='FRAME'||target.parent.type!=='PAGE')throw Error('请绑定同页独立验收画板');
const page=figma.currentPage;
if(page.children.some(n=>n.name==='test_dashboard_public｜任务运行概览·7天'))throw Error('案例已存在，先读回，禁止重复创建');
for(const style of ['Regular','Medium','Semibold'])await figma.loadFontAsync({family:'PingFang SC',style});
const C={ink:'#1D2129',muted:'#667085',blue:'#3370FF',line:'#E5E8EF',bg:'#F7F9FC',white:'#FFFFFF',green:'#16835D',red:'#C84646',pale:'#EDF3FF'};
const color=h=>({r:parseInt(h.slice(1,3),16)/255,g:parseInt(h.slice(3,5),16)/255,b:parseInt(h.slice(5,7),16)/255});
const fills=h=>[{type:'SOLID',color:color(h)}];
function frame(parent,name,x,y,w,h,fill=C.white){const n=figma.createFrame();parent.appendChild(n);n.name=name;n.resize(w,h);n.x=x;n.y=y;n.fills=fills(fill);n.clipsContent=false;return n;}
function text(parent,value,x,y,w,size=14,fill=C.ink,style='Regular'){const n=figma.createText();parent.appendChild(n);n.name=value;n.fontName={family:'PingFang SC',style};n.fontSize=size;n.lineHeight={unit:'PIXELS',value:Math.round(size*1.5)};n.characters=value;n.textAutoResize='HEIGHT';n.resize(w,n.height);n.x=x;n.y=y;n.fills=fills(fill);return n;}
function border(n,r=10){n.cornerRadius=r;n.strokes=fills(C.line);n.strokeWeight=1;}
function button(parent,label,x,y,w,active=false){const n=frame(parent,label,x,y,w,36,active?C.blue:C.white);border(n,6);if(active)n.strokes=[];text(n,label,12,8,w-24,13,active?C.white:C.muted,'Medium');return n;}
function line(parent,x,y,w){return frame(parent,'分隔线',x,y,w,1,C.line);}
const origin=Math.max(...page.children.map(n=>n.x+n.width))+160;
const root=frame(page,'test_dashboard_public｜任务运行概览·7天',origin,0,1440,1024,C.bg);root.clipsContent=true;
const sidebar=frame(root,'工作区导航',0,0,216,1024);line(sidebar,215,0,1).resize(1,1024);
const mark=frame(sidebar,'工作区标记',24,25,30,30,C.blue);mark.cornerRadius=8;text(mark,'工',7,4,20,16,C.white,'Semibold');text(sidebar,'任务工作台',66,27,130,18,C.ink,'Semibold');
text(sidebar,'工作空间',24,94,160,12,C.muted);
for(const [i,label] of ['运行概览','任务列表','自动化流程','成员与权限'].entries()){
 const nav=frame(sidebar,label,16,126+i*48,184,40,i===0?C.pale:C.white);nav.cornerRadius=6;
 const dot=frame(nav,'导航标记',14,15,10,10,i===0?C.blue:C.line);dot.cornerRadius=3;text(nav,label,38,9,132,14,i===0?C.blue:C.muted,i===0?'Medium':'Regular');
}
text(sidebar,'演示工作区',24,902,160,13,C.ink,'Medium');text(sidebar,'合成数据 · 不连接业务服务',24,930,172,11,C.muted);line(sidebar,24,976,168);text(sidebar,'本地原型 / 只读演示',24,992,174,11,C.muted);
const header=frame(root,'顶部栏',216,0,1224,72);text(header,'工作空间  /  运行概览',32,25,560,14,C.muted);text(header,'全部数据均为模拟',1008,25,190,12,C.muted);line(header,0,71,1224);
const body=frame(root,'概览内容',248,104,1160,872,C.bg);body.layoutMode='VERTICAL';body.primaryAxisSizingMode='AUTO';body.counterAxisSizingMode='FIXED';body.itemSpacing=24;
const intro=frame(body,'页面标题',0,0,1160,66,C.bg);text(intro,'任务运行概览',0,0,780,28,C.ink,'Semibold');text(intro,'查看运行趋势，及时处理需要关注的任务。',0,46,780,14,C.muted);text(intro,'更新于 09:41 · 示例数据',930,12,230,12,C.muted);
const cards=frame(body,'核心指标',0,0,1160,142,C.bg);cards.layoutMode='HORIZONTAL';cards.primaryAxisSizingMode='FIXED';cards.counterAxisSizingMode='FIXED';cards.itemSpacing=16;
const stat=figma.createComponent();page.appendChild(stat);stat.name='test_dashboard_public｜指标卡片';stat.resize(278,142);stat.x=origin;stat.y=1120;stat.fills=fills(C.white);border(stat);stat.layoutMode='VERTICAL';stat.primaryAxisSizingMode='FIXED';stat.counterAxisSizingMode='FIXED';stat.paddingLeft=20;stat.paddingRight=20;stat.paddingTop=16;stat.paddingBottom=16;stat.itemSpacing=6;
text(stat,'指标名称',0,0,238,13,C.muted);text(stat,'0',0,0,238,30,C.ink,'Semibold');text(stat,'指标说明',0,0,238,12,C.muted);
const metrics=[['完成任务','1,248','较上期增加 12.5%'],['成功率','98.6%','较上期提升 0.8 个百分点'],['平均耗时','2.4 分钟','较上期缩短 0.3 分钟'],['待处理','6','需要你检查的异常任务']];
for(const data of metrics){const n=stat.createInstance();cards.appendChild(n);n.name=data[0];n.children.forEach((t,i)=>{t.characters=data[i];});}
const chart=frame(body,'运行趋势',0,0,1160,280);border(chart);text(chart,'任务完成趋势',24,20,600,17,C.ink,'Medium');text(chart,'按日统计 · 单位：次',24,49,600,12,C.muted);
const seven=button(chart,'近 7 天',932,22,88,true),thirty=button(chart,'近 30 天',1030,22,106);
for(let i=0;i<4;i++){const y=100+i*42;line(chart,62,y,1068);text(chart,String(240-i*80),20,y-9,36,11,C.muted);}
const values=[144,168,155,177,173,210,221],barWidth=70,startX=100,step=153;
for(const [i,value] of values.entries()){
 const bar=frame(chart,'示例完成量｜'+value,startX+i*step,226-value/240*126,barWidth,value/240*126,i===6?C.blue:'#ADC6FF');bar.cornerRadius=4;
 text(chart,'09/'+String(13+i),startX+i*step,238,barWidth,11,C.muted);
}
const table=frame(body,'最近运行',0,0,1160,328);border(table);text(table,'最近运行',24,18,700,17,C.ink,'Medium');text(table,'点击第一行查看模拟运行详情',812,22,320,12,C.muted);
const headings=['任务名称','触发方式','状态','耗时','运行时间'],xs=[24,492,680,848,980],widths=[420,140,120,100,154];
const th=frame(table,'表头',1,62,1158,40,C.bg);headings.forEach((s,i)=>text(th,s,xs[i],10,widths[i],12,C.muted));
const rows=[['周报资料整理','定时触发','已完成','2分12秒','今天 09:40'],['客户反馈分类','手动触发','已完成','1分36秒','今天 09:32'],['知识库更新','定时触发','需处理','3分08秒','今天 09:20'],['会议纪要归档','手动触发','已完成','0分48秒','今天 09:12']];
let firstRow;
for(const [i,data] of rows.entries()){
 const row=frame(table,'运行记录｜'+data[0],1,102+i*48,1158,48);if(i===0)firstRow=row;
 data.forEach((s,j)=>{if(j===2){const badge=frame(row,s,xs[j],11,72,26,s==='已完成'?'#EAF7F1':'#FFF2E8');badge.cornerRadius=5;text(badge,s,12,4,60,12,s==='已完成'?C.green:'#A05B0A');}else text(row,s,xs[j],14,widths[j],13,j===0?C.ink:C.muted,j===0?'Medium':'Regular');});line(row,24,47,1110);
}
text(table,'显示最近 4 条合成记录',24,306,500,11,C.muted);
const month=root.clone();page.appendChild(month);month.name='test_dashboard_public｜任务运行概览·30天';month.x=origin+1600;month.y=0;
for(const n of month.findAllWithCriteria({types:['TEXT']})){if(n.characters==='1,248')n.characters='5,360';if(n.characters==='按日统计 · 单位：次')n.characters='近 30 天 · 每柱代表一个汇总时段';}
const monthChart=month.findOne(n=>n.name==='运行趋势');
const monthValues=[680,740,710,800,760,820,850];
for(const [i,n] of monthChart.children.filter(n=>n.name.startsWith('示例完成量')).entries()){n.name='示例完成量｜'+monthValues[i];n.resize(n.width,monthValues[i]/1000*126);n.y=226-n.height;}
for(const n of monthChart.children.filter(n=>n.type==='TEXT')){const index=['240','160','80','0'].indexOf(n.characters);if(index>=0)n.characters=['1000','667','333','0'][index];const day=['09/13','09/14','09/15','09/16','09/17','09/18','09/19'].indexOf(n.characters);if(day>=0)n.characters=['08/21','08/26','08/31','09/05','09/10','09/15','09/19'][day];}
const month7=monthChart.children.find(n=>n.name==='近 7 天'),month30=monthChart.children.find(n=>n.name==='近 30 天');
month7.fills=fills(C.white);month7.strokes=fills(C.line);month7.children[0].fills=fills(C.muted);month30.fills=fills(C.blue);month30.strokes=[];month30.children[0].fills=fills(C.white);
const modal=frame(page,'test_dashboard_public｜模拟运行详情',origin+3200,0,480,352);border(modal,12);text(modal,'周报资料整理',24,24,430,22,C.ink,'Semibold');text(modal,'已完成 · 今天 09:40 · 耗时 2分12秒',24,66,430,14,C.green);line(modal,24,108,432);text(modal,'运行结果',24,132,432,15,C.ink,'Medium');text(modal,'已归纳 12 条示例资料，生成 1 份模拟周报。\n全部数据均为合成内容，没有读取真实业务资料。',24,166,432,14,C.muted);const close=button(modal,'关闭详情',344,292,112,true);
const nav=n=>({type:'NODE',destinationId:n.id,navigation:'NAVIGATE',transition:null});
const connect=async(n,a)=>n.setReactionsAsync([{trigger:{type:'ON_CLICK'},actions:[a]}]);
await connect(thirty,nav(month));await connect(month7,nav(root));await connect(close,{type:'CLOSE'});
for(const row of [firstRow,month.findOne(n=>n.name==='运行记录｜周报资料整理')])await connect(row,{type:'NODE',destinationId:modal.id,navigation:'OVERLAY',transition:null});
page.flowStartingPoints=[...page.flowStartingPoints.filter(f=>f.nodeId!==root.id),{nodeId:root.id,name:'test_公开示例｜任务运行概览'}];
page.selection=[root];figma.viewport.scrollAndZoomIntoView([root]);
return {root:root.id,month:month.id,modal:modal.id,main:stat.id,firstRow:firstRow.id,seven:seven.id,thirty:thirty.id,close:close.id,texts:root.findAllWithCriteria({types:['TEXT']}).length,instances:root.findAllWithCriteria({types:['INSTANCE']}).length,autoLayouts:root.findAll(n=>n.layoutMode&&n.layoutMode!=='NONE').length,bodyHeight:body.height};
