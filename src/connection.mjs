// 单插件连接租约。只允许在旧连接过期且无在途任务时接续，禁止转交未知写入。
export function createConnection({ now = Date.now, timeoutMs = 15000 } = {}) {
  let owner = null, seenAt = null;
  const retired = new Set();
  const fresh = () => seenAt !== null && now() - seenAt < timeoutMs;
  return {
    get connected() { return fresh(); },
    get ageMs() { return seenAt === null ? null : Math.max(0, now() - seenAt); },
    owns(client) { return owner === client && fresh(); },
    touch(client, hasPendingOperation) {
      if (typeof client !== 'string' || !client || client.length > 160) return { ok: false, code: 'INVALID_CLIENT' };
      if (retired.has(client)) return { ok: false, code: 'RETIRED_CLIENT' };
      if (owner !== null && owner !== client) {
        if (hasPendingOperation) return { ok: false, code: 'OPERATION_UNCERTAIN' };
        if (fresh()) return { ok: false, code: 'CONNECTION_IN_USE' };
        retired.add(owner);
      }
      owner = client;
      seenAt = now();
      return { ok: true };
    }
  };
}
