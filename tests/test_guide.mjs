import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { init, brief, save } from '../src/project.mjs';
import { checkGuide } from '../src/guide.mjs';

async function fixture(t, mode) {
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'test_figma_guide_'));
  t.after(() => fs.rm(cwd, { recursive: true, force: true }));
  await init(cwd, 'https://figma.com/design/example/Test?node-id=1-2');
  const generated = await brief(cwd, mode);
  return { cwd, ...generated };
}
const base = { objective: '突出主要操作', sourceContent: '用户提供的真实内容', editScope: '绑定画板', preservationNotes: '保留品牌资产' };
test('设计资源空项不能绕过设计基础检查，保护区域要求有效说明', async t => {
  const f = await fixture(t, 'design');
  Object.assign(f.brief, base, { audience: '读者', primaryTask: '查找资料', targetSize: '桌面', visualDirection: '简洁', stateCoverage: '长文和空态', acceptedDirection: '方向 A' });
  for (const invalid of [null, '', '  ', {}, 1, []]) {
    f.brief.designSystem = [invalid]; f.brief.protectedRegions = [invalid];
    await save(f.file, f.brief);
    const report = await checkGuide(f.cwd, 'design');
    assert.equal(report.readyForPlanning, false);
    assert(report.gaps.some(g => g.field === 'designSystem[0]'));
    assert(report.gaps.some(g => g.field === 'protectedRegions[0]'));
    assert(report.gaps.some(g => g.field === 'designFoundations'));
  }
  f.brief.designSystem = ['参考页中的正文样式，保持原绑定'];
  f.brief.protectedRegions = ['页头，保留标题和导航'];
  await save(f.file, f.brief);
  assert.equal((await checkGuide(f.cwd, 'design')).readyForExecution, true);
});
test('空白设计 brief 给出缺口，规划完整后仍等待方向确认', async t => {
  const f = await fixture(t, 'design');
  assert.equal((await checkGuide(f.cwd, 'design')).readyForPlanning, false);
  Object.assign(f.brief, base, { audience: '首次用户', primaryTask: '完成录入', targetSize: '移动端画板', visualDirection: '清晰、低密度', stateCoverage: '长文、空态与错误态' });
  await save(f.file, f.brief);
  let report = await checkGuide(f.cwd, 'design');
  assert.equal(report.readyForPlanning, true);
  assert.equal(report.readyForExecution, false);
  assert.deepEqual(report.gaps.map(g => g.field), ['designFoundations', 'acceptedDirection']);
  Object.assign(f.brief, { designFoundations: '字体、颜色、间距已约定', acceptedDirection: '用户选择方向 A' });
  await save(f.file, f.brief);
  report = await checkGuide(f.cwd, 'design');
  assert.equal(report.readyForExecution, true);
});
test('参考图逐张检查文件与借鉴说明，精修无需从零设计字段', async t => {
  const f = await fixture(t, 'refine');
  Object.assign(f.brief, base, { existingStyleSource: '已保存的 inspect 和 preview', acceptedDirection: '用户确认局部方案', references: [{ path: 'test_reference.svg', borrow: '信息层级', avoid: '不复用字标', permission: '自有素材' }] });
  await save(f.file, f.brief);
  assert.equal((await checkGuide(f.cwd, 'refine')).readyForPlanning, false);
  await fs.writeFile(path.join(f.cwd, 'test_reference.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>');
  assert.equal((await checkGuide(f.cwd, 'refine')).readyForExecution, true);
  f.brief.references[0].borrow = '';
  await save(f.file, f.brief);
  assert((await checkGuide(f.cwd, 'refine')).gaps.some(g => g.field === 'references[0].borrow'));
  f.brief.references = ['test_reference.svg'];
  await save(f.file, f.brief);
  assert.equal((await checkGuide(f.cwd, 'refine')).readyForPlanning, false);
});
