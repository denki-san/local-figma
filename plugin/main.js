figma.showUI(__html__, { width: 340, height: 360, themeColors: true });
let busy = false;
let checkpointWaiter = null;
let approvalWaiter = null;
let contextNonce = null;
let contextGeneration = 0;
let contextRefreshTimer = null;
let contextPage = null;
let uiBinding = null;
function scheduleContextRefresh() {
  // 文档已经变化，先使旧异步扫描失效；短时间内的事件只触发一次补充。
  contextGeneration++;
  if (!contextNonce || contextRefreshTimer !== null) return;
  contextRefreshTimer = setTimeout(() => {
    contextRefreshTimer = null;
    publishContext();
  }, 150);
}
function watchContextPage() {
  const page = figma.currentPage;
  if (contextPage === page) return;
  if (contextPage && typeof contextPage.off === 'function') contextPage.off('nodechange', scheduleContextRefresh);
  contextPage = page;
  if (typeof page.on === 'function') page.on('nodechange', scheduleContextRefresh);
}
// 网页组件常有多层包装；在节点总预算不变的前提下完整覆盖常见组件树。
const snapshotDepth = 32;
function publishContext() {
  if (!contextNonce) return;
  if (contextRefreshTimer !== null) {
    clearTimeout(contextRefreshTimer);
    contextRefreshTimer = null;
  }
  const generation = ++contextGeneration;
  try {
    watchContextPage();
    const page = figma.currentPage;
    if (uiBinding) {
      const binding = uiBinding, nonce = contextNonce;
      const report = (name, issue) => {
        if (generation === contextGeneration && nonce === contextNonce) figma.ui.postMessage({type:'target-info',contextNonce:nonce,name,issue});
      };
      if (binding.fileKey !== figma.fileKey) report('请打开已发送链接的文件', '当前文件与目标不一致，请回到目标文件运行插件。');
      else figma.getNodeByIdAsync(binding.nodeId).then(node => {
        if (!node || node.removed) return report('', '目标已不可用，请把新的目标链接发给 Agent。');
        let parent = node;
        while (parent && parent.type !== 'PAGE') parent = parent.parent;
        const outside = page.selection.some(selected => !within(selected, binding.nodeId));
        report(node.name, parent?.id !== page.id ? '请切回目标所在页面后继续。' : outside ? '当前选区超出目标范围。请选择范围内内容，或把新链接发给 Agent。' : null);
      }).catch(() => report('', '暂时无法读取目标，请让 Agent 检查连接。'));
    }
    const selection = page.selection.slice(0, 100);
    const candidates = new Map();
    for (const selected of selection) {
      let node = selected;
      while (node && !['FRAME', 'COMPONENT', 'INSTANCE', 'PAGE'].includes(node.type)) node = node.parent;
      if (node && node.type !== 'PAGE') candidates.set(node.id, node);
    }
    const target = candidates.size === 1 ? [...candidates.values()][0] : null;
    const context = { fileKey: figma.fileKey, pageId: page.id, pageName: page.name,
      selection: selection.map(node => ({ id: node.id, name: node.name, type: node.type, parentId: node.parent?.id, parentType: node.parent?.type })),
      target: target ? tree(target, 0, { count: 0, maxDepth: 1 }) : null,
      needsSelection: !target, revision: generation * 2, capturedAt: Date.now(), resources: { state: target ? 'loading' : 'needs-selection' } };
    figma.ui.postMessage({ type: 'context-update', contextNonce, context });
    if (target) {
      const nonce = contextNonce;
      const selectionKey = selection.map(node => node.id).join(',');
      const current = () => generation === contextGeneration && nonce === contextNonce && figma.currentPage.id === page.id && !target.removed && figma.currentPage.selection.map(node => node.id).join(',') === selectionKey;
      // 先推送即时选区，再异步补充有界资源；旧选择的慢请求不能覆盖新上下文。
      discoverDesignSystem(target, { maxNodes: 256, maxDepth: 8, isCurrent: current }).then(resources => {
        if (!current()) return;
        const enriched = { ...context, revision: context.revision + 1, resources: { state: resources.warnings.length ? 'needs-review' : 'ready', ...resources } };
        if (JSON.stringify(enriched).length > 256 * 1024) enriched.resources = { state: 'limited', message: '资源上下文超过大小限制，请缩小选择范围' };
        figma.ui.postMessage({ type: 'context-update', contextNonce: nonce, context: enriched });
      }).catch(error => {
        if (current()) figma.ui.postMessage({ type: 'context-update', contextNonce: nonce, context: { ...context, revision: context.revision + 1, resources: { state: 'limited', message: String(error) } } });
      });
    }
  } catch (error) {
    figma.ui.postMessage({ type: 'context-update', contextNonce, context: { fileKey: figma.fileKey, pageId: figma.currentPage?.id ?? '', selection: [], target: null, needsSelection: true, revision: generation * 2, error: String(error), capturedAt: Date.now() } });
  }
}
if (typeof figma.on === 'function') {
  figma.on('selectionchange', publishContext);
  figma.on('currentpagechange', publishContext);
  figma.on('stylechange', scheduleContextRefresh);
}
function requestApproval(job, send) {
  // 隐藏面板运行时也必须让用户看到确认；显示失败则保持拒绝执行。
  figma.ui.show();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { approvalWaiter = null; reject(Error('高风险确认超时，脚本未执行')); }, 300000);
    approvalWaiter = { id: job.id, channelNonce: job.channelNonce, finish(message) {
      clearTimeout(timer); approvalWaiter = null;
      if (message.approved === true) resolve();
      else reject(Error('高风险操作未获允许，脚本未执行'));
    } };
    send({ type: 'approval-request', id: job.id, reason: job.risk.reason,
      scriptHash: job.scriptHash, code: job.code, binding: { ...job.binding, nodeId: job.targetNodeId ?? job.binding.nodeId } });
  });
}
function saveCheckpoint(job, before, page, send) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      checkpointWaiter = null;
      reject(Error('修改前快照确认超时，本次脚本未执行'));
    }, 10000);
    checkpointWaiter = { id: job.id, channelNonce: job.channelNonce, finish(message) {
      clearTimeout(timer); checkpointWaiter = null;
      if (message.ok === true) resolve();
      else reject(Error('修改前快照保存失败，本次脚本未执行'));
    } };
    send({ type: 'checkpoint', id: job.id, before,
      bindingVerified: { fileKey: figma.fileKey, pageId: page.id, nodeId: before.id } });
  });
}
function tree(node, depth = 0, budget = { count: 0 }) {
  if (++budget.count > 2000) throw Error('目标超过 2000 个节点，请绑定更小区域');
  const value = { id: node.id, name: node.name, type: node.type };
  for (const key of [
    'visible', 'locked', 'x', 'y', 'width', 'height', 'rotation', 'opacity',
    'layoutMode', 'primaryAxisSizingMode', 'counterAxisSizingMode', 'layoutSizingHorizontal', 'layoutSizingVertical',
    'primaryAxisAlignItems', 'counterAxisAlignItems', 'layoutAlign', 'layoutGrow', 'layoutPositioning', 'layoutWrap',
    'itemSpacing', 'counterAxisSpacing', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
    'minWidth', 'maxWidth', 'minHeight', 'maxHeight', 'constraints', 'clipsContent',
    'overflowDirection', 'numberOfFixedChildren', 'scrollBehavior', 'reactions', 'flowStartingPoints',
    'textAutoResize', 'textTruncation', 'maxLines', 'characters', 'fontSize', 'fontName', 'lineHeight', 'letterSpacing',
    'textAlignHorizontal', 'textAlignVertical', 'paragraphIndent', 'paragraphSpacing', 'hasMissingFont',
    'fills', 'strokes', 'strokeWeight', 'strokeAlign', 'effects', 'cornerRadius',
    'topLeftRadius', 'topRightRadius', 'bottomLeftRadius', 'bottomRightRadius', 'cornerSmoothing',
    'textStyleId', 'fillStyleId', 'strokeStyleId', 'effectStyleId', 'gridStyleId', 'boundVariables', 'explicitVariableModes'
  ]) {
    if (key in node && node[key] !== undefined) {
      // 复制复合属性，保持前后快照独立，并保留嵌套混合值。
      value[key] = JSON.parse(JSON.stringify(node[key], (_, item) => typeof item === 'symbol' ? 'MIXED' : item));
    }
  }
  if ('children' in node) {
    if (depth >= (budget.maxDepth ?? snapshotDepth) && node.children.length) value.truncated = true;
    else value.children = node.children.map(child => tree(child, depth + 1, budget));
  }
  return value;
}
function within(node, rootId) {
  for (let current = node; current; current = current.parent) if (current.id === rootId) return true;
  return false;
}
function isTruncated(node) {
  return node.truncated === true || (node.children || []).some(isTruncated);
}
async function discoverDesignSystem(target, options = {}) {
  const styles = new Map(), variables = new Map(), components = new Map(), fonts = new Map(), warnings = [];
  let scannedNodes = 0;
  const reference = (map, id, nodeId, field) => {
    if (!map.has(id)) map.set(id, { id, usedBy: [] });
    const item = map.get(id);
    if (!item.usedBy.some(use => use.nodeId === nodeId && use.field === field)) item.usedBy.push({ nodeId, field });
    return item;
  };
  const aliases = (value, nodeId, field) => {
    if (!value || typeof value !== 'object') return;
    if (value.type === 'VARIABLE_ALIAS' && typeof value.id === 'string') reference(variables, value.id, nodeId, field);
    else for (const [key, child] of Object.entries(value)) aliases(child, nodeId, `${field}.${key}`);
  };
  async function visit(node, depth = 0) {
    if (options.isCurrent && !options.isCurrent()) throw Error('选区已变化，停止旧上下文扫描');
    if (++scannedNodes > (options.maxNodes ?? 2000)) throw Error('目标超过 ' + (options.maxNodes ?? 2000) + ' 个节点，请绑定更小区域');
    for (const field of ['textStyleId', 'fillStyleId', 'strokeStyleId', 'effectStyleId', 'gridStyleId']) {
      const id = node[field];
      if (typeof id === 'string' && id) reference(styles, id, node.id, field);
      else if (typeof id === 'symbol') warnings.push({ nodeId: node.id, field, message: '包含混合样式，文本范围级样式需另行检查' });
    }
    aliases(node.boundVariables, node.id, 'boundVariables');
    aliases(node.fills, node.id, 'fills');
    aliases(node.strokes, node.id, 'strokes');
    if (node.type === 'TEXT') {
      if (node.hasMissingFont) warnings.push({ nodeId: node.id, field: 'fontName', message: '文字含缺失字体，编辑前需要确认可用字体' });
      let names = [];
      if (typeof node.fontName === 'symbol') {
        if ((node.characters?.length ?? 0) > 50000) warnings.push({ nodeId: node.id, field: 'fontName', message: '混合字体文字超过50000字符，需缩小范围补充读取' });
        else {
          try { names = node.getRangeAllFontNames(0, node.characters.length); }
          catch { warnings.push({ nodeId: node.id, field: 'fontName', message: '混合字体读取失败，需检查文字范围' }); }
        }
      } else if (node.fontName) names = [node.fontName];
      for (const font of names) {
        if (!font || typeof font.family !== 'string' || typeof font.style !== 'string') continue;
        const fontName = { family: font.family, style: font.style };
        if (font.variationSettings) fontName.variationSettings = Object.fromEntries(Object.entries(font.variationSettings).sort(([a], [b]) => a.localeCompare(b)));
        const id = JSON.stringify(fontName);
        Object.assign(reference(fonts, id, node.id, 'fontName'), { fontName });
      }
    }
    if (node.type === 'INSTANCE') {
      try {
        const component = await node.getMainComponentAsync();
        if (component) Object.assign(reference(components, component.id, node.id, 'mainComponent'), {
          name: component.name, key: component.key, remote: component.remote, resolved: true
        });
        else warnings.push({ nodeId: node.id, message: '主组件不可解析，保留实例并检查组件来源' });
      } catch { warnings.push({ nodeId: node.id, message: '读取主组件失败，需检查组件来源或访问权限' }); }
    }
    if (node.children?.length) {
      if (depth >= (options.maxDepth ?? 16)) warnings.push({ nodeId: node.id, message: '扫描达到深度上限，请缩小目标补充扫描' });
      else for (const child of node.children) await visit(child, depth + 1);
    }
  }
  await visit(target);
  for (const item of styles.values()) {
    if (options.isCurrent && !options.isCurrent()) throw Error('选区已变化，停止旧上下文扫描');
    try {
      const style = await figma.getStyleByIdAsync(item.id);
      if (style) Object.assign(item, { name: style.name, type: style.type, key: style.key, remote: style.remote, resolved: true });
      else item.resolved = false;
    } catch { item.resolved = false; }
    if (!item.resolved) warnings.push({ id: item.id, message: '样式引用不可解析，保留引用并人工核验' });
  }
  for (const item of variables.values()) {
    if (options.isCurrent && !options.isCurrent()) throw Error('选区已变化，停止旧上下文扫描');
    try {
      const variable = await figma.variables.getVariableByIdAsync(item.id);
      if (variable) Object.assign(item, { name: variable.name, resolvedType: variable.resolvedType,
        collectionId: variable.variableCollectionId, key: variable.key, remote: variable.remote, resolved: true });
      else item.resolved = false;
    } catch { item.resolved = false; }
    if (!item.resolved) warnings.push({ id: item.id, message: '变量引用不可解析，保留引用并人工核验' });
  }
  const sorted = map => [...map.values()].sort((a, b) => b.usedBy.length - a.usedBy.length || a.id.localeCompare(b.id));
  return { scope: 'target-subtree-used-resources', targetId: target.id, scannedNodes,
    styles: sorted(styles), variables: sorted(variables), components: sorted(components), fonts: sorted(fonts), warnings,
    limitations: ['仅扫描目标子树已经引用的资源，未搜索相邻页面或未使用的库资源', '仅返回资源身份与使用位置，未解析变量模式值、样式属性或全部富文本范围', '扫描期间请避免并发编辑；结果供复用决策参考，未执行导入、实例化或共享定义修改'] };
}
figma.ui.onmessage = async job => {
  if (job?.type === 'context-request' && typeof job.contextNonce === 'string') {
    contextNonce = job.contextNonce;
    uiBinding = job.binding && typeof job.binding.fileKey === 'string' && typeof job.binding.nodeId === 'string' ? job.binding : null;
    publishContext();
    return;
  }
  if (job?.type === 'hide-ui') {
    figma.ui.hide();
    return;
  }
  if (job?.type === 'approval-ack') {
    if (approvalWaiter?.id === job.id && approvalWaiter.channelNonce === job.channelNonce) approvalWaiter.finish(job);
    return;
  }
  if (job?.type === 'checkpoint-ack') {
    if (checkpointWaiter?.id === job.id && checkpointWaiter.channelNonce === job.channelNonce) checkpointWaiter.finish(job);
    return;
  }
  if (!job || !job.id || busy) return;
  busy = true;
  const send = message => {
    const payload = { ...message, channelNonce: job.channelNonce };
    const serialized = JSON.stringify(payload);
    // 大量二进制数字数组逐字段跨宿主转换开销很高，使用单个字符串跨边界。
    figma.ui.postMessage(serialized.length > 65536
      ? { type: 'serialized-result', id: job.id, channelNonce: job.channelNonce, serialized }
      : payload);
  };
  console.info('[figma-local] 已收到任务');
  let before, target = null, page = null, executionStarted = false;
  // 预览只记录根节点摘要，避免复杂画板的截图被结构预算阻断；写入仍要求完整快照。
  const snapshot = () => tree(target, 0, { count: 0, maxDepth: job.operation === 'preview' ? 0 : job.operation === 'inspect' && target.type === 'PAGE' ? 1 : snapshotDepth });
  const undoBoundaries = { before: 'not-run', after: 'not-run' };
  try {
    if (!figma.fileKey) throw Error('无法核验 file key；请使用启用 private API 的 Development Plugin');
    if (figma.fileKey !== job.binding.fileKey) throw Error('当前文件与用户链接不匹配');
    if (figma.editorType !== 'figma' || figma.mode !== 'default') throw Error('请在 Figma Design 编辑模式运行插件');
    const candidate = await figma.getNodeByIdAsync(job.targetNodeId ?? job.binding.nodeId);
    if (!candidate || !within(candidate, job.binding.nodeId)) throw Error('局部目标不存在或超出绑定范围');
    target = candidate;
    console.info('[figma-local] 已解析目标');
    if (!target) throw Error('链接目标不存在');
    page = target;
    while (page && page.type !== 'PAGE') page = page.parent;
    if (!page) throw Error('链接未指向页面或画布节点');
    await page.loadAsync();
    console.info('[figma-local] 页面已加载');
    await figma.setCurrentPageAsync(page);
    before = JSON.parse(JSON.stringify(snapshot()));
    let output;
    if (job.operation === 'inspect') output = before;
    else if (job.operation === 'design-system') output = await discoverDesignSystem(target);
    else if (job.operation === 'preview') {
      const bytes = await target.exportAsync({ format: 'PNG', constraint: { type: 'SCALE', value: 1 } });
      send({ id: job.id, ok: true, png: Array.from(bytes), bindingVerified: { fileKey: figma.fileKey, pageId: page.id, nodeId: target.id }, before });
      return;
    } else if (job.operation === 'run') {
      if (isTruncated(before)) throw Error('修改前快照被截断，脚本未执行；请用 --node 缩小目标');
      if (job.risk?.level === 'high') await requestApproval(job, send);
      await saveCheckpoint(job, before, page, send);
      let currentPage = target;
      while (currentPage && currentPage.type !== 'PAGE') currentPage = currentPage.parent;
      if (figma.fileKey !== job.binding.fileKey || target.removed || !within(target, job.binding.nodeId) || currentPage?.id !== page.id || JSON.stringify(tree(target)) !== JSON.stringify(before)) throw Error('等待快照期间目标发生变化，本次脚本未执行；请重新 inspect');
      if (typeof figma.commitUndo !== 'function') throw Error('当前环境缺少 Undo 边界能力，脚本未执行');
      const commitUndo = figma.commitUndo.bind(figma);
      try { commitUndo(); undoBoundaries.before = 'committed'; }
      catch (error) { undoBoundaries.before = 'failed'; throw error; }
      executionStarted = true;
      let scriptFailure;
      try { output = await new Function('figma', 'target', 'return (async()=>{' + job.code + '\n})()')(figma, target); }
      catch (error) { scriptFailure = { error }; }
      // 成功与部分失败均划分历史边界；不自动触发全局 Undo。
      try { commitUndo(); undoBoundaries.after = 'committed'; }
      catch (error) {
        undoBoundaries.after = 'failed';
        throw Error(`${scriptFailure ? `脚本错误：${String(scriptFailure.error)}；` : ''}结束 Undo 边界失败：${String(error)}；请核对文档，禁止自动撤销或重放`);
      }
      if (scriptFailure) throw scriptFailure.error;
    } else throw Error('未知操作');
    const after = target.removed ? null : snapshot();
    let serializableOutput;
    try { serializableOutput = output === undefined ? null : JSON.parse(JSON.stringify(output)); }
    catch { throw Error('返回值无法转换为 JSON；脚本可能已经写入，请检查 before/after，禁止重放'); }
    send({ id: job.id, ok: true, output: serializableOutput, before, after, bindingVerified: { fileKey: figma.fileKey, pageId: page.id, nodeId: before.id }, visualReview: 'not-run', interactionReview: 'not-run', ...(job.operation === 'run' ? { undoBoundaries } : {}) });
  } catch (e) {
    console.info('[figma-local] 任务失败，正在回传');
    let after;
    try { if (target) after = target.removed ? null : snapshot(); } catch (_) {}
    send({ id: job.id, ok: false, error: String(e), before, after, executionStarted, recovery: '保留当前状态，先检查证据；不要自动重放脚本', ...(job.operation === 'run' ? { undoBoundaries } : {}) });
  } finally {
    busy = false;
    if (job.operation === 'run') publishContext();
  }
};
