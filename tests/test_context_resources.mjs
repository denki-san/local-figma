import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
const source=await fs.readFile(new URL('../plugin/main.js',import.meta.url),'utf8');
const flush=()=>new Promise(resolve=>setImmediate(resolve));
function fixture(target) {
  const messages=[],events=new Map();
  const pageEvents=new Map(),timers=new Map();let timerId=0;
  const page={id:'1:1',name:'当前页',type:'PAGE',selection:[target],on:(event,cb)=>pageEvents.set(event,cb),off:(event,cb)=>{if(pageEvents.get(event)===cb)pageEvents.delete(event);}};
  const figma={fileKey:'example',currentPage:page,showUI(){},on:(event,cb)=>events.set(event,cb),ui:{postMessage:m=>messages.push(structuredClone(m))},
    getStyleByIdAsync:async id=>({id,name:'正文样式',type:'TEXT'}),
    variables:{getVariableByIdAsync:async id=>({id,name:'主色',resolvedType:'COLOR',variableCollectionId:'collection'})}};
  vm.runInNewContext(source,{figma,__html__:'',setTimeout:cb=>{timers.set(++timerId,cb);return timerId;},clearTimeout:id=>timers.delete(id)});
  return {figma,page,messages,events,pageEvents,timers,tick:()=>{const pending=[...timers.values()];timers.clear();pending.forEach(cb=>cb());},start:()=>figma.ui.onmessage({type:'context-request',contextNonce:'test-context'})};
}
test('自动上下文先提供选区，再只读补充主组件、样式和填充变量',async()=>{
  const target={id:'1:2',type:'FRAME',name:'区域',children:[
    {id:'1:3',type:'INSTANCE',name:'按钮',getMainComponentAsync:async()=>({id:'2:1',name:'按钮主组件',remote:false})},
    {id:'1:4',type:'TEXT',name:'标题',characters:'原文',textStyleId:'style',fills:[{type:'SOLID',boundVariables:{color:{type:'VARIABLE_ALIAS',id:'variable'}}}]}
  ]};
  const before=JSON.stringify(target),f=fixture(target);await f.start();
  assert.equal(f.messages[0].context.resources.state,'loading');
  const initialRevision=f.messages[0].context.revision;
  await flush();
  const resources=f.messages.at(-1).context.resources;
  assert.equal(resources.state,'ready');
  assert.equal(f.messages.at(-1).context.revision,initialRevision+1);
  assert.equal(resources.components[0].id,'2:1');
  assert.equal(resources.styles[0].name,'正文样式');
  assert.equal(resources.variables[0].id,'variable');
  assert.equal(resources.scannedNodes,3);
  assert.equal(JSON.stringify(target),before);
});
test('切换选区后慢资源请求不能覆盖新上下文',async()=>{
  let finish;
  const target={id:'1:2',type:'INSTANCE',name:'旧选择',getMainComponentAsync:()=>new Promise(resolve=>{finish=resolve;})};
  const f=fixture(target);await f.start();
  const start=f.messages.length;
  f.page.selection=[{id:'2:2',type:'FRAME',name:'新选择',children:[]}];
  f.events.get('selectionchange')();
  finish({id:'3:3',name:'迟到的组件'});await flush();
  assert(f.messages.slice(start).every(m=>m.context.target.id==='2:2'));
  assert.equal(f.messages.at(-1).context.resources.state,'ready');
});
test('自动资源扫描超预算时保留选区并明确限制，不伪造空资源成功',async()=>{
  const target={id:'1:2',type:'FRAME',name:'较大选区',children:Array.from({length:300},(_,i)=>({id:'2:'+i,type:'RECTANGLE'}))};
  const f=fixture(target);await f.start();await flush();
  const context=f.messages.at(-1).context;
  assert.equal(context.target.id,'1:2');
  assert.equal(context.resources.state,'limited');
  assert.match(context.resources.message,/256/);
  assert.equal(context.resources.components,undefined);
});
test('同选区节点变化合并刷新，立即阻止旧资源结果回传',async()=>{
  let finish;
  const target={id:'1:2',type:'INSTANCE',name:'旧名称',getMainComponentAsync:()=>new Promise(resolve=>{finish=resolve;})};
  const f=fixture(target);await f.start();
  target.name='新名称';
  for(let i=0;i<20;i++)f.pageEvents.get('nodechange')({nodeChanges:[]});
  assert.equal(f.timers.size,1);
  finish({id:'2:1',name:'旧组件'});await flush();
  assert.equal(f.messages.length,1);
  target.getMainComponentAsync=async()=>({id:'2:2',name:'新组件'});
  f.tick();await flush();
  assert.equal(f.messages.at(-1).context.target.name,'新名称');
  assert.equal(f.messages.at(-1).context.resources.components[0].id,'2:2');
});
test('切换页面解绑旧监听并取消待刷新的定时任务',async()=>{
  const f=fixture({id:'1:2',type:'FRAME',children:[]});await f.start();await flush();
  f.pageEvents.get('nodechange')({nodeChanges:[]});
  const nextEvents=new Map();
  f.figma.currentPage={id:'2:1',name:'下一页',selection:[],on:(event,cb)=>nextEvents.set(event,cb)};
  f.events.get('currentpagechange')();await flush();
  assert.equal(f.pageEvents.size,0);assert.equal(f.timers.size,0);
  assert.equal(typeof nextEvents.get('nodechange'),'function');
  assert.equal(f.messages.at(-1).context.pageId,'2:1');
});
test('样式事件也触发有界刷新，未配对时不启动定时扫描',async()=>{
  const f=fixture({id:'1:2',type:'FRAME',children:[]});
  f.events.get('stylechange')();assert.equal(f.timers.size,0);
  await f.start();await flush();const count=f.messages.length;
  f.events.get('stylechange')();f.tick();await flush();
  assert.equal(f.messages.length,count+2);
});
test('自动字体清单去重，保留混合字体和可变轴，缺字体保持待复核',async()=>{
  const regular={family:'Inter',style:'Regular'},bold={family:'Inter',style:'Bold'};
  const f=fixture({id:'1:2',type:'FRAME',children:[
    {id:'1:3',type:'TEXT',fontName:regular},
    {id:'1:4',type:'TEXT',characters:'混合',fontName:Symbol('mixed'),hasMissingFont:true,getRangeAllFontNames:()=>[regular,bold]},
    {id:'1:5',type:'TEXT',fontName:{...regular,variationSettings:{wght:450,wdth:100}}},
    {id:'1:6',type:'TEXT',fontName:{...regular,variationSettings:{wdth:100,wght:450}}}
  ]});await f.start();await flush();
  const r=f.messages.at(-1).context.resources;
  assert.equal(r.state,'needs-review');assert.equal(r.fonts.length,3);
  assert.equal(r.fonts.find(font=>font.fontName.style==='Regular' && !font.fontName.variationSettings).usedBy.length,2);
  assert.equal(r.fonts.find(font=>font.fontName.variationSettings).usedBy.length,2);
  assert.match(r.warnings[0].message,/缺失字体/);
});
test('超长混合文字不扫描字符范围，明确提示读取缺口',async()=>{
  let reads=0;
  const f=fixture({id:'1:2',type:'FRAME',children:[{id:'1:3',type:'TEXT',fontName:Symbol('mixed'),characters:'字'.repeat(50001),getRangeAllFontNames:()=>{reads++;return [];}}]});
  await f.start();await flush();const r=f.messages.at(-1).context.resources;
  assert.equal(reads,0);assert.equal(r.state,'needs-review');assert.match(r.warnings[0].message,/50000/);
});
