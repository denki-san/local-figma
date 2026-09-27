import { setTimeout as delay } from 'node:timers/promises';
import { performance } from 'node:perf_hooks';
import path from 'node:path';
import { localResult } from './evidence.mjs';
import { json, root } from './project.mjs';

const DEFAULT_TIMEOUT_SECONDS = 30;
const BACKGROUND_TIMEOUT_SECONDS = 150; // 后台约 60 秒一次轮询；领取与保存结果可能各需一轮。

export async function isBackgroundConnection(cwd, id) {
  try {
    const session = await json(path.join(root(cwd), 'session.json'));
    if (!Number.isInteger(session.port) || session.port < 1 || session.port > 65535 ||
        typeof session.token !== 'string' || typeof session.sessionId !== 'string') return false;
    const response = await fetch(`http://127.0.0.1:${session.port}/status`, {
      headers: { 'X-Session-Token': session.token }, signal: AbortSignal.timeout(1000), redirect: 'error'
    });
    if (!response.ok) return false;
    const status = await response.json();
    return status.sessionId === session.sessionId && status.connected === true &&
      status.connectionState === 'BACKGROUND' && status.active === id;
  } catch { return false; }
}

// 只观察任务证据和只读连接状态；等待结束不代表脚本停止，也不触发任何重投。
export async function waitForResult(cwd, id, timeoutSeconds) {
  const useDefaultTimeout = timeoutSeconds === undefined;
  timeoutSeconds ??= DEFAULT_TIMEOUT_SECONDS;
  if (!Number.isInteger(timeoutSeconds) || timeoutSeconds < 1 || timeoutSeconds > 300) throw Error('等待时间需要为 1–300 秒的整数');
  let effectiveTimeoutSeconds = timeoutSeconds;
  const started = performance.now();
  while (true) {
    const record = await localResult(cwd, id);
    if (record.journalComplete) return { ...record, waitStatus: 'completed' };
    if (record.resolution) return { ...record, waitStatus: 'needs-review' };
    if (record.recovery) return { ...record, waitStatus: 'needs-review', instruction: '任务含恢复提示；先核对文档与桥接，禁止重放脚本' };
    let remaining = effectiveTimeoutSeconds * 1000 - (performance.now() - started);
    if (remaining <= 0 && useDefaultTimeout && effectiveTimeoutSeconds === DEFAULT_TIMEOUT_SECONDS && await isBackgroundConnection(cwd, id)) {
      effectiveTimeoutSeconds = BACKGROUND_TIMEOUT_SECONDS;
      remaining = effectiveTimeoutSeconds * 1000 - (performance.now() - started);
    }
    if (remaining <= 0) return { ...record, waitStatus: 'timeout', instruction: '等待已到期，任务执行状态仍需核查；保留插件，读取 status，禁止重放脚本' };
    await delay(Math.min(250, remaining));
  }
}
