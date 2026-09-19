import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { init, json, parseTarget, root } from './project.mjs';
import { start } from './bridge.mjs';

// 固定安装位置与调用方的项目目录无关，首版只维护一个文件连接。
export const managerDirectory = () => path.join(os.homedir(), 'Library', 'Application Support', 'local-figma');

export async function prepareManager(url, { directory = managerDirectory() } = {}) {
  const target = parseTarget(url);
  await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  const bindingPath = path.join(root(directory), 'binding.json');
  let existing;
  try { existing = await json(bindingPath); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (existing) {
    if (existing.fileKey !== target.fileKey || existing.nodeId !== target.nodeId) {
      throw Error('已连接其他设计区域，原连接已保留；切换目标需要先确认');
    }
  } else {
    await init(directory, url);
  }
  return { directory, manifest: path.join(root(directory), 'plugin', 'manifest.json'), reused: !!existing };
}

export async function startManager({ directory = managerDirectory(), port = 43187 } = {}) {
  try { await json(path.join(root(directory), 'binding.json')); }
  catch (error) {
    if (error.code === 'ENOENT') throw Error('尚未完成首次连接，请先选择要连接的 Figma 文件');
    throw error;
  }
  return start(directory, port, { persistentPlugin: true });
}
