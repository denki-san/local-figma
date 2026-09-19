import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createConnection } from '../src/connection.mjs';

test('空闲插件过期后可自动接续，旧客户端永不重新夺取连接', () => {
  let clock = 0;
  const connection = createConnection({ now: () => clock });
  assert.equal(connection.connected, false);
  assert.equal(connection.ageMs, null);
  assert.equal(connection.touch('original', false).ok, true);
  assert.equal(connection.connected, true);
  assert.equal(connection.touch('replacement', false).code, 'CONNECTION_IN_USE');
  clock = 15000;
  assert.equal(connection.connected, false);
  assert.equal(connection.touch('replacement', false).ok, true);
  clock = 30000;
  assert.equal(connection.touch('original', false).code, 'RETIRED_CLIENT');
  assert.equal(connection.touch('replacement', false).ok, true);
});

test('任务状态不明时不转交，原插件醒来可继续报告结果', () => {
  let clock = 0;
  const connection = createConnection({ now: () => clock });
  connection.touch('original', false);
  clock = 60000;
  assert.equal(connection.touch('replacement', true).code, 'OPERATION_UNCERTAIN');
  assert.equal(connection.connected, false);
  assert.equal(connection.touch('original', true).ok, true);
  assert.equal(connection.connected, true);
});

test('非法身份不会刷新租约；持续心跳维持长会话', () => {
  let clock = 0;
  const connection = createConnection({ now: () => clock });
  for (const client of [null, '', 'x'.repeat(161)]) assert.equal(connection.touch(client, false).ok, false);
  assert.equal(connection.ageMs, null);
  for (let i = 0; i < 100; i++) {
    clock += 10000;
    assert.equal(connection.touch('original', false).ok, true);
    assert.equal(connection.connected, true);
  }
});

test('原插件在租约到期前后均可立即续接，不等待替换插件的接管窗口', () => {
  for (const elapsed of [14999, 15000, 60000]) {
    for (const pending of [false, true]) {
      let clock = 0;
      const connection = createConnection({ now: () => clock });
      assert.equal(connection.touch('original', false).ok, true);
      clock = elapsed;
      assert.equal(connection.connected, elapsed < 15000);
      assert.equal(connection.touch('original', pending).ok, true);
      assert.equal(connection.ageMs, 0);
      assert.equal(connection.owns('original'), true);
      assert.equal(connection.touch('replacement', pending).code,
        pending ? 'OPERATION_UNCERTAIN' : 'CONNECTION_IN_USE');
      assert.equal(connection.owns('original'), true);
    }
  }
});

test('拒绝替换插件不会刷新过期租约或改变原插件身份', () => {
  let clock = 0;
  const connection = createConnection({ now: () => clock });
  connection.touch('original', false);
  clock = 15000;
  assert.equal(connection.touch('replacement', true).code, 'OPERATION_UNCERTAIN');
  assert.equal(connection.ageMs, 15000);
  assert.equal(connection.connected, false);
  clock += 1;
  assert.equal(connection.touch('original', true).ok, true);
  assert.equal(connection.owns('original'), true);
});
