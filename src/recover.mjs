import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { root, save } from './project.mjs';
import { history } from './evidence.mjs';

function requireExited(raw) {
  if (!/^[1-9]\d*$/.test(raw) || !Number.isSafeInteger(Number(raw))) throw Error('锁中的 PID 无效，请人工核对；未清理任何凭证或锁');
  try { process.kill(Number(raw), 0); }
  catch (error) {
    if (error.code === 'ESRCH') return;
    throw Error('无法确认旧进程已退出；请先检查权限与进程状态');
  }
  throw Error('锁对应进程仍存在；请先停止自己启动的桥接。PID 可能被其他进程复用，工具不会终止进程');
}

export async function recover(cwd) {
  const dir = root(cwd), lockPath = path.join(dir, 'bridge.lock');
  const recoveryLockPath = path.join(dir, 'recovery.lock');
  const recoveryLock = await fs.open(recoveryLockPath, 'wx', 0o600);
  try {
    const raw = await fs.readFile(lockPath, 'utf8');
    requireExited(raw);
    const records = await history(cwd);
    if (records.runs.some(run => run.error)) throw Error('存在无法读取的历史任务，先检查 history 并修复证据；保留当前锁与凭证');
    const unfinished = records.runs.filter(run => !['done', 'failed'].includes(run.recordedState) && !run.resolution);
    const recoveryId = crypto.randomUUID();
    const archive = path.join(dir, 'recoveries', recoveryId);
    const recoveredAt = new Date().toISOString();
    await fs.mkdir(archive, { recursive: true, mode: 0o700 });
    for (const run of unfinished) {
      await save(path.join(dir, 'runs', run.id, 'recovery.json'), {
        status: 'needs-document-review', recoveredAt, recoveryId, recordedState: run.recordedState,
        hasResult: run.hasResult, instruction: '旧进程已退出；重新连接后先 inspect 并核对快照，未重放脚本或撤销文档'
      });
    }
    await save(path.join(archive, 'report.json'), {
      recoveryId, recoveredAt, previousPid: Number(raw), unfinishedRunIds: unfinished.map(run => run.id),
      plannedActions: ['清除旧会话凭证', '替换带凭证插件 UI', '归档残留锁'], documentModified: false
    });
    // 保留 bridge.lock 到最后，避免新 bridge 在清理旧凭证期间启动。
    if (await fs.readFile(lockPath, 'utf8') !== raw) throw Error('恢复期间锁发生变化，已停止；请检查进程与证据');
    requireExited(raw);
    await fs.rm(path.join(dir, 'session.json'), { force: true });
    try { await fs.writeFile(path.join(dir, 'plugin/ui.html'), '旧桥接已恢复清理。重新 connect 后再运行插件。', { mode: 0o600 }); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    await fs.rename(lockPath, path.join(archive, 'bridge.lock'));
    return { recovered: true, archive, unfinishedRunIds: unfinished.map(run => run.id),
      removed: ['旧 session.json 凭证（如存在）', '旧插件 UI 中的凭证（如存在）'],
      next: 'figma-local connect；重新运行插件后先 inspect，再决定下一步；旧任务未重放' };
  } finally {
    await recoveryLock.close();
    await fs.unlink(recoveryLockPath);
  }
}
