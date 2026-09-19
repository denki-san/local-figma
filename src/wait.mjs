import { setTimeout as delay } from 'node:timers/promises';
import { performance } from 'node:perf_hooks';
import { localResult } from './evidence.mjs';

// 只观察已有证据；等待结束不代表脚本停止，也不触发任何重投。
export async function waitForResult(cwd, id, timeoutSeconds = 30) {
  if (!Number.isInteger(timeoutSeconds) || timeoutSeconds < 1 || timeoutSeconds > 300) throw Error('等待时间需要为 1–300 秒的整数');
  const started = performance.now();
  while (true) {
    const record = await localResult(cwd, id);
    if (record.journalComplete) return { ...record, waitStatus: 'completed' };
    if (record.recovery) return { ...record, waitStatus: 'needs-review', instruction: '任务含恢复提示；先核对文档与桥接，禁止重放脚本' };
    const remaining = timeoutSeconds * 1000 - (performance.now() - started);
    if (remaining <= 0) return { ...record, waitStatus: 'timeout', instruction: '等待已到期，任务执行状态仍需核查；保留插件，读取 status，禁止重放脚本' };
    await delay(Math.min(250, remaining));
  }
}
