import { test } from 'node:test';
import assert from 'node:assert/strict';
import { selectedFillEdit } from '../src/operations.mjs';
import { parseArguments } from '../src/arguments.mjs';
const state={connected:true,context:{pageId:'1:1',selection:[{id:'1:2',type:'RECTANGLE'}]}};
function fixture() {
  let writes=0, paints=[{type:'SOLID',color:{r:0,g:0,b:0},opacity:0.4,blendMode:'NORMAL',visible:true}];
  const target={id:'1:2',type:'RECTANGLE',parent:{type:'FRAME',parent:{id:'1:1',type:'PAGE'}},get fills(){return paints;},set fills(value){writes++;paints=value;}};
  const figma={currentPage:{id:'1:1',selection:[target]}};
  const run=()=>new Function('figma','target','return (async()=>{'+selectedFillEdit(state,'#3366fF').code+'})()')(figma,target);
  return {target,figma,run,writes:()=>writes,setPaints:value=>{paints=value;}};
}
test('填充参数仅接受单个六位颜色，不接受节点覆盖或布局参数',()=>{
  assert.equal(parseArguments(['fill','#3366FF']).arg,'#3366FF');
  for(const args of [['fill','#ffffff','#000000'],['fill','--node','1:2'],['fill','--width','20']])assert.throws(()=>parseArguments(args));
  for(const value of [undefined,'red','#fff','#12345678','3366FF','#GG0000'])assert.throws(()=>selectedFillEdit(state,value));
  assert.throws(()=>selectedFillEdit({...state,stale:true},'#ffffff'));
  assert.throws(()=>selectedFillEdit({...state,context:{selection:[]}},'#ffffff'));
});
test('改色保留透明度与混合模式，并独立读回RGB',async()=>{
  const f=fixture(),result=await f.run();
  assert.deepEqual(result.color,{r:0.2,g:0.4,b:1});
  assert.equal(f.target.fills[0].opacity,0.4);
  assert.equal(f.target.fills[0].blendMode,'NORMAL');
  assert.equal(f.writes(),1);
});
test('锁定、主组件、变量、样式或选区变化全部在写入前拒绝',async()=>{
  for(const mutate of [
    f=>{f.target.locked=true;},f=>{f.target.parent.locked=true;},
    f=>{f.target.parent.type='COMPONENT';},f=>{f.target.fillStyleId='style';},
    f=>{f.target.fills[0].boundVariables={color:{type:'VARIABLE_ALIAS',id:'var'}};},
    f=>{f.target.boundVariables={fills:[{id:'var'}]};},
    f=>{f.figma.currentPage.selection=[];},f=>{f.figma.currentPage.id='other';}
  ]){const f=fixture();mutate(f);await assert.rejects(f.run());assert.equal(f.writes(),0);}
});
test('多层、渐变、图片、隐藏及混合填充拒绝覆盖',async()=>{
  for(const paints of [[],[{type:'IMAGE'}],[{type:'GRADIENT_LINEAR'}],[{type:'SOLID',visible:false}],[{type:'SOLID'},{type:'SOLID'}],Symbol('mixed')]){
    const f=fixture();f.setPaints(paints);await assert.rejects(f.run(),/单个可见纯色/);assert.equal(f.writes(),0);
  }
});
test('宿主未应用改色时报告读回不一致',async()=>{
  const f=fixture();const before=f.target.fills;
  Object.defineProperty(f.target,'fills',{get:()=>before,set:()=>{}});
  await assert.rejects(f.run(),/读回不一致/);
});
