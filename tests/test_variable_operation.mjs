import {test} from 'node:test';
import assert from 'node:assert/strict';
import {selectedFillVariable} from '../src/variable-operation.mjs';
import {parseArguments} from '../src/arguments.mjs';
const state={connected:true,context:{pageId:'1:1',selection:[{id:'1:2',type:'RECTANGLE'}]}};
function fixture(){
 let writes=0;
 const page={id:'1:1',type:'PAGE'},variable={id:'VariableID:1:3',name:'品牌色',resolvedType:'COLOR',resolveForConsumer:()=>({resolvedType:'COLOR',value:{r:.1,g:.4,b:.9}})};
 let fills=[{type:'SOLID',color:{r:0,g:0,b:0},opacity:.5,visible:true,blendMode:'NORMAL'}];
 const target={id:'1:2',type:'RECTANGLE',parent:page,get fills(){return fills;},set fills(v){writes++;fills=v;}};page.selection=[target];
 const figma={currentPage:page,variables:{getVariableByIdAsync:async()=>variable,setBoundVariableForPaint:(paint,field,v)=>({...paint,boundVariables:{[field]:{type:'VARIABLE_ALIAS',id:v.id}}})}};
 const run=()=>new Function('figma','target','return (async()=>{'+selectedFillVariable(state,variable.id).code+'})()')(figma,target);
 return {page,target,variable,figma,run,writes:()=>writes};
}
test('颜色变量命令解析及单选入口限制',()=>{
 assert.equal(parseArguments(['bind-fill','VariableID:1:3']).arg,'VariableID:1:3');
 assert.throws(()=>selectedFillVariable(state,''));
 assert.throws(()=>selectedFillVariable({...state,stale:true},'v'));
});
test('绑定只改选区填充，保留透明度，同变量无重复写入',async()=>{
 const f=fixture(),before=JSON.stringify(f.variable);
 assert.equal((await f.run()).variableId,f.variable.id);assert.equal(f.target.fills[0].opacity,.5);
 assert.equal(JSON.stringify(f.variable),before);assert.equal((await f.run()).unchanged,true);assert.equal(f.writes(),1);
});
test('类型、样式、共享定义与异步选区变化在写入前拒绝',async()=>{
 for(const change of [f=>{f.variable.resolvedType='FLOAT';},f=>{f.target.fillStyleId='style';},f=>{f.target.parent={type:'COMPONENT',parent:f.page};},f=>{f.target.locked=true;},f=>{f.figma.variables.getVariableByIdAsync=async()=>{f.page.selection=[];return f.variable;};}]){
  const f=fixture();change(f);await assert.rejects(f.run());assert.equal(f.writes(),0);
 }
});
test('读回失败不重复写入',async()=>{
 const f=fixture();f.figma.variables.setBoundVariableForPaint=paint=>paint;
 await assert.rejects(f.run(),/读回不一致/);assert.equal(f.writes(),1);
});
test('等待期间父容器移出原祖先范围时拒绝写入',async()=>{
 const f=fixture();f.target.parent={id:'1:10',type:'FRAME',parent:f.page};
 f.figma.variables.getVariableByIdAsync=async()=>{f.target.parent.parent={id:'1:11',type:'FRAME',parent:f.page};return f.variable;};
 await assert.rejects(f.run(),/变化/);assert.equal(f.writes(),0);
});
