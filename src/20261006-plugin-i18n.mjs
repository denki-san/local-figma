// 插件及桥接生成页面共用此文案表；用户设计内容不进入翻译函数。
export function createPluginI18n(language) {
  const messages = {
  "settings": [
    "设置",
    "Settings"
  ],
  "hide": [
    "隐藏",
    "Hide"
  ],
  "target": [
    "当前目标",
    "Current target"
  ],
  "checking": [
    "正在确认…",
    "Checking…"
  ],
  "processing": [
    "正在处理",
    "Processing"
  ],
  "connecting": [
    "正在连接本机服务。",
    "Connecting to the local service."
  ],
  "scopeScript": [
    "查看影响范围与脚本",
    "View scope and script"
  ],
  "approve": [
    "允许本次修改",
    "Allow this change"
  ],
  "reject": [
    "取消本次修改",
    "Cancel this change"
  ],
  "extensionSettings": [
    "可选扩展设置",
    "Optional extension settings"
  ],
  "extensions": [
    "可选扩展",
    "Optional extensions"
  ],
  "back": [
    "返回",
    "Back"
  ],
  "ordinary": [
    "普通编辑功能可直接使用。扩展按需配置。",
    "Editing is ready to use. Configure extensions as needed."
  ],
  "extension": [
    "扩展",
    "Extension"
  ],
  "localKey": [
    "仅保存到本机",
    "Stored only on this computer"
  ],
  "enable": [
    "启用扩展并允许上述上下文处理",
    "Enable extension and allow the context processing described above"
  ],
  "save": [
    "保存",
    "Save"
  ],
  "clearKey": [
    "清除已保存密钥",
    "Clear saved key"
  ],
  "timeout": [
    "连接超时，正在自动恢复。",
    "Connection timed out. Reconnecting automatically."
  ],
  "interrupted": [
    "连接暂时中断，正在自动恢复。",
    "Connection interrupted. Reconnecting automatically."
  ],
  "confirm": [
    "请确认修改",
    "Confirm this change"
  ],
  "confirmDetail": [
    "请在下方选择允许或取消。",
    "Choose Allow or Cancel below."
  ],
  "checkTask": [
    "任务需检查",
    "Task needs review"
  ],
  "checkResult": [
    "回到 Agent 对话查看结果。",
    "Return to the Agent chat to review the result."
  ],
  "saving": [
    "正在保存结果，请保持插件运行。",
    "Saving the result. Keep the plugin running."
  ],
  "agentWorking": [
    "Agent 正在处理当前目标。",
    "The Agent is working on the current target."
  ],
  "adjustTarget": [
    "目标需调整",
    "Target needs attention"
  ],
  "preparing": [
    "正在准备上下文",
    "Preparing context"
  ],
  "readingDesign": [
    "已连接本机服务，正在读取当前设计。",
    "Connected to the local service. Reading the current design."
  ],
  "connected": [
    "已连接",
    "Connected"
  ],
  "readyDetail": [
    "回到 Agent 对话，直接描述需求。",
    "Return to the Agent chat and describe what you need."
  ],
  "resultLarge": [
    "结果超过回传大小限制，已省略大字段；执行状态请结合修改前快照和独立读回核验",
    "Result exceeded the size limit. Large fields were omitted. Verify execution using the before snapshot and an independent readback."
  ],
  "recovery": [
    "保留已有证据，缩小目标后独立 inspect；禁止重放脚本",
    "Keep the evidence and inspect a smaller target independently. Do not replay the script."
  ],
  "ready": [
    "已就绪",
    "Ready"
  ],
  "running": [
    "执行中",
    "Running"
  ],
  "waiting": [
    "等待结果",
    "Waiting for result"
  ],
  "failed": [
    "检查未通过",
    "Check failed"
  ],
  "needsReview": [
    "需要恢复核验",
    "Recovery review required"
  ],
  "awaitingReview": [
    "等待人工验收",
    "Awaiting review"
  ],
  "done": [
    "已完成",
    "Done"
  ],
  "static": [
    "静态设计",
    "Static design"
  ],
  "prototype": [
    "交互原型",
    "Interactive prototype"
  ],
  "configuredKey": [
    "已配置，留空保留；调用时验证",
    "Configured. Leave blank to keep; verified when used."
  ],
  "keysNote": [
    "密钥仅保存在本机，普通编辑流程保持可用。",
    "Keys stay on this computer. Standard editing remains available."
  ],
  "noExtensions": [
    "当前使用普通版。需要可选能力时，让 Agent 安装可信的本地扩展。",
    "Standard editing is active. Ask the Agent to install a trusted local extension when needed."
  ],
  "loadingSettings": [
    "正在读取设置…",
    "Loading settings…"
  ],
  "settingsUnavailable": [
    "设置暂不可用",
    "Settings unavailable"
  ],
  "settingsConnection": [
    "设置暂不可用，请检查本机连接。",
    "Settings unavailable. Check the local connection."
  ],
  "saveFailed": [
    "设置保存失败",
    "Could not save settings"
  ],
  "savedEnabled": [
    "设置已保存。可以让 Agent 使用扩展。",
    "Settings saved. The Agent can now use the extension."
  ],
  "savedStandard": [
    "设置已保存，继续使用普通流程。",
    "Settings saved. Standard editing remains active."
  ],
  "confirmNotSaved": [
    "确认尚未保存，请检查终端并重试同一决定",
    "Decision was not saved. Check the terminal and retry the same decision."
  ],
  "confirmRetry": [
    "确认未保存，请再试一次。",
    "Decision was not saved. Please try again."
  ],
  "parseFailure": [
    "结果无法解析，请检查当前画布，禁止重放",
    "Could not parse the result. Check the current canvas. Do not replay."
  ],
  "selected": [
    "已选：{name}",
    "Selected: {name}"
  ],
  "selectedCount": [
    "已选 {count} 项",
    "Selected {count} items"
  ],
  "unavailableTarget": [
    "目标暂不可用",
    "Target unavailable"
  ],
  "heartbeatFailed": [
    "心跳失败，请检查桥接；保留当前任务，禁止重放",
    "Heartbeat failed. Check the bridge and keep the current task. Do not replay."
  ],
  "checkConnection": [
    "连接需检查",
    "Connection needs attention"
  ],
  "reconnecting": [
    "正在恢复连接",
    "Reconnecting"
  ],
  "keepRunning": [
    "请保持插件运行，回到 Agent 对话检查。",
    "Keep the plugin running and check the Agent chat."
  ],
  "rejectedLarge": [
    "结果体积被拒绝；保留任务，下轮保存精简失败证据，禁止重放",
    "Result was too large. Keep the task; compact evidence will be saved on retry. Do not replay."
  ],
  "unsavedResult": [
    "结果未被保存，请保持插件运行并让 Agent 检查",
    "Result was not saved. Keep the plugin running and ask the Agent to check."
  ],
  "incomplete": [
    "本次任务未完成",
    "Task did not complete"
  ],
  "notRecovered": [
    "连接尚未恢复，请让 Agent 检查本机服务；保留当前任务",
    "Connection has not recovered. Ask the Agent to check the local service and keep the current task."
  ],
  "openFile": [
    "请打开已发送链接的文件",
    "Open the linked file"
  ],
  "wrongFile": [
    "当前文件与目标不一致，请回到目标文件运行插件。",
    "This file does not match the target. Run the plugin in the target file."
  ],
  "missingTarget": [
    "目标已不可用，请把新的目标链接发给 Agent。",
    "The target is unavailable. Send a new target link to the Agent."
  ],
  "wrongPage": [
    "请切回目标所在页面后继续。",
    "Switch to the target page to continue."
  ],
  "outside": [
    "当前选区超出目标范围。请选择范围内内容，或把新链接发给 Agent。",
    "The selection is outside the target. Select content within it or send a new link to the Agent."
  ],
  "unreadable": [
    "暂时无法读取目标，请让 Agent 检查连接。",
    "Could not read the target. Ask the Agent to check the connection."
  ],
  "notStarted": [
    "连接未启动",
    "Connection not started"
  ],
  "startDetail": [
    "回到 Agent 对话排查，修复后重新运行插件。",
    "Return to the Agent chat to troubleshoot, then run the plugin again."
  ],
  "disconnected": [
    "连接已断开",
    "Disconnected"
  ],
  "restartDetail": [
    "回到 Agent 对话让它重连，再在 Figma 运行插件。",
    "Ask the Agent to reconnect, then run the plugin in Figma."
  ],
  "approvalDetails": [
    "原因：{reason}\n文件：{file}\n节点：{node}\n脚本 hash：{hash}\n\n{code}",
    "Reason: {reason}\nFile: {file}\nNode: {node}\nScript hash: {hash}\n\n{code}"
  ],
  "assertion": [
    "{property}：预期 {expected}，实际 {actual}",
    "{property}: expected {expected}, actual {actual}"
  ],
  "passed": [
    "{title}：已通过",
    "{title}: passed"
  ],
  "extensionCheck": [
    "扩展文件需要检查，普通编辑功能可继续使用",
    "Extension files need review. Standard editing remains available."
  ],
  "extensionInvalid": [
    "扩展设置无效",
    "Invalid extension settings"
  ],
  "extensionEnable": [
    "启用前需要配置 API key，并允许发送当前任务的设计上下文",
    "Configure an API key and allow sharing the task design context before enabling."
  ],
  "connectionChanged": [
    "连接已变化，请重新打开设置",
    "Connection changed. Reopen settings."
  ],
  "extensionGeneric": [
    "扩展操作失败，请回到 Agent 对话检查本机配置。",
    "Extension request failed. Ask the Agent to check the local configuration."
  ]
};
  const locale = /^zh(?:-|_|$)/i.test(String(language || '')) ? 'zh-CN' : 'en';
  const t = (key, values = {}) => {
    const pair = messages[key];
    if (!pair) throw Error('Unknown plugin message: ' + key);
    return pair[locale === 'zh-CN' ? 0 : 1].replace(/\{(\w+)\}/g, (_, name) => String(values[name] ?? ''));
  };
  const localize = text => {
    const key = Object.keys(messages).find(key => messages[key][0] === text);
    return key ? t(key) : String(text || '');
  };
  // 未知的本机错误不直接混入英文 UI，原始诊断仍保存在 Agent 的任务证据中。
  const error = text => {
    const value = localize(text);
    return locale === 'en' && /[\u3400-\u9fff]/.test(value) ? t('extensionGeneric') : value;
  };
  return { locale, t, localize, error };
}
