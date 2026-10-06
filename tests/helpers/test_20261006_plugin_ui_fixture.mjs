import vm from 'node:vm';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import { createPluginI18n } from '../../src/20261006-plugin-i18n.mjs';
const html = await fs.readFile(new URL('../../plugin/ui.html', import.meta.url), 'utf8');
export function fixture(locale = 'zh-CN') {
  const calls = [], deliveries = [], responses = [];
  const state = { textContent: '', dataset: {}, attributes: {}, setAttribute(name, value) { this.attributes[name] = value; } };
  const elements = new Map([['state', state]]);
  const document = { visibilityState: 'visible', documentElement: { lang: '' } };
  let visibilityChange;
  const element = id => {
    if (!elements.has(id)) {
      const value = { value: '', dataset: {}, attributes: {}, setAttribute(name, value) { this.attributes[name] = value; }, appendChild(option) { if (!this.value) this.value = option.value; } };
      if (id === 'extension-choice') Object.defineProperty(value, 'textContent', { set() { this.value = ''; } });
      elements.set(id, value);
    }
    return elements.get(id);
  };
  const staticNodes = [];
  for (const match of html.matchAll(/<([a-z]+)\b([^>]*\bdata-i18n(?:-aria|-placeholder)?="[^"]+"[^>]*)>/g)) {
    const attrs = match[2], id = attrs.match(/\bid="([^"]+)"/)?.[1];
    const node = id ? element(id) : { dataset: {}, attributes: {}, setAttribute(name, value) { this.attributes[name] = value; } };
    for (const attr of attrs.matchAll(/data-i18n(-aria|-placeholder)?="([^"]+)"/g)) node.dataset[attr[1] === '-aria' ? 'i18nAria' : attr[1] === '-placeholder' ? 'i18nPlaceholder' : 'i18n'] = attr[2];
    staticNodes.push(node);
  }
  document.querySelectorAll = selector => staticNodes.filter(node => node.dataset[selector === '[data-i18n-aria]' ? 'i18nAria' : selector === '[data-i18n-placeholder]' ? 'i18nPlaceholder' : 'i18n']);
  let tick;
  const contexts = [];
  const parent = { postMessage: message => (message.pluginMessage.type === 'context-request' ? contexts : deliveries).push(message) };
  const window = {};
  vm.runInNewContext(html.match(/<script>([\s\S]*)<\/script>/)[1].replace('SESSION_I18N', createPluginI18n.toString()).replace('SESSION_CONFIG', JSON.stringify({ port: 1234, token: 'test' })), {
    parent, window, navigator: { language: locale, languages: [locale] }, crypto: { getRandomValues: values => crypto.getRandomValues(values) }, document: Object.assign(document, { getElementById: element, createElement: () => ({}), addEventListener: (name, callback) => { if (name === 'visibilitychange') visibilityChange = callback; } }),
    AbortSignal, TextEncoder, setInterval: callback => { tick = callback; },
    fetch: async (url, options) => {
      calls.push({ url, options });
      const response = await responses.shift();
      if (response instanceof Error) throw response;
      return { ok: response?.ok ?? true, status: response?.status ?? 200, headers: { get: name => name === 'X-Figma-Workflow' ? response?.progress ?? null : response?.session ?? null }, json: async () => response?.body ?? null };
    }
  });
  return { document, staticNodes, calls, deliveries, contexts, responses, tick: () => tick(), state, element,
    visibilityChange: async visibility => { document.visibilityState = visibility; await visibilityChange?.(); },
    complete: (message, source = parent) => window.onmessage({ source, data: { pluginMessage: {
      channelNonce: deliveries[0]?.pluginMessage.channelNonce, ...message
  } } }) };
}
