import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const code=await fs.readFile(new URL('../examples/dashboard/test_verify_refinement.js',import.meta.url),'utf8');
function fixture(){
  const main={id:'2:1',type:'COMPONENT',name:'test_dashboard_public｜指标卡片'};
  const texts=values=>values.map((characters,i)=>({type:'TEXT',name:'字段'+i,characters,fontSize:14,x:20,y:16+i*30,width:238,height:20}));
  const instance=(name,values)=>({type:'INSTANCE',name,width:278,height:142,children:texts(values),getMainComponentAsync:async()=>main});
  const before=['完成任务','1,248','较上期增加 12.5%'],after=['已完成任务','1,248','对比上期，增长 12.5%'];
  const source=instance('完成任务',before),baseline=instance('test_refine_public｜修改前',before),candidate=instance('test_refine_public｜修改后',after);
  const root={type:'FRAME',name:'test_dashboard_public｜任务运行概览·7天',findAllWithCriteria:()=>[source]};
  const page={children:[root,main]},target={type:'FRAME',name:'test_refine_public｜指标文案对比',parent:page,children:[baseline,candidate]};
  const run=()=>new Function('figma','target','return (async()=>{'+code+'})()')({currentPage:page},target);
  return {source,baseline,candidate,run};
}
test('公开精修检查器通过合成对照，明确历史主组件保护缺口',async()=>{
  const f=fixture(),before=JSON.stringify([f.source,f.baseline,f.candidate]),result=await f.run();
  assert.equal(result.structurePassed,true);assert.equal(result.historicalMasterProtection,'requires-independent-before-after-snapshots');
  assert.equal(JSON.stringify([f.source,f.baseline,f.candidate]),before);
});
test('精修检查器拒绝组件脱离、样式或额外文案变化和文字越界',async()=>{
  for(const mutate of [f=>{f.candidate.getMainComponentAsync=async()=>({id:'other'});},f=>{f.candidate.children[1].fontSize=30;},f=>{f.candidate.children[1].characters='错误数值';},f=>{f.candidate.children[0].hasMissingFont=true;},f=>{for(const node of [f.source,f.baseline,f.candidate])node.children[0].width=400;}]){
    const f=fixture();mutate(f);await assert.rejects(f.run());
  }
});
