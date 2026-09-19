import { test } from 'node:test';
import assert from 'node:assert/strict';
import { contract } from './helpers/test_schema.mjs';
import { diffTrees } from '../src/evidence.mjs';

const id = '00000000-0000-4000-8000-000000000001';
test('合同拒绝草案字段、缺失失败证据和错误 diff 类型', () => {
  assert.throws(() => contract('job', { schemaVersion: 1, jobId: id, operation: 'rollback' }));
  assert.throws(() => contract('result', { id, ok: false, finishedAt: '2026-09-17T00:00:00.000Z' }));
  assert.throws(() => contract('diff', { id, executionOk: true,
    ...diffTrees({ id: '1:2' }, null), changes: [{ id: '1:2', type: 'hidden' }] }));
});
test('实际 diff 的新增、删除、属性和顺序变更均符合合同', () => {
  const before = { id: '1:2', children: [{ id: '1:3', name: '旧名字' }, { id: '1:4' }] };
  const after = { id: '1:2', children: [{ id: '1:5' }, { id: '1:3', name: '新名字' }] };
  const report = { id, executionOk: true, ...diffTrees(before, after) };
  contract('diff', report);
  assert.deepEqual(new Set(report.changes.map(change => change.type)), new Set(['created', 'deleted', 'updated', 'moved']));
});
