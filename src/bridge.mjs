import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { json, root, save, hash } from './project.mjs';
import { createConnection } from './connection.mjs';
import { pairingToken, unfinishedOperations } from './session-state.mjs';
import { isNodeId } from './node-id.mjs';

const assets = fileURLToPath(new URL('../plugin/', import.meta.url));
export async function start(cwd, port = 43187, connectionOptions = {}) {
  const dir = root(cwd), binding = await json(path.join(dir, 'binding.json'));
  const lock = await fs.open(path.join(dir, 'bridge.lock'), 'wx', 0o600);
  try { await lock.writeFile(String(process.pid)); }
  catch (error) {
    await lock.close();
    await fs.unlink(path.join(dir, 'bridge.lock'));
    throw error;
  }
  const tokens = { cli: crypto.randomBytes(32).toString('hex'), plugin: crypto.randomBytes(32).toString('hex') };
  const sessionId = crypto.randomUUID(), connection = createConnection(connectionOptions);
  let active = null;
  let context = null, contextOwner = null;
  const jobs = new Map();
  const completing = new Map();
  const checkpoints = new Map();
  const approvals = new Map();
  const deliveries = new Map();
  const runDir = id => path.join(dir, 'runs', id);
  async function persistCompletion(job, data) {
    let result;
    try {
      result = await json(path.join(runDir(job.id), 'result.json'));
      if (result.id !== job.id || typeof result.ok !== 'boolean') throw Error('已有结果无效，保留证据后检查');
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    if (!result) {
      if (data.png) {
        if (!Array.isArray(data.png) || data.png.some(n => !Number.isInteger(n) || n < 0 || n > 255)) throw Error('图像数据无效');
        await fs.writeFile(path.join(runDir(job.id), 'preview.png'), Buffer.from(data.png), { mode: 0o600 });
        delete data.png; data.preview = 'preview.png';
      }
      result = { ...data, finishedAt: new Date().toISOString() };
      await save(path.join(runDir(job.id), 'result.json'), result);
    }
    // 两份记录均保存后再释放任务；重试沿用已经落盘的原始结果。
    const completed = { ...job, result, state: result.ok ? 'done' : 'failed' };
    await save(path.join(runDir(job.id), 'job.json'), completed);
    Object.assign(job, completed);
    if (active === job.id) active = [...jobs.values()].find(item => item.id !== job.id && item.state === 'running')?.id ?? null;
  }
  const server = http.createServer(async (req, res) => {
    const reply = (status, data) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(data)); };
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type,X-Session-Token');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    if (req.method === 'OPTIONS') return reply(204, null);
    try {
      const u = new URL(req.url, 'http://localhost');
      const role = ['/poll', '/heartbeat', '/checkpoint', '/approve', '/complete'].includes(u.pathname) || (u.pathname === '/context' && req.method === 'POST') ? 'plugin' : 'cli';
      if (req.headers['x-session-token'] !== tokens[role]) return reply(403, { error: '认证失败' });
      if (req.method === 'GET' && u.pathname === '/context') return reply(200, { connected: connection.connected, context, stale: !context || !connection.owns(contextOwner) });
      if (req.method === 'GET' && u.pathname === '/status') return reply(200, { sessionId, connected: connection.connected, pollAgeMs: connection.ageMs, active, binding, jobs: [...jobs.values()].map(j => ({ id: j.id, state: j.state })) });
      if (req.method === 'GET' && ['/poll', '/heartbeat'].includes(u.pathname)) {
        const client = u.searchParams.get('client');
        const lease = connection.touch(client, active !== null);
        if (!lease.ok) return reply(409, { code: lease.code, error: lease.code === 'OPERATION_UNCERTAIN' ? '需要你处理：上次操作结果尚未确认，已阻止重复执行' : '正在重连', retryable: lease.code === 'CONNECTION_IN_USE' });
        if (u.pathname === '/heartbeat') return reply(200, { connected: true, active });
        const job = active && jobs.get(active);
        if (!job || job.state !== 'queued' || deliveries.has(job.id)) return reply(200, null);
        const delivery = save(path.join(runDir(job.id), 'job.json'), { ...job, state: 'running' });
        deliveries.set(job.id, delivery);
        try {
          await delivery;
          job.state = 'running';
        } finally { deliveries.delete(job.id); }
        return reply(200, { ...job, binding });
      }
      if (req.method === 'GET' && u.pathname === '/result') {
        const id = u.searchParams.get('id');
        if (!/^[a-f0-9-]{36}$/.test(id || '')) return reply(400, { error: '任务 ID 无效' });
        const job = jobs.get(id);
        if (!job) return reply(404, { error: '任务不属于当前会话；请查看本地 evidence' });
        return reply(200, job.result || { id, state: job.state });
      }
      if (req.method !== 'POST') return reply(404, { error: '未知接口' });
      const chunks = []; let size = 0;
      for await (const c of req) { size += c.length; if (size > 16 * 1024 * 1024) return reply(413, { error: '请求过大' }); chunks.push(c); }
      const data = JSON.parse(Buffer.concat(chunks).toString());
      if (u.pathname === '/context') {
        if (!connection.owns(data.client)) return reply(409, { error: '连接已变化，忽略旧上下文' });
        if (data.context?.fileKey !== binding.fileKey || typeof data.context.pageId !== 'string' || !Array.isArray(data.context.selection) || data.context.selection.length > 100 || JSON.stringify(data.context).length > 256 * 1024) throw Error('上下文目标或大小无效');
        const revision = data.context.revision;
        if (revision !== undefined && (!Number.isSafeInteger(revision) || revision < 0)) throw Error('上下文版本无效');
        // 版本仅在当前插件身份内比较；新插件可从零开始，旧身份仍由连接租约拒绝。
        if (contextOwner === data.client && Number.isSafeInteger(context?.revision) && (revision === undefined || revision <= context.revision)) return reply(200, { received: true, ignored: 'stale-context' });
        context = { ...data.context, receivedAt: new Date().toISOString() };
        contextOwner = data.client;
        return reply(200, { received: true });
      }
      if (u.pathname === '/approve') {
        const job = jobs.get(data.id);
        if (!job || job.state !== 'running' || job.risk?.level !== 'high' || data.scriptHash !== job.scriptHash || typeof data.approved !== 'boolean') throw Error('确认目标、脚本或状态无效');
        let entry = approvals.get(job.id);
        if (entry && entry.approved !== data.approved) throw Error('本次确认已记录，不能改变决定');
        if (!entry) {
          const approval = { approved: data.approved, scriptHash: job.scriptHash, bindingId: binding.id, decidedAt: new Date().toISOString(), source: 'plugin-ui' };
          entry = { approved: data.approved, promise: (async () => {
            await save(path.join(runDir(job.id), 'approval.json'), approval);
            return approval;
          })() };
          approvals.set(job.id, entry);
        }
        let approval;
        try { approval = await entry.promise; }
        catch (error) { if (approvals.get(job.id) === entry) approvals.delete(job.id); throw error; }
        return reply(200, approval);
      }
      if (u.pathname === '/checkpoint') {
        const job = jobs.get(data.id);
        if (!job || job.state !== 'running' || job.operation !== 'run') throw Error('仅执行中的脚本任务可以保存修改前快照');
        if (job.risk?.level === 'high' && (await approvals.get(job.id)?.promise)?.approved !== true) throw Error('高风险脚本尚未获得允许');
        const expectedNodeId = job.targetNodeId ?? binding.nodeId;
        if (data.before?.id !== expectedNodeId || data.bindingVerified?.nodeId !== expectedNodeId || data.bindingVerified?.fileKey !== binding.fileKey || typeof data.bindingVerified?.pageId !== 'string') throw Error('快照目标与绑定不匹配');
        const value = { id: job.id, before: data.before, bindingVerified: data.bindingVerified };
        const digest = hash(JSON.stringify(value));
        let entry = checkpoints.get(job.id);
        if (entry && entry.digest !== digest) throw Error('修改前快照已锁定，拒绝覆盖');
        if (!entry) {
          entry = { digest, promise: save(path.join(runDir(job.id), 'before.json'), value) };
          checkpoints.set(job.id, entry);
        }
        try { await entry.promise; }
        catch (error) { if (checkpoints.get(job.id) === entry) checkpoints.delete(job.id); throw error; }
        return reply(200, { saved: true, hash: digest });
      }
      if (u.pathname === '/job') {
        if (!connection.connected) return reply(409, { error: '正在重连，请稍候；当前请求尚未执行', code: 'RECONNECTING' });
        if (active) return reply(409, { error: '有未完成任务；先读回结果，禁止重放' });
        if (!['inspect', 'preview', 'design-system', 'run'].includes(data.operation)) throw Error('未知操作');
        if (data.targetNodeId !== undefined && !isNodeId(data.targetNodeId)) throw Error('局部目标 ID 无效');
        if (data.operation === 'run' && (typeof data.code !== 'string' || !data.code.trim())) throw Error('缺少可信脚本');
        const risk = data.risk || { level: 'normal' };
        if (!['normal', 'high'].includes(risk.level) || (risk.level === 'high' && (data.operation !== 'run' || typeof risk.reason !== 'string' || !risk.reason.trim() || risk.reason.length > 1000))) throw Error('风险声明无效；高风险需要不超过 1000 字的说明');
        const id = crypto.randomUUID();
        const job = { id, operation: data.operation, code: data.code || '', ...(data.targetNodeId === undefined ? {} : { targetNodeId: data.targetNodeId }), risk: { level: risk.level, ...(risk.level === 'high' ? { reason: risk.reason } : {}) }, state: 'queued', createdAt: new Date().toISOString(), scriptHash: hash(data.code || ''), bindingId: binding.id };
        active = id;
        try {
          await fs.mkdir(runDir(id), { recursive: true, mode: 0o700 });
          await fs.writeFile(path.join(runDir(id), 'script.js'), job.code || `// 内建操作：${job.operation}\n`, { mode: 0o600 });
          await save(path.join(runDir(id), 'job.json'), job);
          jobs.set(id, job);
        } catch (error) { active = null; throw error; }
        return reply(202, { id, state: 'queued', evidence: runDir(id) });
      }
      if (u.pathname === '/complete') {
        const job = jobs.get(data.id);
        if (!job || !['running', 'done', 'failed'].includes(job.state)) throw Error('未知任务或任务尚未交付');
        if (job.result) return reply(200, { received: true });
        if (typeof data.ok !== 'boolean') throw Error('结果缺少状态');
        let pending = completing.get(job.id);
        if (!pending) {
          pending = persistCompletion(job, data);
          completing.set(job.id, pending);
        }
        try { await pending; }
        finally { if (completing.get(job.id) === pending) completing.delete(job.id); }
        return reply(200, { received: true });
      }
      reply(404, { error: '未知接口' });
    } catch (e) { reply(400, { error: e.message }); }
  });
  let uiTouched = false, sessionTouched = false;
  try {
    if (connectionOptions.persistentPlugin) {
      tokens.plugin = await pairingToken(dir);
      for (const job of await unfinishedOperations(dir, binding.id)) jobs.set(job.id, job);
      active = [...jobs.keys()][0] ?? null;
    }
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
    port = server.address().port;
    const pluginDir = path.join(dir, 'plugin');
    await fs.mkdir(pluginDir, { recursive: true, mode: 0o700 });
    await fs.copyFile(path.join(assets, 'main.js'), path.join(pluginDir, 'main.js'));
    const ui = (await fs.readFile(path.join(assets, 'ui.html'), 'utf8')).replace('SESSION_CONFIG', JSON.stringify({ port, token: tokens.plugin, binding: { fileKey: binding.fileKey, nodeId: binding.nodeId } }).replace(/</g, '\\u003c'));
    uiTouched = true;
    await fs.writeFile(path.join(pluginDir, 'ui.html'), ui, { mode: 0o600 });
    await save(path.join(pluginDir, 'manifest.json'), { name: 'Figma Local Runtime', api: '1.0.0', main: 'main.js', ui: 'ui.html', editorType: ['figma'], documentAccess: 'dynamic-page', enablePrivatePluginApi: true, networkAccess: { allowedDomains: ['none'], devAllowedDomains: [`http://localhost:${port}`] } });
    sessionTouched = true;
    await save(path.join(dir, 'session.json'), { port, token: tokens.cli, sessionId });
  } catch (error) {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    const failures = [];
    // 只清理本次启动触及的凭证；端口冲突时保留已有文件。
    if (sessionTouched) {
      try { await fs.rm(path.join(dir, 'session.json'), { force: true }); }
      catch (cleanupError) { failures.push(cleanupError); }
    }
    if (uiTouched && !connectionOptions.persistentPlugin) {
      try { await fs.writeFile(path.join(dir, 'plugin/ui.html'), '桥接启动失败。修复后重新 connect。', { mode: 0o600 }); }
      catch (cleanupError) { failures.push(cleanupError); }
    }
    await lock.close();
    if (!failures.length) await fs.unlink(path.join(dir, 'bridge.lock'));
    if (failures.length) throw new AggregateError([error, ...failures], '桥接启动失败且凭证清理未完成；已停止监听并保留锁，请检查文件权限与旧插件后恢复');
    throw error;
  }
  let closing;
  const close = () => closing ??= (async () => {
    server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
    await Promise.allSettled([...deliveries.values()]);
    await Promise.allSettled([...completing.values()]);
    await Promise.allSettled([...checkpoints.values()].map(entry => entry.promise));
    await Promise.allSettled([...approvals.values()].map(entry => entry.promise));
    if (active) await save(path.join(runDir(active), 'recovery.json'), { status: 'unknown-after-disconnect', instruction: '重新连接后先 inspect，禁止重放脚本' });
    await fs.rm(path.join(dir, 'session.json'), { force: true });
    if (!connectionOptions.persistentPlugin) await fs.writeFile(path.join(dir, 'plugin', 'ui.html'), '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><p role="status">需要你处理</p><p>桥接已关闭。请让 Agent 重新启动后再运行插件。</p></html>');
    await lock.close(); await fs.unlink(path.join(dir, 'bridge.lock'));
  })();
  return { port, close, manifest: path.join(dir, 'plugin', 'manifest.json') };
}
