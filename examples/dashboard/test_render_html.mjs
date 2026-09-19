import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const escape=value=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
const finite=(value,label)=>{if(!Number.isFinite(value))throw Error('无效数值：'+label);return value;};
function color(paint){
  const channels=['r','g','b'].map(k=>Math.round(finite(paint.color?.[k],k)*255));
  return `rgba(${channels.join(',')},${finite(paint.opacity??1,'opacity')})`;
}
export function renderDashboard(input){
  if(input?.format!=='public-dashboard-v1' || !Array.isArray(input.views) || input.views.length!==3)throw Error('需要公开案例导出结果');
  const expected=['week','month','detail'];
  if(input.views.some((n,i)=>n.key!==expected[i]))throw Error('视图身份不符');
  const seen=new Set();let count=0;
  function render(node,isRoot=false){
    if(++count>1000 || seen.has(node.key) || !/^(week|month|detail)(\.\d+)*$/.test(node.key))throw Error('节点标识重复、非法或超预算');
    seen.add(node.key);
    if(!['FRAME','INSTANCE','TEXT'].includes(node.type))throw Error('不支持的节点类型');
    const style=['position:absolute',`left:${isRoot?0:finite(node.x,'x')}px`,`top:${isRoot?0:finite(node.y,'y')}px`,`width:${finite(node.width,'width')}px`,`height:${finite(node.height,'height')}px`,`opacity:${finite(node.opacity??1,'opacity')}`];
    if(node.width<0 || node.height<0)throw Error('尺寸无效');
    if(node.clipsContent)style.push('overflow:hidden');
    if(node.radii?.length!==4)throw Error('缺少圆角数据');
    style.push('border-radius:'+node.radii.map(n=>finite(n,'radius')+'px').join(' '));
    for(const paints of [node.fills,node.strokes])if(!Array.isArray(paints)||paints.length>1)throw Error('仅支持单层纯色');
    if(node.fills[0])style.push((node.type==='TEXT'?'color:':'background:')+color(node.fills[0]));
    if(node.strokes[0]){
      const weight=finite(node.strokeWeight,'strokeWeight');
      const ink=color(node.strokes[0]);
      if(node.strokeAlign==='INSIDE')style.push(`box-shadow:inset 0 0 0 ${weight}px ${ink}`);
      else if(node.strokeAlign==='OUTSIDE')style.push(`box-shadow:0 0 0 ${weight}px ${ink}`);
      else if(node.strokeAlign==='CENTER')style.push(`box-shadow:inset 0 0 0 ${weight/2}px ${ink},0 0 0 ${weight/2}px ${ink}`);
      else throw Error('不支持的描边位置');
    }
    let content,action;
    if(node.type==='TEXT'){
      if(node.fontName?.family!=='PingFang SC' || !['Regular','Medium','Semibold'].includes(node.fontName.style))throw Error('本例需要PingFang SC字体');
      const weight={Regular:400,Medium:500,Semibold:600}[node.fontName.style];
      const line=node.lineHeight?.unit==='PIXELS'?finite(node.lineHeight.value,'lineHeight')+'px':node.lineHeight?.unit==='PERCENT'?finite(node.lineHeight.value,'lineHeight')/100:'normal';
      style.push(`font-family:"PingFang SC",sans-serif`,`font-size:${finite(node.fontSize,'fontSize')}px`,`font-weight:${weight}`,`line-height:${line}`,'white-space:pre-wrap','overflow-wrap:break-word');
      if(!['PIXELS','PERCENT'].includes(node.letterSpacing?.unit))throw Error('缺少有效字距信息');
      if(node.letterSpacing?.unit==='PIXELS')style.push(`letter-spacing:${finite(node.letterSpacing.value,'letterSpacing')}px`);
      if(node.letterSpacing?.unit==='PERCENT')style.push(`letter-spacing:${finite(node.letterSpacing.value,'letterSpacing')/100}em`);
      const align={LEFT:'left',CENTER:'center',RIGHT:'right',JUSTIFIED:'justify'}[node.textAlignHorizontal];
      if(!align)throw Error('文字对齐信息缺失');style.push('text-align:'+align);
      content=escape(node.characters);
    }else{
      if(!Array.isArray(node.children))throw Error('缺少子节点');
      content=node.children.map(child=>render(child)).join('');
      if(node.type==='FRAME'){
        if(node.name==='近 30 天' && node.key.startsWith('week.'))action='month';
        if(node.name==='近 7 天' && node.key.startsWith('month.'))action='week';
        if(node.name==='运行记录｜周报资料整理')action='detail';
        if(node.name==='关闭详情')action='close';
      }
    }
    const tag=action?'button':'div';
    return `<${tag} data-node="${escape(node.key)}"${action?` type="button" data-action="${action}" aria-label="${escape(node.name)}"`:''} style="${escape(style.join(';'))}">${content}</${tag}>`;
  }
  const [week,month,detail]=input.views.map(n=>render(n,true));
  if(count!==input.count)throw Error('导出节点数量不一致');
  if(input.views[0].width!==1440 || input.views[0].height!==1024 || input.views[1].width!==1440 || input.views[1].height!==1024 || input.views[2].width!==480 || input.views[2].height!==352)throw Error('本例画板尺寸不符');
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>任务运行概览 · 合成演示</title><style>*{box-sizing:border-box}body{margin:0;background:#f7f9fc}button{border:0;padding:0;font:inherit;text-align:left;color:inherit;cursor:pointer}button:focus-visible{outline:2px solid #3370ff;outline-offset:3px}[hidden]{display:none!important}.view{position:relative;width:1440px;height:1024px}dialog{padding:0;border:0;width:480px;height:352px;max-width:none;max-height:none;background:transparent;overflow:visible}dialog::backdrop{background:rgba(29,33,41,.25)}</style></head><body><main aria-label="任务运行概览"><section class="view" data-view="week" aria-label="近7天">${week}</section><section class="view" data-view="month" aria-label="近30天" hidden>${month}</section></main><dialog aria-label="模拟运行详情">${detail}</dialog><script>
const modal=document.querySelector('dialog');let opener=null;
document.addEventListener('click',event=>{const button=event.target.closest('button[data-action]');if(!button)return;const action=button.dataset.action;if(action==='week'||action==='month'){for(const view of document.querySelectorAll('[data-view]'))view.hidden=view.dataset.view!==action;document.querySelector('[data-view="'+action+'"] button')?.focus({preventScroll:true});}else if(action==='detail'){opener=button;modal.showModal();}else if(action==='close'){modal.close();}});
modal.addEventListener('close',()=>{opener?.focus({preventScroll:true});});
</script></body></html>`;
}

if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const [inputFile,outputDirectory]=process.argv.slice(2);
  if(!inputFile || !outputDirectory)throw Error('用法：node test_render_html.mjs <导出任务result.json> <新输出目录>');
  const record=JSON.parse(await fs.readFile(inputFile,'utf8'));
  if(record.ok!==true)throw Error('导出任务未成功');
  const html=renderDashboard(record.output);
  const directory=path.resolve(outputDirectory);
  await fs.mkdir(directory,{recursive:false});
  await fs.writeFile(path.join(directory,'index.html'),html,{flag:'wx'});
  console.log(JSON.stringify({directory,html:'index.html',nodes:record.output.count,visualReview:'not-run',realClicks:'not-run'}));
}
