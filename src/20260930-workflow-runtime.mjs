import { applyLayoutProperties } from './20261006-layout.mjs';
// 此函数由 CLI 序列化，运行于 Figma 插件内；只操作传入的目标子树。
export async function executeWorkflowStep(figma, root, task, applyLayout = applyLayoutProperties) {
  const { step, key, capabilities, verifyOnly = false } = task;
  const inside = node => { for (let n = node; n; n = n.parent) if (n.id === root.id) return true; return false; };
  async function locate(selector = {}) {
    if (selector.id) {
      const node = await figma.getNodeByIdAsync(selector.id);
      if (node) {
        if (!inside(node)) throw Error('目标超出本次步骤范围');
        if (selector.type && node.type !== selector.type) throw Error('目标类型已变化');
        if (selector.name && node.name !== selector.name) throw Error('目标名称已变化');
        return node;
      }
      if (!selector.path) throw Error('目标 ID 已失效，请核验后更新计划');
    }
    let node = root;
    for (const part of selector.path || []) {
      const matches = (node.children || []).filter(n => n.name === part);
      if (matches.length !== 1) throw Error('目标路径缺失或存在重名：' + part);
      node = matches[0];
    }
    if (selector.type && node.type !== selector.type) throw Error('目标类型不匹配');
    if (selector.name && node.name !== selector.name) throw Error('目标名称不匹配');
    return node;
  }
  const anchor = await locate(step.target);
  const operation = step.operation;
  let node = anchor, reused = false, reactionChange;
  if (operation.kind === 'create') {
    if (!verifyOnly && ['HORIZONTAL','VERTICAL','GRID'].includes(anchor.layoutMode)) {
      let envelope = anchor;
      while (['HORIZONTAL','VERTICAL','GRID'].includes(envelope.parent?.layoutMode)) envelope = envelope.parent;
      if (!inside(envelope)) throw Error('创建将重排步骤范围外的布局，请把 scopeNodeId 扩大到外层 Auto Layout 容器');
    }
    if (!anchor.appendChild) throw Error('创建目标不能容纳子节点');
    const registry = JSON.parse(anchor.getSharedPluginData('localFigmaWorkflow', 'localFigmaOutputs') || '{}');
    if (!registry || typeof registry !== 'object' || Array.isArray(registry)) throw Error('产物记录损坏');
    const recorded = registry[key] ? await figma.getNodeByIdAsync(registry[key]) : null;
    if (registry[key] && (!recorded || recorded.parent?.id !== anchor.id)) throw Error('既有产物被移动或删除，请核验后建立新步骤');
    const matches = (anchor.children || []).filter(n => n.getSharedPluginData('localFigmaWorkflow', 'localFigmaStep') === key);
    if (recorded && !matches.some(n => n.id === recorded.id)) throw Error('产物标记已变化');
    const orphan = (figma.currentPage.children || []).find(n => n.getSharedPluginData('localFigmaWorkflow', 'localFigmaStep') === key && n.parent?.id !== anchor.id);
    if (orphan) throw Error('发现创建中断的产物，请核验位置后恢复');
    if (matches.length > 1) throw Error('发现重复步骤标记，需要人工核验');
    if (matches.length) {
      node = matches[0]; reused = true;
      if (node.type !== operation.type) throw Error('步骤产物类型发生变化');
    } else {
      if (verifyOnly) throw Error('未发现既有产物，无法确认原步骤已完成');
      const factory = { FRAME: 'createFrame', RECTANGLE: 'createRectangle', ELLIPSE: 'createEllipse', TEXT: 'createText', COMPONENT: 'createComponent' }[operation.type];
      node = figma[factory]();
      // 创建后立即标记；属性写入中断后可定位同一产物继续设置。
      node.setSharedPluginData('localFigmaWorkflow', 'localFigmaStep', key);
      anchor.appendChild(node);
      registry[key] = node.id;
      anchor.setSharedPluginData('localFigmaWorkflow', 'localFigmaOutputs', JSON.stringify(registry));
    }
  }
  const p = operation.properties || {};
  if (!verifyOnly && Object.keys(p).length) {
    applyLayout(node, p, false);
    // Hug/Fill 重排必须包含在步骤根节点内，避免局部快照遗漏祖先或兄弟。
    if (Object.keys(p).some(k => k.startsWith('layout') || ['itemSpacing','paddingTop','paddingRight','paddingBottom','paddingLeft','textAutoResize','width','height'].includes(k))) {
      let envelope = node;
      while (['HORIZONTAL','VERTICAL','GRID'].includes(envelope.parent?.layoutMode)) envelope = envelope.parent;
      if (!inside(envelope)) throw Error('布局重排超出步骤范围，请把 scopeNodeId 扩大到外层 Auto Layout 容器');
    }
    if ('characters' in p || 'fontFamily' in p || 'fontStyle' in p || 'fontSize' in p || 'textAutoResize' in p || ('layoutSizingHorizontal' in p && node.type === 'TEXT') || ('layoutSizingVertical' in p && node.type === 'TEXT')) {
      if (node.type !== 'TEXT') throw Error('文字属性要求 TEXT 节点');
      if (p.fontFamily || p.fontStyle) {
        const font = { family: p.fontFamily || node.fontName?.family || 'Inter', style: p.fontStyle || node.fontName?.style || 'Regular' };
        await figma.loadFontAsync(font); node.fontName = font;
      } else if (typeof node.fontName === 'symbol') {
        if (!node.getRangeAllFontNames || !node.characters.length) throw Error('混合字体需要明确指定字体');
        for (const font of node.getRangeAllFontNames(0, node.characters.length)) await figma.loadFontAsync(font);
      } else await figma.loadFontAsync(node.fontName);
    }
    for (const field of ['name', 'x', 'y', 'opacity', 'visible', 'cornerRadius', 'characters', 'fontSize']) {
      if (field in p) {
        if (!(field in node)) throw Error('节点不支持属性：' + field);
        node[field] = p[field];
      }
    }
    applyLayout(node, p);
    if ('fill' in p) {
      if (!('fills' in node)) throw Error('节点不支持填充');
      const hex = p.fill.slice(1);
      node.fills = [{ type: 'SOLID', color: { r: parseInt(hex.slice(0, 2), 16) / 255, g: parseInt(hex.slice(2, 4), 16) / 255, b: parseInt(hex.slice(4, 6), 16) / 255 } }];
    }
  }
  if (!verifyOnly && operation.kind === 'scroll') {
    if (!capabilities.includes('scroll')) throw Error('任务未开启滚动能力');
    if (!('overflowDirection' in node)) throw Error('目标不支持滚动');
    node.overflowDirection = operation.direction;
  }
  if (!verifyOnly && operation.kind === 'connect') {
    const capability = operation.navigation === 'OVERLAY' ? 'overlay' : 'navigation';
    if (!capabilities.includes(capability)) throw Error('任务未开启对应交互能力');
    if (operation.animate && !capabilities.includes('smartAnimate')) throw Error('任务未开启动效能力');
    const destination = await locate(operation.destination);
    let a = node, b = destination;
    while (a && a.type !== 'PAGE') a = a.parent;
    while (b && b.type !== 'PAGE') b = b.parent;
    if (destination.type !== 'FRAME' || a?.id !== b?.id) throw Error('连接目标必须为同页 Frame');
    const action = { type: 'NODE', destinationId: destination.id, navigation: operation.navigation || 'NAVIGATE', transition: operation.animate ? { type: 'SMART_ANIMATE', easing: { type: 'EASE_IN_AND_OUT' }, duration: 0.3 } : null };
    const previous = JSON.parse(JSON.stringify(node.reactions || []));
    await node.setReactionsAsync([...previous.filter(r => r.trigger?.type !== 'ON_CLICK'), { trigger: { type: 'ON_CLICK' }, actions: [action] }]);
    reactionChange = { previous, current: JSON.parse(JSON.stringify(node.reactions || [])) };
  }
  const assertions = [];
  // 操作声明自动成为验收条件，防止只有 exists 断言时误认部分写入成功。
  const required = Object.entries(p).filter(([property]) => !['fontFamily', 'fontStyle'].includes(property)).map(([property, equals]) => ({ property, equals: property === 'fill' ? equals.toUpperCase() : equals, tolerance: typeof equals === 'number' ? 0.001 : undefined }));
  if (operation.kind === 'create') required.push({ property: 'type', equals: operation.type });
  if (operation.kind === 'scroll') required.push({ property: 'overflowDirection', equals: operation.direction });
  for (const [property, fontField] of [['fontFamily', 'family'], ['fontStyle', 'style']]) {
    if (property in p) assertions.push({ property, expected: p[property], actual: node.fontName?.[fontField] ?? null, passed: node.fontName?.[fontField] === p[property] });
  }
  if (operation.kind === 'connect') {
    const destination = await locate(operation.destination);
    const click = (node.reactions || []).filter(r => r.trigger?.type === 'ON_CLICK');
    const action = click[0]?.actions?.[0];
    const passed = click.length === 1 && click[0].actions.length === 1 && action?.type === 'NODE' && action.destinationId === destination.id && action.navigation === (operation.navigation || 'NAVIGATE') && (operation.animate ? action.transition?.type === 'SMART_ANIMATE' : action.transition == null);
    assertions.push({ property: 'connection', expected: destination.id, actual: action?.destinationId ?? null, passed });
  }
  for (const assertion of [...required, ...step.assertions]) {
    let subject = node;
    if (assertion.target) subject = await locate(assertion.target);
    let actual;
    if (assertion.property === 'exists') actual = !!subject && !subject.removed;
    else if (assertion.property === 'childCount') actual = (subject.children || []).length;
    else if (assertion.property === 'fill') {
      const fill = Array.isArray(subject.fills) && subject.fills.find(p => p.type === 'SOLID');
      actual = fill ? '#' + ['r', 'g', 'b'].map(k => Math.round(fill.color[k] * 255).toString(16).padStart(2, '0')).join('').toUpperCase() : null;
    } else if (assertion.property === 'reactionCount') actual = (subject.reactions || []).length;
    else actual = subject[assertion.property];
    const passed = typeof actual === 'number' && typeof assertion.equals === 'number'
      ? Math.abs(actual - assertion.equals) <= (assertion.tolerance || 0)
      : actual === assertion.equals;
    assertions.push({ property: assertion.property, expected: assertion.equals, actual: actual ?? null, passed });
  }
  return { nodeId: node.id, name: node.name, reused, verified: assertions.every(a => a.passed), assertions, ...(reactionChange ? { reactionChange } : {}), visualReview: 'not-run' };
}
