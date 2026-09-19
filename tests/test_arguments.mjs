import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseArguments } from '../src/arguments.mjs';

test('局部目标参数兼容两种 ID 写法及高风险声明顺序', () => {
  assert.equal(parseArguments(['inspect', '--node', '1-2']).targetNodeId, '1:2');
  const result = parseArguments(['run', '--node', '1:2', 'test_change.js', '--high-risk', '测试风险']);
  assert.equal(result.arg, 'test_change.js');
  assert.equal(result.risk.reason, '测试风险');
  assert.equal(parseArguments(['preview']).targetNodeId, undefined);
});

test('拒绝重复、缺值、无效和不支持命令的参数', () => {
  for (const args of [
    ['inspect', '--node'], ['inspect', '--node', 'x'],
    ['inspect', '--node', '1:2', '--node', '1:3'], ['status', '--node', '1:2'],
    ['inspect', '--high-risk', '风险'], ['run', 'test.js', '--high-risk'],
    ['run', 'test.js', '--high-risk', '--node', '1:2'], ['preview', 'extra'],
    ['run', 'test.js', '--unknown', 'x']
  ]) assert.throws(() => parseArguments(args));
});
