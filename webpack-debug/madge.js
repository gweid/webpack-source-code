// 利用 madge 生成依赖图

const madge = require('madge');

madge('./src/index.js').then((res) => {
  console.log(res.obj());   // 在控制台可以看到结果
  res.image('./image.svg');     // 将以来结果存储为svg文件
})
