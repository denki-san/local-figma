import fs from 'node:fs/promises';
import path from 'node:path';
import { evidence } from './evidence.mjs';

export function validateTree(tree) {
  const checks = [], seen = new Set();
  const add = (ruleId, status, message, node) => checks.push({ ruleId, status, message, ...(node ? { nodeIds: [node.id] } : {}) });
  if (!tree) {
    add('snapshot', 'failed', tree === null ? '目标已删除，缺少可检查的目标结构' : '缺少执行后的结构快照');
    return checks;
  }
  function visit(node, parent, hidden = false) {
    if (!node || typeof node.id !== 'string' || seen.has(node.id)) throw Error('快照包含无效或重复节点 ID');
    seen.add(node.id);
    hidden ||= node.visible === false;
    if (node.truncated) add('snapshot-completeness', 'skipped', '子树被截断，请缩小目标后重新 inspect', node);
    if (!hidden) {
      if (!node.name?.trim() || /^(Frame|Group|Rectangle|Text|Vector|Ellipse)\s*\d*$/i.test(node.name)) add('meaningful-name', 'warning', '建议用用途和内容范围命名节点', node);
      for (const key of ['width', 'height']) if (key in node && (!Number.isFinite(node[key]) || node[key] < 0)) add('geometry', 'failed', `${key} 包含无效尺寸`, node);
      if (node.type === 'TEXT') {
        for (const key of ['fontName', 'fontSize', 'lineHeight', 'letterSpacing']) {
          if (!(key in node)) add('typography-coverage', 'skipped', `快照缺少 ${key}，需要重新采集或人工检查`, node);
          else if (node[key] === 'MIXED') add('mixed-typography', 'warning', `${key} 存在混合值；检查是否符合富文本意图`, node);
        }
        if (typeof node.fontSize === 'number' && (!Number.isFinite(node.fontSize) || node.fontSize <= 0)) add('font-size', 'failed', '字号应为有限正数', node);
        if (typeof node.characters === 'string' && !node.characters.trim()) add('empty-text', 'warning', '可见文字为空，请确认是否为预留状态', node);
        if (node.textAutoResize === 'NONE' || node.textAutoResize === 'TRUNCATE') add('text-fit', 'warning', '固定尺寸或截断文字需要检查实际显示行数与内容完整性', node);
        if (node.hasMissingFont === true) add('missing-font', 'warning', '文字使用缺失字体，先检查当前环境字体再修改或评审', node);
        if (node.maxLines !== undefined && node.maxLines !== null) {
          if (!Number.isFinite(node.maxLines) || node.maxLines < 1) add('max-lines', 'failed', 'maxLines 应为至少 1 的有限数值或 null', node);
          else if (node.textTruncation !== 'ENDING') add('truncation-settings', 'warning', '设置了 maxLines，但未启用 ENDING；请核对预期截断行为', node);
        }
        if (node.textTruncation === 'ENDING' && ['HEIGHT', 'WIDTH_AND_HEIGHT'].includes(node.textAutoResize) && node.maxLines == null && node.maxHeight == null) {
          add('truncation-settings', 'warning', '自动尺寸文字启用截断但没有 maxLines 或 maxHeight 限制，请检查是否会无限展开', node);
        }
      }
      if (parent?.clipsContent === true) {
        const usable = [node.x, node.y, node.width, node.height, parent.width, parent.height].every(Number.isFinite) && node.rotation === 0;
        if (!usable) add('clip-bounds', 'skipped', '缺少几何数据或存在旋转，需截图检查裁切', node);
        else if (node.x < -0.5 || node.y < -0.5 || node.x + node.width > parent.width + 0.5 || node.y + node.height > parent.height + 0.5) add('clip-bounds', 'warning', '节点超出裁切容器；可能属于预期滚动内容，请检查实际可见范围', node);
      }
    }
    if (node.children !== undefined && !Array.isArray(node.children)) throw Error('快照 children 无效');
    for (const child of node.children || []) visit(child, node, hidden);
  }
  visit(tree);
  add('snapshot', 'passed', `已检查 ${seen.size} 个已采集节点；隐藏子树跳过视觉类规则`);
  return checks;
}

export async function validateRun(cwd, id) {
  const { job, result, dir } = await evidence(cwd, id);
  if (!result) throw Error('尚无持久化结果，请先检查任务状态');
  // preview 只保留导出前结构；run 的缺失 after 必须保持未知。
  const tree = job.operation === 'preview' ? result.before : result.after;
  const checks = validateTree(tree);
  let scriptArtifact = 'unknown';
  try { await fs.access(path.join(dir, 'script.js')); scriptArtifact = 'passed'; } catch {}
  const failed = checks.some(c => c.status === 'failed') || result.ok === false;
  return {
    schemaVersion: 1, runId: id, status: failed ? 'failed' : 'needs-review', checks,
    evidenceLevel: {
      binding: result.bindingVerified ? 'passed' : 'unknown', scriptArtifact,
      structuredResultArtifact: 'passed', execution: result.ok === true ? 'passed' : result.ok === false ? 'failed' : 'unknown',
      readback: tree ? 'passed' : 'unknown', visual: 'not-run', interaction: 'not-run', userAcceptance: 'not-run'
    },
    remainingChecks: ['截图检查文字真实溢出、重叠、对齐和图像', '确认富文本与滚动裁切是否符合设计意图', '核对业务内容、组件及变量绑定', '真实点击主要路径并检查返回与滚动', '用户验收；当前报告仅覆盖已采集属性，缺少告警不能证明设计通过']
  };
}
