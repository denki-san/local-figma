import fs from 'node:fs/promises';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { root, json } from './project.mjs';

const validId = id => /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(id || '');
async function optional(file) {
  try { return await json(file); } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
export async function evidence(cwd, id) {
  if (!validId(id)) throw Error('任务 ID 无效');
  const dir = path.join(root(cwd), 'runs', id);
  const job = await json(path.join(dir, 'job.json'));
  if (job.id !== id) throw Error('证据任务 ID 不匹配');
  const result = await optional(path.join(dir, 'result.json'));
  if (result && result.id !== id) throw Error('结果任务 ID 不匹配');
  if (result && typeof result.ok !== 'boolean') throw Error('结果状态无效');
  const checkpoint = await optional(path.join(dir, 'before.json'));
  if (checkpoint && checkpoint.id !== id) throw Error('修改前快照任务 ID 不匹配');
  return { job, result, checkpoint, recovery: await optional(path.join(dir, 'recovery.json')), resolution: await optional(path.join(dir, 'resolution.json')), dir };
}
export async function localResult(cwd, id) {
  const record = await evidence(cwd, id);
  const journalComplete = !!record.result && record.job.state === (record.result.ok ? 'done' : 'failed') && isDeepStrictEqual(record.job.result, record.result);
  return { source: 'local-evidence', evidence: record.dir, result: record.result,
    checkpointFile: record.checkpoint ? path.join(record.dir, 'before.json') : null,
    recordedState: record.job.state, journalComplete, recovery: record.recovery, resolution: record.resolution,
    instruction: journalComplete ? '结果来自已保存证据；视觉与交互需单独检查' : record.resolution ? record.resolution.instruction : record.result
      ? '结果已保存，任务日志尚未确认完成；检查 bridge 状态并保留插件以便重试回传，禁止重放脚本'
      : '尚无持久化结果；先检查连接并读回文档，禁止盲目重放' };
}
export async function history(cwd) {
  let entries;
  try { entries = await fs.readdir(path.join(root(cwd), 'runs'), { withFileTypes: true }); }
  catch (error) { if (error.code === 'ENOENT') return { runs: [] }; throw error; }
  const runs = [];
  for (const entry of entries.filter(e => e.isDirectory() && validId(e.name))) {
    try {
      const { job, result, recovery, resolution } = await evidence(cwd, entry.name);
      runs.push({ id: job.id, operation: job.operation, createdAt: job.createdAt,
        recordedState: job.state, hasResult: !!result, ok: result?.ok ?? null,
        recovery: recovery?.status ?? null, resolution: resolution?.status ?? null });
    } catch (error) { runs.push({ id: entry.name, error: error.message }); }
  }
  runs.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '') || a.id.localeCompare(b.id));
  return { source: 'local-evidence', runs };
}

function indexTree(tree) {
  const nodes = new Map(); let truncated = false;
  const visit = (node, parentId = null, position = 0) => {
    if (!node || typeof node.id !== 'string' || nodes.has(node.id)) throw Error('快照节点缺少 ID 或包含重复 ID');
    const { children, ...properties } = node;
    truncated ||= node.truncated === true;
    nodes.set(node.id, { properties, parentId, position });
    if (children !== undefined && !Array.isArray(children)) throw Error('快照 children 无效');
    for (const [i, child] of (children || []).entries()) visit(child, node.id, i);
  };
  if (tree !== null) visit(tree);
  return { nodes, truncated };
}
export function diffTrees(before, after) {
  if (before === undefined || after === undefined) throw Error('缺少前后快照，无法生成 diff');
  const a = indexTree(before), b = indexTree(after);
  if (a.truncated || b.truncated) throw Error('快照被截断，无法可靠判断新增或删除；请缩小目标区域');
  const changes = [];
  for (const [id, old] of a.nodes) {
    const next = b.nodes.get(id);
    if (!next) { changes.push({ id, type: 'deleted', name: old.properties.name }); continue; }
    const properties = {};
    for (const key of [...new Set([...Object.keys(old.properties), ...Object.keys(next.properties)])].sort()) {
      if (!isDeepStrictEqual(old.properties[key], next.properties[key])) {
        properties[key] = { before: old.properties[key] ?? null, after: next.properties[key] ?? null };
      }
    }
    if (Object.keys(properties).length) changes.push({ id, type: 'updated', properties });
    if (old.parentId !== next.parentId || old.position !== next.position) changes.push({ id, type: 'moved',
      before: { parentId: old.parentId, position: old.position }, after: { parentId: next.parentId, position: next.position } });
  }
  for (const [id, node] of b.nodes) if (!a.nodes.has(id)) changes.push({ id, type: 'created', name: node.properties.name, parentId: node.parentId });
  return { scope: 'captured-target-subtree', changes, changedNodeCount: new Set(changes.map(c => c.id)).size,
    visualReview: 'not-run', interactionReview: 'not-run',
    limitation: '仅比较快照包含的属性与目标子树；子树外变更不可见，离开子树的节点会显示为 deleted' };
}
export async function diffRun(cwd, id) {
  const { result } = await evidence(cwd, id);
  if (!result) throw Error('尚无持久化结果，无法生成 diff');
  return { id, executionOk: result.ok, ...diffTrees(result.before, result.after) };
}
