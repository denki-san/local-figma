import { test } from 'node:test';
import assert from 'node:assert/strict';
import { selectedInstanceProperty } from '../src/instance-properties.mjs';
import { parseArguments } from '../src/arguments.mjs';

const state = { connected:true, context:{pageId:'1:1',selection:[{id:'1:2',type:'INSTANCE'}]} };
function fixture() {
  let writes=0;
  const page={id:'1:1',type:'PAGE'}, main={id:'1:3'};
  const props={'标题#1':{type:'TEXT',value:'原文'},'显示#2':{type:'BOOLEAN',value:true}};
  const target={id:'1:2',type:'INSTANCE',parent:page,children:[],componentProperties:props,
    getMainComponentAsync:async()=>main,
    findAllWithCriteria:()=>[{getStyledTextSegments:()=>[{fontName:{family:'Inter',style:'Regular'}}]}],
    setProperties(values){writes++;for(const [key,value] of Object.entries(values))props[key].value=value;}};
  page.selection=[target];
  const figma={currentPage:page,loadFontAsync:async()=>{}};
  const run=(property='标题#1',value='新文字')=>new Function('figma','target','return (async()=>{'+selectedInstanceProperty(state,property,value).code+'})()')(figma,target);
  return {page,main,props,target,figma,run,writes:()=>writes};
}
test('属性参数保留完整名称、空文字及布尔字符串，拒绝缺失与重复参数',()=>{
  const parsed=parseArguments(['props','标题#1','--value','']);
  assert.equal(parsed.arg,'标题#1');assert.equal(parsed.propertyValue,'');
  assert.equal(parseArguments(['props','显示#2','--value','false']).propertyValue,'false');
  for(const args of [['props'],['props','标题#1'],['text','x','--value','y'],['props','x','--value','a','--value','b']])assert.throws(()=>parseArguments(args));
});
test('文字与布尔覆盖只写一次，保留其它属性；同值无写入',async()=>{
  const f=fixture();assert.deepEqual((await f.run()).changedNodeIds,['1:2']);
  assert.equal(f.props['标题#1'].value,'新文字');assert.equal(f.props['显示#2'].value,true);
  await f.run('显示#2','false');assert.equal(f.props['显示#2'].value,false);
  assert.equal((await f.run()).unchanged,true);assert.equal(f.writes(),2);
});
test('受保护范围、变量绑定和异步变化均在写入前拒绝',async()=>{
  for(const change of [
    f=>{f.target.locked=true;},f=>{f.target.parent={type:'FRAME',layoutMode:'VERTICAL',parent:f.page};},
    f=>{f.props['标题#1'].boundVariables={value:{type:'VARIABLE_ALIAS',id:'v'}};},
    f=>{f.figma.loadFontAsync=async()=>{f.page.selection=[];};},
    f=>{f.figma.loadFontAsync=async()=>{f.props['显示#2'].value=false;};},
    f=>{f.target.parent={id:'1:10',type:'FRAME',layoutMode:'NONE',parent:f.page};f.figma.loadFontAsync=async()=>{f.target.parent.parent={id:'1:11',type:'FRAME',parent:f.page};};}
  ]){const f=fixture();change(f);await assert.rejects(f.run());assert.equal(f.writes(),0);}
  const f=fixture();await assert.rejects(f.run('显示#2','yes'));assert.equal(f.writes(),0);
});
test('其它属性被意外改动会被读回发现，失败后不重试',async()=>{
  const f=fixture(),write=f.target.setProperties;
  f.target.setProperties=values=>{write(values);f.props['显示#2'].value=false;};
  await assert.rejects(f.run(),/读回不一致/);assert.equal(f.writes(),1);
});
