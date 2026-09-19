import {test} from 'node:test';
import assert from 'node:assert/strict';
import {selectedArrangeEdit} from '../src/operations.mjs';
function fixture(){
  const target={id:'1:2',type:'FRAME',layoutMode:'NONE',parent:{type:'FRAME',parent:{type:'PAGE'}}};
  let writes=0;
  const nodes=[[0,10,20,30],[50,40,30,20],[150,80,40,10]].map(([x,y,width,height],i)=>({id:'2:'+i,type:'RECTANGLE',parent:target,rotation:0,width,height,get x(){return x;},set x(v){writes++;x=v;},get y(){return y;},set y(v){writes++;y=v;}}));
  const figma={currentPage:{id:'1:1',selection:nodes}};
  const state={connected:true,context:{pageId:'1:1',selection:nodes.map(n=>({id:n.id,parentId:target.id,parentType:'FRAME'}))}};
  const run=(operation,mode)=>new Function('figma','target','return (async()=>{'+selectedArrangeEdit(state,operation,mode).code+'})()')(figma,target);
  return {target,nodes,figma,state,run,writes:()=>writes};
}
test('多选操作绑定共同父Frame，拒绝跨范围或过期上下文',()=>{
  const f=fixture();assert.equal(selectedArrangeEdit(f.state,'align','left').targetNodeId,'1:2');
  for(const [operation,mode] of [['align','bad'],['run','left'],['distribute','top']])assert.throws(()=>selectedArrangeEdit(f.state,operation,mode));
  assert.throws(()=>selectedArrangeEdit({...f.state,stale:true},'align','left'));
  f.state.context.selection[1].parentId='other';assert.throws(()=>selectedArrangeEdit(f.state,'align','left'));
});
test('六方向以选区边界对齐，保持另一轴和尺寸',async()=>{
  for(const [mode,axis,expected] of [['left','x',[0,0,0]],['right','x',[170,160,150]],['horizontal-center','x',[85,80,75]],['top','y',[10,10,10]],['bottom','y',[60,70,80]],['vertical-center','y',[35,40,45]]]){
    const f=fixture();const other=axis==='x'?'y':'x',before=f.nodes.map(n=>n[other]);await f.run('align',mode);
    assert.deepEqual(f.nodes.map(n=>n[axis]),expected);assert.deepEqual(f.nodes.map(n=>n[other]),before);
  }
});
test('水平与垂直分布保持两端并生成相等间距',async()=>{
  const h=fixture();await h.run('distribute','horizontal');assert.deepEqual(h.nodes.map(n=>n.x),[0,70,150]);
  const v=fixture();await v.run('distribute','vertical');assert.deepEqual(v.nodes.map(n=>n.y),[10,50,80]);
});
test('所有图层预检完成后才写入，保护最后一个锁定或共享节点',async()=>{
  for(const mutate of [f=>{f.nodes[2].locked=true;},f=>{f.nodes[2].type='COMPONENT';},f=>{f.nodes[2].rotation=10;},f=>{f.nodes[2].parent={id:'other'};},f=>{f.target.layoutMode='HORIZONTAL';},f=>{f.target.parent.type='INSTANCE';},f=>{f.target.parent.locked=true;},f=>{f.figma.currentPage.selection=f.nodes.slice(1);},f=>{f.figma.currentPage.id='other';}]){
    const f=fixture();mutate(f);await assert.rejects(f.run('align','left'));assert.equal(f.writes(),0);
  }
});
test('空间不足拒绝分布，宿主忽略位置写入报告失败',async()=>{
  const f=fixture();f.nodes[1].width=1000;await assert.rejects(f.run('distribute','horizontal'));assert.equal(f.writes(),0);
  const g=fixture();Object.defineProperty(g.nodes[1],'x',{get:()=>50,set:()=>{}});await assert.rejects(g.run('align','left'),/读回不一致/);
});
