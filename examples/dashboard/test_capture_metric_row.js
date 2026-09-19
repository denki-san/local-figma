// 交给浏览器只读 evaluate 执行；仅适用于公开HTML示例的7天指标行。
() => {
  const view=document.querySelector('[data-view="week"]');
  if(!view || view.hidden)throw Error('请先打开公开HTML的7天视图');
  const labels=[...view.querySelectorAll('[data-node]')].filter(n=>n.children.length===0 && n.textContent==='完成任务');
  if(labels.length!==1)throw Error('需要唯一指标标题');
  const row=labels[0].parentElement.parentElement,rb=row.getBoundingClientRect();
  const plain=n=>{
    const s=getComputedStyle(n);
    if(s.opacity!=='1'||s.transform!=='none'||s.filter!=='none'||s.visibility!=='visible')throw Error('来源存在本例不支持的透明度、变换或效果');
    return s;
  };
  for(let n=row;n;n=n.parentElement)plain(n);
  const cards=[...row.children].map(card=>{
    const b=card.getBoundingClientRect(),s=plain(card);
    if(s.backgroundImage!=='none'||[s.borderTopRightRadius,s.borderBottomLeftRadius,s.borderBottomRightRadius].some(r=>r!==s.borderTopLeftRadius))throw Error('来源卡片圆角或背景超出本例支持范围');
    return {x:b.x-rb.x,y:b.y-rb.y,width:b.width,height:b.height,background:s.backgroundColor,radius:s.borderTopLeftRadius,shadow:s.boxShadow,texts:[...card.children].map(t=>{
      const r=t.getBoundingClientRect(),c=plain(t);
      if(c.textAlign!=='left'||c.fontStyle!=='normal'||c.textDecorationLine!=='none'||c.textTransform!=='none'||c.textShadow!=='none'||!['normal','0px'].includes(c.letterSpacing))throw Error('来源文字样式超出本例支持范围');
      if(t.scrollWidth>r.width+1 || t.scrollHeight>r.height+1)throw Error('网页文字存在溢出，请先修正来源');
      return {text:t.textContent,x:r.x-b.x,y:r.y-b.y,width:r.width,height:r.height,font:c.fontFamily,size:c.fontSize,weight:c.fontWeight,lineHeight:c.lineHeight,color:c.color};
    })};
  });
  if(cards.length!==4 || cards.some(c=>c.texts.length!==3))throw Error('公开指标行结构已变化');
  const schema=c=>({width:c.width,height:c.height,background:c.background,radius:c.radius,shadow:c.shadow,texts:c.texts.map(({text,...style})=>style)});
  const card=schema(cards[0]);
  if(cards.some(c=>JSON.stringify(schema(c))!==JSON.stringify(card)))throw Error('卡片样式存在差异，不能直接复用单一组件');
  return {format:'public-metric-row-v1',width:rb.width,height:rb.height,background:getComputedStyle(row).backgroundColor,card,items:cards.map(c=>({x:c.x,y:c.y,texts:c.texts.map(t=>t.text)}))};
}
