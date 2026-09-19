// 普通节点与实例内部节点都使用 Figma 返回的完整标识，禁止路径等任意输入。
export function isNodeId(value) {
  return typeof value === 'string' && value.length <= 1024
    && /^(?:\d+:\d+|I\d+:\d+(?:;\d+:\d+)+)$/.test(value);
}
