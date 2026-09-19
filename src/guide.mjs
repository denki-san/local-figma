import fs from 'node:fs/promises';
import path from 'node:path';
import { root, json } from './project.mjs';
import { scenario } from './scenarios.mjs';

const filled = value => typeof value === 'string' && value.trim().length > 0;
export async function checkGuide(cwd, mode) {
  const definition = scenario(mode);
  const file = path.join(root(cwd), `brief-${mode}.json`);
  const brief = await json(file);
  if (!brief || brief.mode !== mode) throw Error('brief 场景与命令不匹配');
  const gaps = [];
  const requireText = (field, message, phase = 'planning') => {
    if (!filled(brief[field])) gaps.push({ field, phase, message });
  };
  requireText('objective', '说明要解决的具体问题与完成标准');
  requireText('sourceContent', '填写真实内容或内容真源位置，并说明摘要与派生内容的关系');
  requireText('editScope', '明确本次可修改区域及允许的变化');
  requireText('preservationNotes', '说明必须保留的内容；没有额外限制时也请明确填写');
  for (const [field, message] of Object.entries(definition.fields)) requireText(field, message);
  if (mode === 'design') {
    requireText('audience', '描述主要使用者');
    requireText('primaryTask', '描述用户打开页面首先要完成的任务');
    requireText('targetSize', '填写目标设备与画板尺寸');
    requireText('stateCoverage', '说明长内容、空状态、错误状态及主要交互如何覆盖');
  }
  for (const field of ['protectedRegions', 'designSystem', 'references']) {
    if (!Array.isArray(brief[field])) gaps.push({ field, phase: 'planning', message: `${field} 应为数组，暂无内容时填写 []` });
  }
  for (const field of ['protectedRegions', 'designSystem']) {
    if (!Array.isArray(brief[field])) continue;
    brief[field].forEach((entry, index) => {
      if (!filled(entry)) gaps.push({ field: `${field}[${index}]`, phase: 'planning',
        message: field === 'designSystem' ? '每项填写非空文字，说明资源位置、名称和使用约束' : '每项填写非空文字，说明区域位置和需要保留的内容' });
    });
  }
  const hasDesignSystem = Array.isArray(brief.designSystem) && brief.designSystem.some(filled);
  const references = Array.isArray(brief.references) ? brief.references : [];
  for (let i = 0; i < references.length; i++) {
    const reference = references[i];
    if (!reference || typeof reference !== 'object' || Array.isArray(reference)) {
      gaps.push({ field: `references[${i}]`, phase: 'planning', message: '每张参考图填写 path、borrow、avoid 和 permission' });
      continue;
    }
    for (const field of ['path', 'borrow', 'avoid', 'permission']) if (!filled(reference[field])) gaps.push({ field: `references[${i}].${field}`, phase: 'planning', message: '填写本地图路径、借鉴点、避开点和素材使用权限说明；无避开点时明确说明' });
    if (filled(reference.path)) {
      try {
        if (/^[a-z]+:\/\//i.test(reference.path)) throw Error();
        const stat = await fs.stat(path.resolve(cwd, reference.path));
        if (!stat.isFile() || stat.size === 0) throw Error();
      } catch {
        gaps.push({ field: `references[${i}].path`, phase: 'planning', message: '参考文件不存在、为空或非本地文件；先保存授权素材到项目，再填写相对路径' });
      }
    }
  }
  if (mode === 'design' && !references.length) requireText('visualDirection', '没有参考图时描述视觉方向；下一步让 Agent 提供两个结构草图供选择');
  if (mode === 'refine' && !hasDesignSystem) requireText('existingStyleSource', '填写现有组件、样式参考位置；可使用本次 inspect 与 preview 的证据位置');
  if (mode === 'design' && !hasDesignSystem) requireText('designFoundations', '选定方向后记录字体、颜色、间距与基础组件规则', 'execution');
  requireText('acceptedDirection', mode === 'design' ? '由用户选定结构方向后，填写方向与选择依据' : '确认局部修改方案后，填写方案摘要', 'execution');
  const readyForPlanning = !gaps.some(g => g.phase === 'planning');
  const readyForExecution = gaps.length === 0;
  return {
    mode, file, readyForPlanning, readyForExecution, gaps,
    nextAction: !readyForPlanning ? '先补齐 planning 项，再让 Agent 分析设计方案' : !readyForExecution
      ? mode === 'design' ? '让 Agent 提出两个结构方向，用户选择后补充 execution 项' : 'inspect 与 preview 后提出局部方案，由用户确认后补充 execution 项'
      : '先完成一个小区域，通过 run/result/diff/validate/preview 检查后再继续',
    limitations: ['仅检查输入完整性与本地参考文件存在性；未分析图片、内容真源或设计质量', '方向与权限说明由用户填写，工具未独立验证', '检查不执行 Figma 写入，也不构成 run 的权限门禁']
  };
}
