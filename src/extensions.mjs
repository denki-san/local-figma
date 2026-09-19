import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { json, root, save } from './project.mjs';
import { waitForResult } from './wait.mjs';
import { textOperation, fillOperation } from './edit-operations.mjs';

export const builtinCommands = new Set(['help', 'init', 'setup', 'serve', 'connect', 'doctor', 'recover', 'resolve',
  'status', 'context', 'text', 'fill', 'font', 'layout', 'align', 'distribute', 'prototype', 'instance', 'props',
  'bind-fill', 'inspect', 'preview', 'design-system', 'run', 'result', 'wait', 'history', 'diff', 'validate', 'guide', 'guide-check', 'extension']);
const validId = id => typeof id === 'string' && /^[a-z][a-z0-9-]{0,39}$/.test(id) && !builtinCommands.has(id);
const configFile = cwd => path.join(root(cwd), 'extensions.json');
const credentialsFile = cwd => path.join(root(cwd), 'extension-credentials.json');

async function config(cwd) {
  let value;
  try { value = await json(configFile(cwd)); }
  catch (error) { if (error.code === 'ENOENT') return { version: 1, extensions: {} }; throw Error('扩展配置无法读取，请检查本机配置'); }
  if (value.version !== 1 || !value.extensions || typeof value.extensions !== 'object' || Array.isArray(value.extensions) ||
      Object.entries(value.extensions).some(([id, item]) => !validId(id) || !item || !path.isAbsolute(item.directory || '') || typeof item.enabled !== 'boolean' || typeof item.allowRemoteContext !== 'boolean')) throw Error('扩展配置格式无效');
  return value;
}

async function manifest(directory) {
  const base = await fs.realpath(directory);
  const value = await json(path.join(base, 'local-figma-extension.json'));
  if (value.apiVersion !== 1 || !validId(value.id) || typeof value.name !== 'string' || !value.name.trim() || value.name.length > 100 ||
      typeof value.entry !== 'string' || !/^[a-zA-Z0-9_-]+\.mjs$/.test(value.entry) ||
      typeof value.apiKeyEnv !== 'string' || !/^[A-Z][A-Z0-9_]{1,79}$/.test(value.apiKeyEnv) ||
      typeof value.disclosure !== 'string' || !value.disclosure.trim() || value.disclosure.length > 1000) throw Error('本地扩展清单无效或版本不兼容');
  const entry = await fs.realpath(path.join(base, value.entry));
  if (path.dirname(entry) !== base) throw Error('扩展入口需要位于安装目录内');
  return { id: value.id, name: value.name, apiVersion: 1, entry, directory: base,
    apiKeyEnv: value.apiKeyEnv, disclosure: value.disclosure };
}

async function credentials(cwd) {
  try {
    const value = await json(credentialsFile(cwd));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error();
    return value;
  } catch (error) { if (error.code === 'ENOENT') return {}; throw Error('扩展密钥配置无法读取'); }
}

async function installed(cwd, id) {
  if (!validId(id)) throw Error('扩展编号无效');
  const settings = (await config(cwd)).extensions[id];
  if (!settings) throw Error('本机尚未安装该扩展；普通编辑功能可继续使用');
  const definition = await manifest(settings.directory);
  if (definition.id !== id) throw Error('扩展身份发生变化，请重新安装并配置');
  return { settings, definition };
}

const resolveKey = (definition, stored, env) => {
  const saved = stored[definition.id]?.apiKey;
  const value = typeof saved === 'string' && saved.trim() ? saved : env[definition.apiKeyEnv];
  return typeof value === 'string' ? value.trim() : '';
};

export async function listExtensions(cwd, { env = process.env } = {}) {
  const value = await config(cwd), stored = await credentials(cwd), extensions = [];
  for (const [id, settings] of Object.entries(value.extensions)) {
    try {
      const { definition } = await installed(cwd, id);
      const configured = !!resolveKey(definition, stored, env);
      extensions.push({ id, name: definition.name, disclosure: definition.disclosure, enabled: settings.enabled,
        allowRemoteContext: settings.allowRemoteContext, configured, ready: settings.enabled && settings.allowRemoteContext && configured });
    } catch { extensions.push({ id, name: id, enabled: false, configured: false, ready: false, error: '扩展文件需要检查，普通编辑功能可继续使用' }); }
  }
  return { extensions };
}

export async function addExtension(cwd, directory) {
  await fs.access(path.join(root(cwd), 'binding.json'));
  const definition = await manifest(path.resolve(directory || ''));
  const value = await config(cwd);
  const previous = value.extensions[definition.id];
  if (previous && previous.directory !== definition.directory) throw Error('已有同名扩展，先移除旧配置后再添加');
  value.extensions[definition.id] = previous || { directory: definition.directory, enabled: false, allowRemoteContext: false };
  await save(configFile(cwd), value);
  return { installed: definition.id, enabled: value.extensions[definition.id].enabled,
    instruction: '在 Figma 插件的设置中配置 API key 并启用；普通流程继续可用' };
}

let settingWrites = Promise.resolve();
export function configureExtension(cwd, input, { env = process.env } = {}) {
  const pending = settingWrites.catch(() => {}).then(async () => {
    const { id, enabled, allowRemoteContext, apiKey, clearApiKey = false } = input || {};
    const { definition } = await installed(cwd, id);
    if (typeof enabled !== 'boolean' || typeof allowRemoteContext !== 'boolean' || typeof clearApiKey !== 'boolean' ||
        (apiKey !== undefined && (typeof apiKey !== 'string' || !apiKey.trim() || apiKey.length > 4096 || /[\r\n\0]/.test(apiKey)))) throw Error('扩展设置无效');
    if (clearApiKey && apiKey !== undefined) throw Error('清除和更新密钥需要分开操作');
    const value = await config(cwd), stored = await credentials(cwd);
    if (clearApiKey) delete stored[id];
    if (apiKey !== undefined) stored[id] = { apiKey: apiKey.trim() };
    if (enabled && (!allowRemoteContext || !resolveKey(definition, stored, env))) throw Error('启用前需要配置 API key，并允许发送当前任务的设计上下文');
    if (apiKey !== undefined || clearApiKey) await save(credentialsFile(cwd), stored);
    value.extensions[id] = { ...value.extensions[id], enabled, allowRemoteContext };
    await save(configFile(cwd), value);
    return listExtensions(cwd, { env });
  });
  settingWrites = pending;
  return pending;
}

export async function extensionCommand(cwd, args) {
  const [operation = 'list', directory, ...extra] = args;
  if (extra.length || !['list', 'add', 'disable', 'remove'].includes(operation) || (operation === 'list' && directory !== undefined)) throw Error('用法：extension list | extension add <可信本地目录> | extension disable <扩展编号> | extension remove <扩展编号>');
  if (operation === 'list') return listExtensions(cwd);
  if (!directory) throw Error('请提供扩展目录或编号');
  if (operation === 'add') return addExtension(cwd, directory);
  if (operation === 'remove') {
    if (!validId(directory)) throw Error('扩展编号无效');
    const value = await config(cwd), stored = await credentials(cwd);
    delete value.extensions[directory];
    await save(configFile(cwd), value);
    delete stored[directory];
    await save(credentialsFile(cwd), stored);
    return { removed: directory, instruction: '本机配置和保存的密钥已移除，扩展目录保留' };
  }
  const { settings } = await installed(cwd, directory);
  return configureExtension(cwd, { id: directory, enabled: false, allowRemoteContext: settings.allowRemoteContext });
}

function redact(value, secret) {
  const escaped = JSON.stringify(secret).slice(1, -1);
  const hide = text => text.split(escaped).join('[已隐藏]').split(secret).join('[已隐藏]');
  if (typeof value === 'string') return hide(value);
  if (Array.isArray(value)) return value.map(item => redact(item, secret));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [hide(key), redact(item, secret)]));
  return value;
}

// 普通命令完全走原执行链；只有显式扩展命令才加载第三方模块和密钥。
export async function runExtension(cwd, id, args, { env = process.env } = {}) {
  const { settings, definition } = await installed(cwd, id);
  if (!settings.enabled || !settings.allowRemoteContext) throw Error('扩展尚未启用，请在 Figma 插件设置中配置；普通编辑功能可继续使用');
  const apiKey = resolveKey(definition, await credentials(cwd), env);
  if (!apiKey) throw Error('扩展缺少 API key，请在 Figma 插件设置中配置');
  try {
    const extension = await import(pathToFileURL(definition.entry).href);
    if (typeof extension.execute !== 'function') throw Error('扩展缺少兼容的执行入口');
    const result = await extension.execute({ cwd, args, settings: { allowRemoteContext: true }, credentials: { apiKey },
      runtime: { json, root, save, waitForResult, textOperation, fillOperation } });
    if (!result || ![0, 1, 2].includes(result.exitCode) || !('output' in result)) throw Error('扩展返回格式无效');
    return redact(JSON.parse(JSON.stringify(result)), apiKey);
  } catch (error) {
    throw Error(redact(String(error.message || '扩展执行失败'), apiKey));
  }
}
