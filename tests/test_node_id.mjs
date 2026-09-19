import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isNodeId } from '../src/node-id.mjs';
import { parseArguments } from '../src/arguments.mjs';

test('保留普通节点和实例内完整节点标识', () => {
  for (const id of ['0:1','153:9848','I153:9884;150:7584','I1:2;3:4;5:6']) {
    assert.equal(isNodeId(id),true);
    assert.equal(parseArguments(['inspect','--node',id]).targetNodeId,id);
  }
  assert.equal(parseArguments(['inspect','--node','I1-2;3-4']).targetNodeId,'I1:2;3:4');
});

test('实例节点校验继续拒绝畸形输入与路径', () => {
  for (const id of [null,{},1,'','I1:2','1:2;3:4','I1:2;','I1:2;I3:4','../1:2','I1:2;3:4/',' I1:2;3:4','I1:2;3:4\n','I1:2'+ ';3:4'.repeat(300)]) {
    assert.equal(isNodeId(id),false,JSON.stringify(id));
  }
});
