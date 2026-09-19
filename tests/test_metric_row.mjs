import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import {buildMetricRow} from '../examples/dashboard/test_build_metric_row.mjs';
const source=JSON.parse(await fs.readFile(new URL('../examples/dashboard/metric-row.json',import.meta.url),'utf8'));
const capture=await fs.readFile(new URL('../examples/dashboard/test_capture_metric_row.js',import.meta.url),'utf8');
function browserFixture(){
  const defaults={opacity:'1',transform:'none',filter:'none',visibility:'visible',backgroundImage:'none',textAlign:'left',fontStyle:'normal',textDecorationLine:'none',textTransform:'none',textShadow:'none',letterSpacing:'normal'};
  const row={children:[],style:{...defaults,backgroundColor:source.background},getBoundingClientRect:()=>({x:0,y:0,width:source.width,height:source.height})};
  for(const item of source.items){
    const card={parentElement:row,children:[],style:{...defaults,backgroundColor:source.card.background,boxShadow:source.card.shadow,...Object.fromEntries(['borderTopLeftRadius','borderTopRightRadius','borderBottomLeftRadius','borderBottomRightRadius'].map(k=>[k,source.card.radius]))},getBoundingClientRect:()=>({x:item.x,y:0,width:source.card.width,height:source.card.height})};
    card.children=source.card.texts.map((s,i)=>({parentElement:card,children:[],textContent:item.texts[i],scrollWidth:s.width,scrollHeight:s.height,style:{...defaults,fontFamily:s.font,fontSize:s.size,fontWeight:s.weight,lineHeight:s.lineHeight,color:s.color},getBoundingClientRect:()=>({x:item.x+s.x,y:s.y,width:s.width,height:s.height})}));row.children.push(card);
  }
  const view={querySelectorAll:()=>row.children.flatMap(c=>c.children)};
  return {row,run:()=>JSON.parse(JSON.stringify(vm.runInNewContext(capture,{document:{querySelector:()=>view},getComputedStyle:n=>n.style})()))};
}
test('网页捕获保留基线并拒绝透明度、对齐及非统一圆角',()=>{
  assert.deepEqual(browserFixture().run(),source);
  for(const mutate of [r=>r.children[1].style.opacity='0.2',r=>r.children[1].children[0].style.textAlign='right',r=>r.children[0].style.borderBottomLeftRadius='2px',r=>r.style.transform='scale(2)']){
    const fixture=browserFixture();mutate(fixture.row);assert.throws(fixture.run);
  }
});
function mainFixture(){
  const rgb=s=>Object.fromEntries(s.match(/\d+/g).map((n,i)=>[['r','g','b'][i],Number(n)/255]));
  const paint=s=>[{type:'SOLID',color:rgb(s)}];
  const plain={visible:true,opacity:1,rotation:0,effects:[]};
  const page={id:'page',children:[]};
  const main={...plain,type:'COMPONENT',id:'main',name:'test_dashboard_public｜指标卡片',parent:page,width:source.card.width,height:source.card.height,layoutMode:'VERTICAL',cornerRadius:10,strokeAlign:'INSIDE',strokeWeight:1,fills:paint(source.card.background),strokes:paint('rgb(229, 232, 239)'),children:source.card.texts.map(s=>({...plain,type:'TEXT',...s,fontName:{family:'PingFang SC',style:s.weight==='600'?'Semibold':'Regular'},fontSize:parseFloat(s.size),lineHeight:{unit:'PIXELS',value:parseFloat(s.lineHeight)},fills:paint(s.color),textAlignHorizontal:'LEFT',textDecoration:'NONE',letterSpacing:{unit:'PIXELS',value:0}}))};
  page.children.push(main);let writes=0;
  const figma={currentPage:page,loadFontAsync:async()=>{},createFrame(){writes++;throw Error('测试创建边界');}};
  const execute=new Function('figma','target','return (async()=>{'+buildMetricRow(source)+'})()');
  return {main,figma,run:()=>execute(figma,{type:'FRAME',parent:page}),writes:()=>writes};
}
test('匹配主组件通过预检，视觉变化在创建前拒绝，字体等待后重新检查',async()=>{
  const valid=mainFixture();await assert.rejects(valid.run(),/测试创建边界/);assert.equal(valid.writes(),1);
  for(const mutate of [m=>m.opacity=0.2,m=>m.children[0].textAlignHorizontal='RIGHT',m=>m.children[0].letterSpacing.value=1,m=>m.effects=[{visible:true}],m=>m.visible=false]){
    for(const delayed of [false,true]){
      const f=mainFixture();if(delayed)f.figma.loadFontAsync=async()=>mutate(f.main);else mutate(f.main);
      await assert.rejects(f.run(),/主组件存在/);assert.equal(f.writes(),0);
    }
  }
});
test('浏览器指标记录生成可解析脚本，文字只作为数据进入程序',()=>{
  const data=structuredClone(source);data.items[0].texts[0]='";throw Error("注入");//';
  const script=buildMetricRow(data);
  assert.doesNotThrow(()=>new Function('figma','target','return (async()=>{'+script+'})()'));
  assert(script.includes(JSON.stringify(data.items[0].texts[0])));
  assert(!/79Cror|X-Session-Token|156:/.test(script));
});
test('非等距、错误字体、混合卡片与非法颜色数据在生成前拒绝',()=>{
  for(const mutate of [
    d=>{d.items[1].x+=1;},d=>{d.items[0].y=10;},d=>{d.items.pop();},
    d=>{d.card.texts[0].font='Arial';},d=>{d.card.texts[0].size='13px;display:none';},
    d=>{d.background='url(secret)';},d=>{d.card.background='rgb(999, 0, 0)';},
    d=>{d.items[0].texts[0]='x'.repeat(1001);},d=>{d.card.width=Infinity;}
  ]){const data=structuredClone(source);mutate(data);assert.throws(()=>buildMetricRow(data));}
});
test('主组件缺失或尺寸变化时在首个创建动作之前拒绝',async()=>{
  for(const mismatch of [false,true]){
    let writes=0;
    const page={id:'1:1',children:[]};
    if(mismatch)page.children.push({type:'COMPONENT',id:'1:3',name:'test_dashboard_public｜指标卡片',parent:page,width:999});
    const target={type:'FRAME',parent:page};
    const figma={currentPage:page,createFrame(){writes++;},loadFontAsync:async()=>{}};
    const execute=new Function('figma','target','return (async()=>{'+buildMetricRow(source)+'})()');
    await assert.rejects(execute(figma,target));assert.equal(writes,0);
  }
});
