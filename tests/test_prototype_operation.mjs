import {test} from 'node:test';
import assert from 'node:assert/strict';
import {selectedPrototypeEdit} from '../src/operations.mjs';
const state={connected:true,context:{pageId:'1:1',selection:[{id:'1:3',type:'RECTANGLE'}]}};
function fixture(){
  let writes=0;
  const page={id:'1:1',type:'PAGE'},source={id:'1:2',type:'FRAME',parent:page},destination={id:'1:4',type:'FRAME',parent:page};
  const target={id:'1:3',parent:source,reactions:[{trigger:{type:'ON_HOVER'},actions:[{type:'BACK'}]}],async setReactionsAsync(value){writes++;this.reactions=value;}};
  page.children=[source,destination];page.selection=[target];
  const figma={currentPage:page};
  const run=()=>new Function('figma','target','return (async()=>{'+selectedPrototypeEdit(state,'1:4').code+'})()')(figma,target);
  return {page,source,destination,target,figma,run,writes:()=>writes};
}
test('原型入口拒绝错误目的地和过期或多选上下文',()=>{
  for(const id of [undefined,'bad','https://example.com'])assert.throws(()=>selectedPrototypeEdit(state,id));
  assert.throws(()=>selectedPrototypeEdit({...state,stale:true},'1:4'));
  assert.throws(()=>selectedPrototypeEdit({...state,context:{selection:[]}},'1:4'));
});
test('新增同页点击跳转保留已有悬停，返回明确待实点状态',async()=>{
  const f=fixture(),before=structuredClone(f.target.reactions);const r=await f.run();
  assert.equal(f.writes(),1);assert.deepEqual(f.target.reactions[0],before[0]);assert.equal(f.target.reactions[1].actions[0].destinationId,'1:4');assert.equal(r.interactionReview,'not-run');
});
test('已有点击、共享主组件、锁定和错误目标全部零写入',async()=>{
  for(const mutate of [f=>{f.target.reactions.push({trigger:{type:'ON_CLICK'},actions:[]});},f=>{f.source.locked=true;},f=>{f.source.type='COMPONENT';},f=>{f.destination.visible=false;},f=>{f.destination.type='INSTANCE';},f=>{f.page.children=[];},f=>{f.source.id='1:4';},f=>{f.page.selection=[];}]){
    const f=fixture();mutate(f);await assert.rejects(f.run());assert.equal(f.writes(),0);
  }
});
test('宿主没有应用连接时报告读回失败',async()=>{
  const f=fixture();f.target.setReactionsAsync=async()=>{};await assert.rejects(f.run(),/读回不一致/);
});
