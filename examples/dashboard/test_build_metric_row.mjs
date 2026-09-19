import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

export function buildMetricRow(source){
  if(source?.format!=='public-metric-row-v1' || source.items?.length!==4 || source.card?.texts?.length!==3)throw Error('需要四张同样式指标卡的浏览器记录');
  const number=n=>{if(!Number.isFinite(n)||n<0||n>10000)throw Error('无效布局数值');return n;};
  const px=s=>{if(typeof s!=='string'||!/^\d+(?:\.\d+)?px$/.test(s))throw Error('需要像素样式');return number(Number(s.slice(0,-2)));};
  const rgb=s=>{const m=/^rgb\((\d+), (\d+), (\d+)\)$/.exec(s||'');if(!m||m.slice(1).some(n=>Number(n)>255))throw Error('需要不透明RGB样式');return {r:Number(m[1])/255,g:Number(m[2])/255,b:Number(m[3])/255};};
  const card=source.card;
  const gap=source.items[1].x-source.items[0].x-card.width;
  number(gap);number(source.width);number(source.height);number(card.width);number(card.height);
  if(!card.width||!card.height||source.items.some((n,i)=>n.x!==i*(card.width+gap)||n.y!==0||n.texts?.length!==3||n.texts.some(t=>typeof t!=='string'||t.length>1000))||source.width!==4*card.width+3*gap||source.height!==card.height)throw Error('仅支持等间距单行指标卡');
  const shadow=/^(rgb\(\d+, \d+, \d+\)) 0px 0px 0px (\d+(?:\.\d+)?)px inset$/.exec(card.shadow||'');
  if(!shadow)throw Error('需要案例内描边样式');
  const data={width:source.width,height:source.height,gap,background:rgb(source.background),card:{width:card.width,height:card.height,background:rgb(card.background),radius:px(card.radius),stroke:rgb(shadow[1]),strokeWeight:number(Number(shadow[2])),texts:card.texts.map(t=>{
    if(t.font!=='"PingFang SC", sans-serif'||!['400','600'].includes(t.weight))throw Error('本例需要已确认的PingFang SC字体');
    return {x:number(t.x),y:number(t.y),width:number(t.width),height:number(t.height),font:{family:'PingFang SC',style:t.weight==='600'?'Semibold':'Regular'},size:px(t.size),lineHeight:px(t.lineHeight),color:rgb(t.color)};
  })},items:source.items};
  return `// 由浏览器计算样式生成；仅复用公开合成组件，不修改主组件。
const data=${JSON.stringify(data)};
const page=figma.currentPage,name='test_c2d_public｜网页指标组件';
if(target.type!=='FRAME' || target.parent?.id!==page.id)throw Error('请绑定同页独立画板');
if(page.children.some(n=>n.name===name))throw Error('已有同名案例，先读回，禁止重复创建');
const matches=page.children.filter(n=>n.type==='COMPONENT' && n.name==='test_dashboard_public｜指标卡片');
if(matches.length!==1)throw Error('需要唯一公开指标主组件');
const main=matches[0];
const near=(a,b)=>Number.isFinite(a)&&Math.abs(a-b)<0.01;
const plain=n=>n.visible===true&&n.opacity===1&&n.rotation===0&&Array.isArray(n.effects)&&n.effects.every(e=>e.visible===false);
function paint(p,c){return Array.isArray(p)&&p.length===1&&p[0].type==='SOLID'&&p[0].visible!==false&&(p[0].opacity??1)===1&&['r','g','b'].every(k=>Math.abs(p[0].color[k]-c[k])<0.00001);}
function check(){
 if(!plain(main)||main.children.some(t=>!plain(t)||t.textAlignHorizontal!=='LEFT'||t.textDecoration!=='NONE'||t.letterSpacing?.value!==0))throw Error('主组件存在本例不支持的透明度、效果或文字样式');
 if(main.removed || main.parent?.id!==page.id || page!==figma.currentPage || target.removed || target.parent?.id!==page.id || page.children.some(n=>n.name===name))throw Error('目标状态变化，本次未创建');
 if(!near(main.width,data.card.width)||!near(main.height,data.card.height)||main.layoutMode!=='VERTICAL'||!near(main.cornerRadius,data.card.radius)||main.strokeAlign!=='INSIDE'||!near(main.strokeWeight,data.card.strokeWeight)||!paint(main.fills,data.card.background)||!paint(main.strokes,data.card.stroke)||main.children.length!==3)throw Error('主组件样式与网页不匹配');
 for(const [i,t] of main.children.entries()){
  const s=data.card.texts[i];
  if(t.type!=='TEXT'||t.hasMissingFont||['x','y','width','height'].some(k=>!near(t[k],s[k]))||t.fontName.family!==s.font.family||t.fontName.style!==s.font.style||!near(t.fontSize,s.size)||t.lineHeight.unit!=='PIXELS'||!near(t.lineHeight.value,s.lineHeight)||!paint(t.fills,s.color))throw Error('主组件文字与网页不匹配');
 }
}
check();for(const font of data.card.texts.map(t=>t.font))await figma.loadFontAsync(font);check();
const frame=figma.createFrame();frame.name=name;frame.resize(data.width,data.height);frame.x=Math.max(...page.children.filter(n=>n!==frame).map(n=>n.x+n.width))+160;frame.y=0;
frame.layoutMode='HORIZONTAL';frame.primaryAxisSizingMode='FIXED';frame.counterAxisSizingMode='FIXED';frame.itemSpacing=data.gap;frame.fills=[{type:'SOLID',color:data.background}];frame.strokes=[];
for(const item of data.items){const instance=main.createInstance();frame.appendChild(instance);instance.name=item.texts[0];instance.children.forEach((t,i)=>{t.characters=item.texts[i];});}
for(const [i,instance] of frame.children.entries()){
 const item=data.items[i];if((await instance.getMainComponentAsync())?.id!==main.id||!near(instance.x,item.x)||!near(instance.y,item.y)||instance.children.some((t,j)=>t.characters!==item.texts[j]))throw Error('实例结构读回不一致，保留现场');
}
return {board:frame.id,main:main.id,instances:frame.children.map(n=>n.id),layout:frame.layoutMode,gap:frame.itemSpacing,visualReview:'not-run'};
`;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const [sourceFile,outputFile]=process.argv.slice(2);
  if(!sourceFile||!outputFile)throw Error('用法：node test_build_metric_row.mjs <浏览器记录.json> <新脚本.js>');
  const code=buildMetricRow(JSON.parse(await fs.readFile(sourceFile,'utf8')));
  await fs.writeFile(outputFile,code,{flag:'wx'});console.log(JSON.stringify({script:path.resolve(outputFile),canvasExecution:'not-run'}));
}
