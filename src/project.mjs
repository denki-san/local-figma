import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { scenario } from './scenarios.mjs';

export const hash = value => crypto.createHash('sha256').update(value).digest('hex');
export const root = cwd => path.join(cwd, '.figma-agent');
export async function json(file) { return JSON.parse(await fs.readFile(file, 'utf8')); }
export async function save(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  const tmp = `${file}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(value, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
  try { await fs.rename(tmp, file); }
  catch (error) { await fs.rm(tmp, { force: true }); throw error; }
}
export function parseTarget(raw) {
  const url = new URL(raw);
  if (url.protocol !== 'https:' || !['figma.com', 'www.figma.com'].includes(url.hostname) || url.username || url.password || url.port) throw Error('需要有效的 HTTPS Figma 链接');
  const match = url.pathname.match(/^\/(?:design|file)\/([A-Za-z0-9_-]+)(?:\/|$)/);
  const nodeId = url.searchParams.get('node-id')?.replace(/-/g, ':');
  if (!match || !/^\d+:\d+$/.test(nodeId || '')) throw Error('请提供包含 node-id 的画板或页面链接');
  return { id: crypto.randomUUID(), sourceUrl: url.href, fileKey: match[1], nodeId, boundAt: new Date().toISOString() };
}
export async function init(cwd, url) {
  const binding = parseTarget(url);
  const dir = root(cwd);
  try { await fs.mkdir(dir, { mode: 0o700 }); }
  catch (error) {
    if (error.code === 'EEXIST') throw Object.assign(Error('当前目录已有 Figma 项目，已保留原绑定。继续使用请运行 figma-local doctor；连接其他文件请使用新的项目目录。'), { code: 'EEXIST' });
    throw error;
  }
  await save(path.join(dir, 'binding.json'), binding);
  const ignore = path.join(cwd, '.gitignore');
  let current = '';
  try { current = await fs.readFile(ignore, 'utf8'); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  if (!current.split(/\r?\n/).includes('.figma-agent/')) await fs.appendFile(ignore, `${current && !current.endsWith('\n') ? '\n' : ''}.figma-agent/\n`);
  return { binding, next: 'figma-local connect' };
}
export async function brief(cwd, mode) {
  const definition = scenario(mode);
  const value = {
    mode, objective: '', audience: '', primaryTask: '', targetSize: '',
    sourceContent: '', protectedRegions: [], designSystem: [],
    references: [], acceptedDirection: null,
    editScope: '', preservationNotes: '', existingStyleSource: '',
    visualDirection: '', designFoundations: '', stateCoverage: '',
    steps: mode === 'refine'
      ? ['inspect 目标与现有组件', 'preview 基线', '声明一个局部修改', '运行可信脚本', '检查 before/after、字体、遮挡和交互']
      : ['填写用户、主要任务与真实内容', '提供 2–3 张参考图并说明借鉴的布局、排版或组件', '先做结构草图，选定方向', '复用设计系统并建立排版、颜色、间距', '分区域生成原生图层', '检查长内容、空状态、错误状态与真实点击'],
    review: { typography: false, overlap: false, hierarchy: false, content: false, interaction: false }
  };
  Object.assign(value, Object.fromEntries(Object.keys(definition.fields).map(key => [key, ''])));
  value.steps = definition.steps;
  const file = path.join(root(cwd), `brief-${mode}.json`);
  try { await fs.writeFile(file, JSON.stringify(value, null, 2) + '\n', { flag: 'wx', mode: 0o600 }); }
  catch (error) {
    if (error.code === 'EEXIST') throw Object.assign(Error(`已有需求资料，已保留：${file}。请让 Agent 读取并补充，然后运行 figma-local guide-check ${mode}。`), { code: 'EEXIST' });
    if (error.code === 'ENOENT') throw Object.assign(Error('当前目录尚未初始化，请先运行 figma-local init <包含 node-id 的 Figma 链接>，再生成需求资料。'), { code: 'ENOENT' });
    throw error;
  }
  return { file, brief: value, nextAction: '请让 Agent 根据需求对话整理此文件，只询问影响范围或设计方向的缺口；用户无需手填 JSON。随后运行 figma-local guide-check ' + mode };
}
