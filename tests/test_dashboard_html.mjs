import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {renderDashboard} from '../examples/dashboard/test_render_html.mjs';
const exportCode=await fs.readFile(new URL('../examples/dashboard/test_export_html_source.js',import.meta.url),'utf8');
function fixture(){
  const frame=(key,width,height)=>({key,type:'FRAME',name:key,x:0,y:0,width,height,opacity:1,clipsContent:true,radii:[0,0,0,0],fills:[],strokes:[],children:[]});
  const text={key:'week.0',type:'TEXT',name:'标题',x:24,y:24,width:300,height:30,opacity:1,radii:[0,0,0,0],fills:[{color:{r:0,g:0,b:0},opacity:1}],strokes:[],characters:'<script>alert("测试")</script>',fontName:{family:'PingFang SC',style:'Regular'},fontSize:18,lineHeight:{unit:'PIXELS',value:27},letterSpacing:{unit:'PIXELS',value:0},textAlignHorizontal:'LEFT'};
  const views=[frame('week',1440,1024),frame('month',1440,1024),frame('detail',480,352)];views[0].children=[text];
  return {format:'public-dashboard-v1',views,count:4};
}
test('公开HTML转换保留文字并转义内容，不把导出文本执行为脚本',()=>{
  const input=fixture(),before=JSON.stringify(input),html=renderDashboard(input);
  assert.match(html,/&lt;script&gt;alert\(&quot;测试&quot;\)&lt;\/script&gt;/);
  assert.equal((html.match(/<script>/g)||[]).length,1);
  assert.equal((html.match(/data-node=/g)||[]).length,4);
  assert.equal(JSON.stringify(input),before);
  assert.match(html,/<dialog aria-label="模拟运行详情">/);
});
test('公开HTML转换拒绝畸形数值、重复身份、节点丢失及不支持的字体类型',()=>{
  for(const mutate of [
    f=>{f.views[0].width=Infinity;},f=>{f.views[0].children[0].key='week';},
    f=>{f.count=5;},f=>{f.views[0].children[0].fontName.family='其它';},
    f=>{f.views[0].children[0].type='VECTOR';},f=>{f.views[0].children[0].fontSize='12;display:none';},
    f=>{f.views[0].children[0].fills[0].color.r=NaN;},f=>{f.views[2].width=400;},
    f=>{delete f.views[0].children[0].letterSpacing;},f=>{f.views[0].children[0].letterSpacing.unit='UNKNOWN';}
  ]){const input=fixture();mutate(input);assert.throws(()=>renderDashboard(input));}
});
test('真实导出脚本经JSON转换保留字距，混合字距在传输前拒绝',async()=>{
  const input=fixture(),mixed=Symbol('mixed');
  const names=['test_dashboard_public｜任务运行概览·7天','test_dashboard_public｜任务运行概览·30天','test_dashboard_public｜模拟运行详情'];
  input.views.forEach((n,i)=>{n.name=names[i];n.id='1:'+i;});
  const text=input.views[0].children[0];text.fills[0].type='SOLID';
  const figma={mixed,currentPage:{children:input.views}};
  const invoke=()=>new Function('figma','target','return (async()=>{'+exportCode+'})()')(figma,input.views[0]);
  const result=JSON.parse(JSON.stringify(await invoke()));
  assert.equal(result.views[0].children[0].letterSpacing.value,0);
  assert.match(renderDashboard(result),/letter-spacing:0px/);
  text.letterSpacing=mixed;
  await assert.rejects(invoke(),/字距/);
});
test('仅把案例规定的Frame映射为真实按钮，文字同名保持文本',()=>{
  const input=fixture(),child=input.views[0].children[0];child.name='近 30 天';
  const frame={...input.views[0],key:'week.1',name:'近 30 天',width:106,height:36,children:[]};
  input.views[0].children.push(frame);input.count++;
  const html=renderDashboard(input);
  assert.equal((html.match(/data-action="month"/g)||[]).length,1);
  assert.match(html,/<button data-node="week.1" type="button"/);
});
