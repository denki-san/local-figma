import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { init, brief, save } from '../src/project.mjs';
import { checkGuide } from '../src/guide.mjs';

const requirements = {
  'design-to-code': ['sourceNode', 'codeProject', 'runtimeUrl', 'assetPlan', 'componentMapping', 'targetSize', 'stateCoverage', 'comparisonPlan'],
  'code-to-design': ['codeProject', 'runtimeUrl', 'targetNode', 'assetPlan', 'componentMapping', 'targetSize', 'stateCoverage', 'comparisonPlan'],
  prototype: ['sourceNode', 'interactionPaths', 'stateCoverage', 'simulationNotes', 'comparisonPlan']
};

for (const [mode, fields] of Object.entries(requirements)) {
  test(`${mode} 缺失每个关键输入均阻止准备完成，已填资料保持独立`, async t => {
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'test_scenarios_'));
    t.after(() => fs.rm(cwd, { recursive: true, force: true }));
    await init(cwd, 'https://figma.com/design/example/Test?node-id=1-2');
    const generated = await brief(cwd, mode);
    Object.assign(generated.brief, { objective: '案例目标', sourceContent: '来源正文', editScope: '授权测试区', preservationNotes: '保留原稿', acceptedDirection: '已授权范围内执行' });
    for (const field of fields) generated.brief[field] = `案例的 ${field} 说明`;
    await save(generated.file, generated.brief);
    assert.equal((await checkGuide(cwd, mode)).readyForExecution, true);
    for (const field of fields) {
      const value = generated.brief[field];
      generated.brief[field] = ' ';
      await save(generated.file, generated.brief);
      const report = await checkGuide(cwd, mode);
      assert.equal(report.readyForPlanning, false);
      assert(report.gaps.some(gap => gap.field === field));
      generated.brief[field] = value;
    }
    await assert.rejects(brief(cwd, mode), /已有需求资料/);
    await brief(cwd, 'refine');
    await assert.rejects(brief(cwd, '../escape'), /场景必须/);
  });
}
