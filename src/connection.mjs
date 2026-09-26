// 单插件连接租约。只允许在旧连接过期且无在途任务时接续，禁止转交未知写入。
export function createConnection({ now = Date.now, timeoutMs = 15000, backgroundTimeoutMs = 90000 } = {}) {
  let owner = null, seenAt = null, visibility = 'visible';
  const retired = new Set();
  const fresh = () => seenAt !== null && now() - seenAt < (visibility === 'hidden' ? backgroundTimeoutMs : timeoutMs);
  return {
    get connected() { return fresh(); },
    get state() { return !fresh() ? 'STALE' : visibility === 'hidden' ? 'BACKGROUND' : 'ACTIVE'; },
    get ageMs() { return seenAt === null ? null : Math.max(0, now() - seenAt); },
    owns(client) { return owner === client && fresh(); },
    touch(client, hasPendingOperation, nextVisibility = 'visible') {
      if (typeof client !== 'string' || !client || client.length > 160) return { ok: false, code: 'INVALID_CLIENT' };
      if (nextVisibility !== 'visible' && nextVisibility !== 'hidden') return { ok: false, code: 'INVALID_VISIBILITY' };
      if (retired.has(client)) return { ok: false, code: 'RETIRED_CLIENT' };
      if (owner !== null && owner !== client) {
        if (hasPendingOperation) return { ok: false, code: 'OPERATION_UNCERTAIN' };
        if (fresh()) return { ok: false, code: 'CONNECTION_IN_USE' };
        retired.add(owner);
      }
      owner = client;
      seenAt = now();
      visibility = nextVisibility;
      return { ok: true };
    }
  };
}
