// 只读取已绑定目标；用 figma-local run 执行此函数体。
return {
  id: target.id,
  name: target.name,
  type: target.type,
  visible: target.visible,
  locked: target.locked,
  width: target.width,
  height: target.height,
  parentId: target.parent ? target.parent.id : null
};
