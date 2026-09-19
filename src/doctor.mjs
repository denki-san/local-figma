import fs from 'node:fs/promises';
import path from 'node:path';
import { root, json, parseTarget } from './project.mjs';

export async function doctor(cwd) {
  const checks = [];
  const add = (code, status, message, action) => checks.push({ code, status, message, ...(action ? { action } : {}) });
  const dir = root(cwd);
  const report = () => ({
    ready: checks.every(c => c.status !== 'error'), checks,
    scope: 'local-transport',
    instruction: '连接可用后先执行 inspect 核验目标；编辑权限、视觉与交互需要在真实 Figma 中另行验证'
  });
  add('NODE_VERSION', Number(process.versions.node.split('.')[0]) >= 22 ? 'ok' : 'error', `Node.js ${process.versions.node}`, '需要 Node.js 22+');
  let binding;
  try {
    binding = await json(path.join(dir, 'binding.json'));
    const parsed = parseTarget(binding.sourceUrl);
    if (!binding.id || parsed.fileKey !== binding.fileKey || parsed.nodeId !== binding.nodeId) throw Error();
    add('BINDING', 'ok', '绑定文件与源链接一致');
  } catch (error) {
    add('BINDING', 'error', error.code === 'ENOENT' ? '当前目录尚未初始化' : '绑定文件损坏或与源链接不一致',
      error.code === 'ENOENT' ? '在目标项目目录运行 figma-local init <figma-url>' : '保留现有证据，检查绑定文件；可在新目录重新 init');
    return report();
  }
  let session;
  try {
    session = await json(path.join(dir, 'session.json'));
    if (!Number.isInteger(session.port) || session.port < 1 || session.port > 65535 || !/^[a-f0-9]{64}$/.test(session.token) || typeof session.sessionId !== 'string') throw Error();
    add('SESSION', 'ok', '本地会话配置可读取');
  } catch (error) {
    add('SESSION', 'error', error.code === 'ENOENT' ? '尚无桥接会话' : '会话文件格式无效', '运行 figma-local connect；如已有桥接终端，先检查其错误信息');
  }
  try {
    const lock = await fs.readFile(path.join(dir, 'bridge.lock'), 'utf8');
    const pid = Number(lock);
    if (!Number.isSafeInteger(pid) || pid <= 0) throw Error();
    try {
      process.kill(pid, 0);
      add('LOCK', 'info', '锁记录对应 PID 存在；进程身份与桥接健康状态需结合实时连接判断');
    } catch (error) {
      add('LOCK', 'warning', error.code === 'ESRCH' ? '锁记录对应进程已不存在' : '无法确认锁记录对应进程',
        '确认旧桥接已退出后运行 figma-local recover；该命令保留任务证据并清理旧凭证，doctor 不自动清理');
    }
  } catch (error) {
    if (error.code !== 'ENOENT') add('LOCK', 'warning', '锁文件无法解析', '先检查旧桥接进程，保留证据后处理锁文件');
  }
  try {
    const pluginDir = path.join(dir, 'plugin');
    const manifest = await json(path.join(pluginDir, 'manifest.json'));
    if (manifest.main !== 'main.js' || manifest.ui !== 'ui.html' || manifest.enablePrivatePluginApi !== true || manifest.documentAccess !== 'dynamic-page') throw Error();
    if (session && !manifest.networkAccess?.devAllowedDomains?.includes(`http://localhost:${session.port}`)) throw Error();
    await fs.access(path.join(pluginDir, 'main.js'));
    await fs.access(path.join(pluginDir, 'ui.html'));
    add('PLUGIN_FILES', 'ok', '插件文件齐全且 manifest 配置匹配');
    if (!manifest.id) add('PLUGIN_ID', 'warning', '开发 manifest 未配置 Figma 分配的插件 ID，私有 pluginData API 不可用', '当前使用本地证据保存节点映射；需要私有元数据时先配置正式插件身份，避免在写入后才调用 setPluginData');
  } catch {
    add('PLUGIN_FILES', 'error', '插件文件缺失或 manifest 配置不匹配', '重新 connect 生成插件；在 Figma 按返回的 manifest 路径导入并运行');
  }
  if (!session || !checks.some(c => c.code === 'SESSION' && c.status === 'ok')) return report();
  try {
    const response = await fetch(`http://127.0.0.1:${session.port}/status`, {
      headers: { 'X-Session-Token': session.token }, signal: AbortSignal.timeout(3000), redirect: 'error'
    });
    if (response.status === 403) {
      add('BRIDGE_AUTH', 'error', '桥接拒绝当前会话凭证', '检查是否存在旧桥接；重启自己启动的桥接后重新运行插件');
      return report();
    }
    if (!response.ok) throw Error();
    const status = await response.json();
    if (status.sessionId !== session.sessionId || status.binding?.id !== binding.id || status.binding?.fileKey !== binding.fileKey || status.binding?.nodeId !== binding.nodeId) {
      add('BRIDGE_IDENTITY', 'error', '在线桥接与本地会话或目标绑定不匹配', '检查当前工作目录与桥接终端，保留任务结果后再重新连接');
      return report();
    }
    add('BRIDGE', 'ok', '实时桥接认证与目标配置匹配');
    const fresh = status.connected === true && Number.isFinite(status.pollAgeMs) && status.pollAgeMs >= 0 && status.pollAgeMs < 5000;
    add('PLUGIN_CONNECTION', fresh ? 'ok' : 'error', fresh ? '插件具有新鲜轮询' : '插件没有新鲜轮询',
      status.active ? '有未完成任务，先读取 result 并检查 Figma；返回编辑标签页，保留运行中的插件，禁止盲目重放' : '先返回 Figma 编辑标签页检查心跳；原型预览或后台节流可能暂停轮询。仍未连接时核对当前 manifest；仅在桥接确实重启后重开插件');
    if (status.active) add('ACTIVE_JOB', 'error', '存在未完成任务，暂不可提交新任务', '用 status 获取任务 ID，再用 result 查看证据；超时后先读回文档');
    if (status.unresolved?.length) add('UNRESOLVED_JOB', 'error', '旧操作需要核验；当前可执行只读检查', '确认旧插件已停止，独立 inspect 后用 resolve 结束等待；原任务保持不重放');
  } catch {
    add('BRIDGE_UNREACHABLE', 'error', '无法取得有效的实时桥接响应', '检查桥接终端是否仍在运行及本机网络权限；会话文件无法证明服务存活');
  }
  return report();
}
