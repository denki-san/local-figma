// 将绑定目标设为 Text 节点；运行前修改下面的示例文案。
if (target.type !== 'TEXT') throw Error('请绑定需要修改的 Text 节点');
if (target.fontName === figma.mixed) throw Error('目标包含混合字体，请先检查并明确字体范围');
await figma.loadFontAsync(target.fontName);
target.characters = '替换为你的新文案';
return {
  changedNodeIds: [target.id],
  charactersLength: target.characters.length,
  textAutoResize: target.textAutoResize
};
