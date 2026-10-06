import { layoutFields, layoutEnums, layoutNumbers, validateLayoutProperties, applyLayoutProperties } from './20261006-layout.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { json, root, save, hash } from './project.mjs';
import { localResult } from './evidence.mjs';
import { waitForResult } from './wait.mjs';
import { executeWorkflowStep } from './20260930-workflow-runtime.mjs';

const identifier = s => typeof s === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/.test(s);
const object = v => v && typeof v === 'object' && !Array.isArray(v);
const capabilities = ['navigation', 'scroll', 'overlay', 'smartAnimate'];
const properties = [...layoutFields, 'name', 'x', 'y', 'width', 'height', 'opacity', 'visible', 'cornerRadius', 'characters', 'fontSize', 'fontFamily', 'fontStyle', 'fill'];
const assertionProperties = [...layoutFields, 'exists', 'name', 'type', 'childCount', 'fill', 'width', 'height', 'x', 'y', 'visible', 'opacity', 'characters', 'fontSize', 'reactionCount', 'overflowDirection'];
function exact(value, keys, label) {
  if (!object(value) || Object.keys(value).some(k => !keys.includes(k))) throw Error(label + ' 含未知字段或格式无效');
}
function selector(s) {
  if (s === undefined) return;
  exact(s, ['id', 'path', 'name', 'type'], '目标');
  if (s.id !== undefined && (typeof s.id !== 'string' || !/^(?:I)?\d+:\d+(?:;\d+:\d+)*$/.test(s.id))) throw Error('目标 ID 无效');
  if (s.path !== undefined && (!Array.isArray(s.path) || s.path.length > 32 || s.path.some(p => typeof p !== 'string' || !p || p.length > 200))) throw Error('目标路径需为精确名称数组');
  for (const k of ['name', 'type']) if (s[k] !== undefined && (typeof s[k] !== 'string' || !s[k] || s[k].length > 200)) throw Error('目标描述无效');
}
export function validatePlan(plan) {
  exact(plan, ['version', 'id', 'title', 'capabilities', 'steps'], '计划');
  if (plan.version !== 1 || !identifier(plan.id) || typeof plan.title !== 'string' || !plan.title.trim() || plan.title.length > 200) throw Error('计划需要 version:1、稳定 id 和标题');
  if (!Array.isArray(plan.capabilities) || plan.capabilities.some(c => !capabilities.includes(c)) || new Set(plan.capabilities).size !== plan.capabilities.length) throw Error('capabilities 需为明确能力数组；静态设计使用 []');
  if (!Array.isArray(plan.steps) || !plan.steps.length || plan.steps.length > 200) throw Error('计划需包含 1–200 个语义步骤');
  const ids = new Set();
  for (const s of plan.steps) {
    exact(s, ['id', 'title', 'scopeNodeId', 'target', 'operation', 'assertions', 'humanReview'], '步骤');
    if (!identifier(s.id) || ids.has(s.id) || typeof s.title !== 'string' || !s.title.trim() || s.title.length > 200) throw Error('步骤 ID 需唯一且有标题');
    ids.add(s.id); selector(s.target);
    if (s.scopeNodeId !== undefined) selector({ id: s.scopeNodeId });
    if (s.humanReview !== undefined && typeof s.humanReview !== 'boolean') throw Error('humanReview 需为布尔值');
    const op = s.operation;
    exact(op, ['kind', 'type', 'properties', 'direction', 'destination', 'navigation', 'animate'], '操作');
    if (!['create', 'update', 'scroll', 'connect'].includes(op.kind)) throw Error('不支持的结构化操作');
    if (op.kind === 'create' && !['FRAME', 'RECTANGLE', 'ELLIPSE', 'TEXT', 'COMPONENT'].includes(op.type)) throw Error('创建类型不受支持');
    if (op.kind !== 'create' && op.type !== undefined) throw Error('仅创建可指定 type');
    if (['create', 'update'].includes(op.kind)) {
      if (!object(op.properties) || !Object.keys(op.properties).length) throw Error('创建/修改需要 properties');
    }
    const p = op.properties || {};
    exact(p, properties, '属性');
    validateLayoutProperties(p);
    for (const [k, v] of Object.entries(p)) {
      if (layoutFields.includes(k)) continue;
      if (['x', 'y', 'width', 'height', 'opacity', 'cornerRadius', 'fontSize'].includes(k)) {
        if (typeof v !== 'number' || !Number.isFinite(v) || (['width', 'height', 'fontSize'].includes(k) && v <= 0) || (k === 'cornerRadius' && v < 0) || (k === 'opacity' && (v < 0 || v > 1))) throw Error('数值属性无效：' + k);
      } else if (k === 'visible') { if (typeof v !== 'boolean') throw Error('visible 需为布尔值'); }
      else if (typeof v !== 'string' || v.length > 10000 || (k === 'fill' && !/^#[0-9a-f]{6}$/i.test(v))) throw Error('文字或颜色属性无效：' + k);
    }
    if (op.kind !== 'scroll' && op.direction !== undefined) throw Error('仅 scroll 可以指定 direction');
    if (op.kind !== 'connect' && ['destination', 'navigation', 'animate'].some(k => k in op)) throw Error('连接参数只能用于 connect');
    if (op.kind === 'scroll' && (!plan.capabilities.includes('scroll') || !['NONE', 'HORIZONTAL', 'VERTICAL', 'HORIZONTAL_AND_VERTICAL'].includes(op.direction))) throw Error('滚动未授权或方向无效');
    if (op.kind === 'connect') {
      selector(op.destination);
      if (!op.destination || !['NAVIGATE', 'OVERLAY'].includes(op.navigation || 'NAVIGATE')) throw Error('连接目标或类型无效');
      if (op.animate !== undefined && typeof op.animate !== 'boolean') throw Error('animate 需为布尔值');
      if (!plan.capabilities.includes(op.navigation === 'OVERLAY' ? 'overlay' : 'navigation') || (op.animate && !plan.capabilities.includes('smartAnimate'))) throw Error('计划未开启本次交互能力');
    }
    if (!Array.isArray(s.assertions) || !s.assertions.length || s.assertions.length > 100) throw Error('每步必须声明机器断言');
    for (const a of s.assertions) {
      exact(a, ['target', 'property', 'equals', 'tolerance'], '断言'); selector(a.target);
      if (!assertionProperties.includes(a.property) || !['string', 'number', 'boolean'].includes(typeof a.equals) || (typeof a.equals === 'number' && !Number.isFinite(a.equals))) throw Error('断言属性或期望值无效');
      if (a.property in layoutEnums && !layoutEnums[a.property].includes(a.equals)) throw Error('布局断言枚举无效');
      if (layoutNumbers.includes(a.property) && (!Number.isFinite(a.equals) || a.equals < 0 || a.equals > 10000)) throw Error('布局断言数值无效');
      if (a.tolerance !== undefined && (typeof a.tolerance !== 'number' || !Number.isFinite(a.tolerance) || a.tolerance < 0 || typeof a.equals !== 'number')) throw Error('断言误差范围无效');
      if (a.property === 'exists' && a.equals !== true) throw Error('exists 仅支持 equals:true；目标缺失由寻址阶段报告');
      if (a.property === 'fill' && !/^#[0-9A-F]{6}$/.test(a.equals)) throw Error('填充断言使用大写 #RRGGBB');
    }
  }
  return plan;
}
const planFile = (cwd, id) => {
  if (!identifier(id)) throw Error('任务 ID 无效');
  return path.join(root(cwd), 'workflows', id + '.json');
};
export function stepCode(plan, step, bindingId, verifyOnly = false) {
  return `return (${executeWorkflowStep.toString()})(figma, target, ${JSON.stringify({ step, key: bindingId + ':' + plan.id + ':' + step.id, capabilities: plan.capabilities, verifyOnly })}, (${applyLayoutProperties.toString()}));`;
}
// 日志是唯一事实源；面板通过当前任务指针读取同一份日志。
export async function readProgress(cwd) {
  try {
    const pointer = await json(path.join(root(cwd), 'workflow-current.json'));
    const j = await json(planFile(cwd, pointer.id));
    const index = j.steps.findIndex(s => s.state !== 'done');
    const current = j.steps[index < 0 ? j.steps.length - 1 : index];
    const prior = index < 0 ? j.steps.at(-1) : index > 0 ? j.steps[index - 1] : null;
    const result = current?.attempts?.at(-1)?.result;
    const failed = j.state === 'failed' ? result?.output?.assertions?.find(a => a.passed === false) : null;
    const bounded = value => String(typeof value === 'string' ? value : JSON.stringify(value)).slice(0, 80);
    const failure = failed ? { property: bounded(failed.property), expected: bounded(failed.expected), actual: bounded(failed.actual) } : null;
    return { id: j.plan.id, title: j.plan.title, mode: j.plan.capabilities.length ? 'prototype' : 'static', current: index < 0 ? j.steps.length : index + 1, total: j.steps.length,
      target: current?.title, state: j.state, ...(failure ? { failure } : {}), previousTitle: prior?.title || '', previous: prior ? `${prior.title}：已通过` : '', updatedAt: j.updatedAt };
  } catch (e) { if (e.code === 'ENOENT') return null; throw e; }
}
async function lock(cwd) {
  const file = path.join(root(cwd), 'workflow.lock');
  let handle;
  try { handle = await fs.open(file, 'wx', 0o600); }
  catch (e) {
    if (e.code !== 'EEXIST') throw e;
    // 过期锁回收也需互斥，防止第二个进程删除刚创建的新锁。
    const reclaimFile = file + '.reclaim';
    let reclaim;
    try { reclaim = await fs.open(reclaimFile, 'wx', 0o600); }
    catch (error) { if (error.code === 'EEXIST') throw Error('另一进程正在恢复任务锁；若进程已退出，请核验遗留的 reclaim 锁'); throw error; }
    try {
      let owner;
      try { owner = JSON.parse(await fs.readFile(file, 'utf8')); }
      catch (error) { throw Error('任务锁变化或损坏，请重试或核查原进程'); }
      if (!Number.isInteger(owner.pid) || owner.pid <= 0) throw Error('任务锁 PID 无效');
      try { process.kill(owner.pid, 0); throw Error('已有流水线进程运行中'); }
      catch (error) { if (error.code !== 'ESRCH') throw error; }
      await fs.unlink(file);
      handle = await fs.open(file, 'wx', 0o600);
    } finally { await reclaim.close(); await fs.unlink(reclaimFile); }
  }
  await handle.writeFile(JSON.stringify({ pid: process.pid }));
  return async () => { await handle.close(); await fs.unlink(file); };
}
async function request(cwd, body) {
  const session = await json(path.join(root(cwd), 'session.json'));
  const response = await fetch(`http://127.0.0.1:${session.port}/job`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Session-Token': session.token }, body: JSON.stringify(body), signal: AbortSignal.timeout(10000), redirect: 'error' });
  const data = await response.json();
  if (!response.ok) throw Error(data.error || '提交失败');
  return data;
}
export async function workflowCommand(cwd, args, dependencies = {}) {
  const [action, argument, stepId, note, ...extra] = args;
  if (extra.length || !['import', 'status', 'run', 'retry', 'reconcile', 'approve'].includes(action) || !argument || ((action === 'approve') ? (!stepId || !note?.trim()) : stepId !== undefined)) throw Error('用法：workflow import <plan.json> | status/run/retry/reconcile <id> | approve <id> <step-id> <验收说明>');
  if (action === 'status') return json(planFile(cwd, argument));
  const release = await lock(cwd);
  try {
    const binding = await json(path.join(root(cwd), 'binding.json'));
    if (action === 'import') {
      const plan = validatePlan(await json(path.resolve(argument)));
      const file = planFile(cwd, plan.id);
      try { await fs.access(file); throw Error('任务 ID 已存在；继续请 run，独立修改请使用新 ID'); }
      catch (e) { if (e.code !== 'ENOENT') throw e; }
      const j = { version: 1, bindingId: binding.id, planHash: hash(JSON.stringify(plan)), plan, state: 'ready', updatedAt: new Date().toISOString(), steps: plan.steps.map(s => ({ id: s.id, title: s.title, state: 'pending', attempts: [] })) };
      await save(file, j); await save(path.join(root(cwd), 'workflow-current.json'), { id: plan.id });
      return j;
    }
    const file = planFile(cwd, argument), j = await json(file);
    validatePlan(j.plan);
    if (j.bindingId !== binding.id || j.planHash !== hash(JSON.stringify(j.plan))) throw Error('任务绑定或计划内容已变化，请保留日志并重新核查');
    const persist = async () => { j.updatedAt = new Date().toISOString(); await save(file, j); };
    await save(path.join(root(cwd), 'workflow-current.json'), { id: j.plan.id });
    const current = j.steps.find(s => s.state !== 'done');
    if (action === 'reconcile') {
      if (!current || current.state !== 'needs-review') throw Error('reconcile 只用于原任务结果未知的步骤');
      const original = await (dependencies.readResult || (id => localResult(cwd, id)))(current.attempts.at(-1).jobId);
      if (original.journalComplete) {
        current.state = 'running'; j.state = 'running'; await persist();
      } else {
        if (!original.resolution) throw Error('先停止旧插件，通过独立 inspect 和 resolve 核验原任务，再 reconcile');
        current.resolution = original.resolution;
        current.state = 'pending'; current.verifyOnly = true; j.state = 'ready'; await persist();
      }
    }
    if (action === 'approve') {
      if (!current || current.id !== stepId || current.state !== 'awaiting-review') throw Error('只能确认当前等待人工验收的步骤');
      current.review = { note, source: 'explicit-cli-confirmation', at: new Date().toISOString() };
      current.state = 'done'; j.state = 'ready'; await persist(); return j;
    }
    if (action === 'retry') {
      if (!current || current.state !== 'failed') throw Error('retry 仅用于已有明确失败结果的步骤；未知状态必须先读回');
      current.state = 'pending'; j.state = 'ready'; await persist();
    }
    const submit = dependencies.submit || (body => request(cwd, body));
    const wait = dependencies.wait || (id => waitForResult(cwd, id, 30));
    for (let i = 0; i < j.steps.length; i++) {
      const record = j.steps[i], step = j.plan.steps[i];
      if (record.state === 'done') continue;
      if (['awaiting-review', 'failed'].includes(record.state)) return j;
      let attempt = record.attempts.at(-1);
      if (record.state === 'pending') {
        attempt = { requestId: crypto.randomUUID(), state: 'submitting', verifyOnly: record.verifyOnly === true, code: stepCode(j.plan, step, binding.id, record.verifyOnly === true), ...(step.scopeNodeId ? { targetNodeId: step.scopeNodeId } : {}) };
        delete record.verifyOnly;
        record.attempts.push(attempt); record.state = 'running'; j.state = 'running'; await persist();
      }
      try {
        if (!attempt.jobId) {
          const job = await submit({ operation: 'run', requestId: attempt.requestId, code: attempt.code, ...(attempt.targetNodeId ? { targetNodeId: attempt.targetNodeId } : {}) });
          attempt.jobId = job.id; attempt.state = 'submitted'; await persist();
        }
        const result = await wait(attempt.jobId);
        if (result.waitStatus === 'needs-review') {
          record.state = 'needs-review'; j.state = 'needs-review';
          attempt.recovery = { recovery: result.recovery, resolution: result.resolution, instruction: result.instruction };
          await persist(); return j;
        }
        if (!result.journalComplete || result.waitStatus !== 'completed') {
          j.state = 'waiting'; attempt.state = 'waiting'; await persist(); return j;
        }
        attempt.result = result.result;
        attempt.state = result.result.ok ? 'completed' : 'failed';
        const verified = result.result.ok && result.result.output?.verified === true;
        record.state = verified ? (step.humanReview ? 'awaiting-review' : 'done') : 'failed';
        j.state = record.state === 'done' ? 'running' : record.state;
        await persist();
        if (record.state !== 'done') return j;
      } catch (e) {
        // 请求或读回失败仍保留原 requestId/jobId；续跑只认领原结果。
        j.state = 'waiting'; attempt.error = e.message; await persist(); return j;
      }
    }
    j.state = 'done'; await persist(); return j;
  } finally { await release(); }
}
