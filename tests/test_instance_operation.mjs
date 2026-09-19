import {test} from 'node:test';
import assert from 'node:assert/strict';
import {selectedInstanceCreate} from '../src/instance-operation.mjs';
import {parseArguments} from '../src/arguments.mjs';
const state={connected:true,context:{pageId:'1:1',selection:[{id:'1:2',type:'FRAME'}]}};
function fixture(){
  let writes=0;
  const page={id:'1:1',type:'PAGE'};
  const target={id:'1:2',type:'FRAME',parent:page,layoutMode:'NONE',width:400,height:400,children:[],appendChild(n){this.children.push(n);n.parent=this;}};
  const component={id:'1:3',type:'COMPONENT',parent:page,width:200,height:100,createInstance(){writes++;return {id:'1:4',type:'INSTANCE',parent:page,getMainComponentAsync:async()=>component};}};
  page.selection=[target];
  const figma={currentPage:page,getNodeByIdAsync:async()=>component};
  const run=()=>new Function('figma','target','return (async()=>{'+selectedInstanceCreate(state,component.id).code+'})()')(figma,target);
  return {page,target,component,figma,run,writes:()=>writes};
}
test('实例命令解析及入口范围校验',()=>{
  assert.equal(parseArguments(['instance','1:3']).arg,'1:3');
  assert.throws(()=>selectedInstanceCreate({...state,stale:true},'1:3'));
  assert.throws(()=>selectedInstanceCreate(state,'bad'));
  assert.throws(()=>selectedInstanceCreate({...state,context:{selection:[]}},'1:3'));
});
test('实例追加保留来源与既有子节点，读回主组件关系',async()=>{
  for(const layout of ['NONE','VERTICAL','HORIZONTAL']){
    const f=fixture();f.target.layoutMode=layout;
    const old={id:'1:5',y:10,height:50,rotation:0};f.target.children=[old];
    const result=await f.run();
    assert.equal(f.writes(),1);assert.equal(f.target.children[0],old);
    assert.equal(result.componentId,'1:3');assert.equal(result.visualReview,'not-run');
    if(layout==='NONE')assert.deepEqual(result.placement,{x:0,y:76});
    else assert.equal(result.placement,'auto-layout-append');
    assert.equal(f.component.parent,f.page);
  }
});
test('保护范围、空间不足、异步选择变化均在创建之前拒绝',async()=>{
  for(const mutate of [
    f=>{f.target.locked=true;},f=>{f.target.visible=false;},
    f=>{f.target.parent={type:'INSTANCE',parent:f.page};},
    f=>{f.component.remote=true;},f=>{f.component.type='INSTANCE';},
    f=>{f.component.parent={type:'PAGE',id:'2:1'};},
    f=>{f.component.parent=f.target;},f=>{f.target.width=50;},
    f=>{f.target.height=50;},f=>{f.target.layoutMode='GRID';},
    f=>{f.figma.getNodeByIdAsync=async()=>{f.page.selection=[];return f.component;};}
  ]){const f=fixture();mutate(f);await assert.rejects(f.run());assert.equal(f.writes(),0);}
});
test('读回不一致保留失败信息，不自动重复创建',async()=>{
  const f=fixture();f.target.appendChild=()=>{};
  await assert.rejects(f.run(),/读回不一致/);assert.equal(f.writes(),1);
});
test('嵌套Hug自动布局在创建前拒绝外层重排风险，独立Hug仍可追加',async()=>{
  for(const property of ['primaryAxisSizingMode','counterAxisSizingMode','layoutSizingHorizontal','layoutSizingVertical']){
    const f=fixture();f.target.layoutMode='VERTICAL';f.target[property]=property.includes('SizingMode')?'AUTO':'HUG';
    f.target.parent={type:'FRAME',layoutMode:'HORIZONTAL',parent:f.page};
    await assert.rejects(f.run(),/选区外布局/);assert.equal(f.writes(),0);
  }
  const f=fixture();f.target.layoutMode='VERTICAL';f.target.primaryAxisSizingMode='AUTO';
  assert.equal((await f.run()).placement,'auto-layout-append');
});
test('自动布局中受保护的已有子树在重排前拒绝',async()=>{
  for(const protectedNode of [{type:'RECTANGLE',locked:true},{type:'COMPONENT'},{type:'COMPONENT_SET'}]){
    const f=fixture();f.target.layoutMode='HORIZONTAL';
    f.target.children=[{id:'1:5',type:'FRAME',children:[protectedNode]}];
    await assert.rejects(f.run(),/受保护内容/);assert.equal(f.writes(),0);
  }
});
