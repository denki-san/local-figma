import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { json, save } from './project.mjs';

// 固定安装保留配对凭证；进程的 CLI 凭证继续逐次更新。禁止打印配对文件。
export async function pairingToken(dir) {
  const file = path.join(dir, 'pairing.json');
  try {
    const value = await json(file);
    if (!/^[a-f0-9]{64}$/.test(value.token || '')) throw Error('连接配对资料无效，需要重新配对');
    await fs.chmod(file, 0o600);
    return value.token;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    const token = crypto.randomBytes(32).toString('hex');
    await save(file, { token });
    return token;
  }
}

export async function unfinishedOperations(dir, bindingId) {
  let entries;
  try { entries = await fs.readdir(path.join(dir, 'runs'), { withFileTypes: true }); }
  catch (error) { if (error.code === 'ENOENT') return []; throw error; }
  const pending = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || !/^[a-f0-9-]{36}$/.test(entry.name)) continue;
    const run = path.join(dir, 'runs', entry.name);
    const job = await json(path.join(run, 'job.json'));
    if (job.id !== entry.name) throw Error('最近操作记录损坏，需要检查');
    if (!['queued', 'running'].includes(job.state)) continue;
    let result;
    try { result = await json(path.join(run, 'result.json')); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (result) {
      if (result.id !== job.id || typeof result.ok !== 'boolean') throw Error('操作结果损坏，需要检查');
      await save(path.join(run, 'job.json'), { ...job, result, state: result.ok ? 'done' : 'failed' });
      continue;
    }
    let resolution;
    try { resolution = await json(path.join(run, 'resolution.json')); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (resolution) {
      if (resolution.id !== job.id || resolution.bindingId !== job.bindingId || resolution.status !== 'reviewed-without-replay' || resolution.previousPluginStopped !== true || !/^[a-f0-9-]{36}$/.test(resolution.inspectId || '')) throw Error('操作核验记录损坏，需要检查');
      continue;
    }
    if (job.bindingId !== bindingId) throw Error('存在其他目标的未确认操作，需要先检查');
    // 队列记录无法证明插件是否已领取，恢复时一律禁止自动交付。
    pending.push({ ...job, state: 'running', recovered: true });
  }
  return pending;
}
