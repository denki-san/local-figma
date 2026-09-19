import { isNodeId } from './node-id.mjs';
const scoped = new Set(['inspect', 'preview', 'design-system', 'run']);
const positional = new Set(['init', 'setup', 'text', 'fill', 'align', 'distribute', 'prototype', 'instance', 'props', 'bind-fill', 'guide', 'guide-check', 'result', 'wait', 'diff', 'validate', 'run']);

export function parseArguments(values) {
  const [command = 'help', ...args] = values;
  let arg, targetNodeId, timeoutSeconds, propertyValue;
  const layoutValues = {};
  const fontValues = {};
  let risk = { level: 'normal' };
  for (let i = 0; i < args.length; i++) {
    const value = args[i];
    if (value === '--value') {
      if(command!=='props'||propertyValue!==undefined||args[i+1]===undefined||args[i+1].startsWith('--'))throw Error('props需要唯一的--value属性值');
      propertyValue=args[++i];
    } else if (['--family', '--style', '--size'].includes(value)) {
      const key = value.slice(2), raw = args[++i];
      if (command !== 'font' || key in fontValues || !raw?.trim() || raw.startsWith('--')) throw Error('字体参数需要唯一的非空值');
      if (key === 'size' && !/^(?:\d+(?:\.\d+)?|\.\d+)$/.test(raw)) throw Error('字号需要有效数值');
      fontValues[key] = key === 'size' ? Number(raw) : raw;
    } else if (['--width', '--height', '--gap', '--padding'].includes(value)) {
      const key = value.slice(2), raw = args[++i];
      if (command !== 'layout' || key in layoutValues || !/^(?:\d+(?:\.\d+)?|\.\d+)$/.test(raw || '')) throw Error('布局参数需要唯一的非负数值');
      layoutValues[key] = Number(raw);
    } else if (value === '--timeout') {
      if (command !== 'wait' || timeoutSeconds !== undefined || !/^\d+$/.test(args[i + 1] || '')) throw Error('--timeout 仅用于 wait，需提供 1–300 秒');
      timeoutSeconds = Number(args[++i]);
      if (timeoutSeconds < 1 || timeoutSeconds > 300) throw Error('--timeout 需要为 1–300 秒');
    } else if (value === '--node') {
      if (!scoped.has(command) || targetNodeId !== undefined) throw Error('--node 仅用于 inspect、preview、design-system 或 run，且只能指定一次');
      targetNodeId = args[++i]?.replace(/-/g, ':');
      if (!isNodeId(targetNodeId)) throw Error('--node 需要有效节点 ID，例如 1:2 或 I1:2;3:4');
    } else if (value === '--high-risk') {
      if (command !== 'run' || risk.level === 'high' || !args[i + 1]?.trim() || args[i + 1].startsWith('--')) throw Error('格式：run <script.js> --high-risk <风险说明>');
      risk = { level: 'high', reason: args[++i] };
    } else if (!value.startsWith('--') && positional.has(command) && arg === undefined) arg = value;
    else throw Error(`不支持的参数：${value}`);
  }
  if (command === 'layout' && !Object.keys(layoutValues).length) throw Error('layout 至少需要一个尺寸或间距参数');
  if (command === 'font' && (!Object.keys(fontValues).length || (fontValues.family === undefined) !== (fontValues.style === undefined))) throw Error('font 需要字号，或同时指定 family 与 style');
  if(command==='props'&&(!arg?.trim()||propertyValue===undefined))throw Error('用法：props <完整属性名> --value <文字或true/false>');
  return { command, arg, risk, targetNodeId, timeoutSeconds, layoutValues, fontValues, propertyValue };
}
