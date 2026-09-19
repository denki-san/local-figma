import { test } from 'node:test';
import assert from 'node:assert/strict';
import { selectedFontEdit } from '../src/operations.mjs';
import { parseArguments } from '../src/arguments.mjs';
const state={connected:true,context:{pageId:'1:1',selection:[{id:'1:2',type:'TEXT'}]}};
function fixture() {
  const loads=[];let writes=0,font={family:'Inter',style:'Regular'},size=14;
  const target={id:'1:2',type:'TEXT',characters:'测试原文',parent:{id:'1:3',type:'INSTANCE',parent:{type:'PAGE'}},textStyleId:'',boundVariables:{},lineHeight:{unit:'AUTO'},
    get fontName(){return font;},set fontName(v){writes++;font=v;},get fontSize(){return size;},set fontSize(v){writes++;size=v;}};
  const figma={mixed:Symbol('mixed'),currentPage:{id:'1:1',selection:[target]},loadFontAsync:async f=>loads.push(f)};
  const run=(values={family:'Inter',style:'Bold',size:20})=>new Function('figma','target','return (async()=>{'+selectedFontEdit(state,values).code+'})()')(figma,target);
  return {target,figma,loads,run,writes:()=>writes,replaceFont:v=>{font=v;},replaceSize:v=>{size=v;}};
}
test('字体命令严格校验参数和当前选区',()=>{
  assert.deepEqual(parseArguments(['font','--family','Inter','--style','Bold','--size','20']).fontValues,{family:'Inter',style:'Bold',size:20});
  for(const args of [['font'],['font','--family','Inter'],['font','--style','Bold'],['font','--size','NaN'],['font','--size','20','--size','21'],['font','--node','1:2'],['text','--size','20']])assert.throws(()=>parseArguments(args));
  for(const values of [{},{size:0},{size:1001},{size:Infinity},{family:'Inter'},{family:' ',style:'Regular'},{other:1}])assert.throws(()=>selectedFontEdit(state,values));
  assert.throws(()=>selectedFontEdit({...state,stale:true},{size:20}));
  assert.throws(()=>selectedFontEdit({...state,context:{selection:[]}},{size:20}));
});
test('加载原字体与目标字体后修改实例内文字，字号单改保留字体轴',async()=>{
  const f=fixture(),r=await f.run();assert.equal(r.after.fontSize,20);assert.equal(f.target.fontName.style,'Bold');assert.equal(f.loads.length,2);assert.equal(f.target.characters,'测试原文');
  const g=fixture();g.replaceFont({family:'Inter',style:'Regular',variationSettings:{wght:430}});await g.run({size:18});assert.equal(g.writes(),1);assert.equal(g.target.fontName.variationSettings.wght,430);
});
test('锁定、主组件、混合样式与绑定变量在字体加载前拒绝',async()=>{
  for(const mutate of [f=>{f.target.parent.locked=true;},f=>{f.target.parent.type='COMPONENT';},f=>{f.target.textStyleId='style';},f=>{f.target.textStyleId=f.figma.mixed;},f=>f.replaceFont(f.figma.mixed),f=>f.replaceSize(f.figma.mixed),f=>{f.target.boundVariables.fontSize={id:'v'};},f=>f.replaceFont({family:'Inter',style:'Regular',variationSettings:{wght:430}})]){
    const f=fixture();mutate(f);await assert.rejects(f.run());assert.equal(f.writes(),0);assert.equal(f.loads.length,0);
  }
});
test('缺字体与加载期间并发变化均零写入',async()=>{
  for(const mutate of [f=>{throw Error('字体不可用');},f=>{f.target.characters='用户新内容';},f=>{f.target.parent.locked=true;},f=>f.replaceSize(30),f=>{f.target.parent={id:'other',type:'FRAME'};},f=>{f.figma.currentPage.selection=[];},f=>{f.target.boundVariables.fontSize={id:'v'};}]){
    const f=fixture();f.figma.loadFontAsync=async()=>mutate(f);await assert.rejects(f.run());assert.equal(f.writes(),0);
  }
});
test('宿主未应用字号时读回报告失败',async()=>{
  const f=fixture();Object.defineProperty(f.target,'fontSize',{get:()=>14,set:()=>{}});
  await assert.rejects(f.run({size:20}),/读回不一致/);
});
