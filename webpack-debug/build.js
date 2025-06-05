const webpack = require('../webpack/lib/webpack')
const config = require('./webpack.config')

// 执行 webpack 函数有传回调函数
webpack(config, (err, stats) => {
  if (err) {
    console.log(err)
  }
})

// 执行 webpack 函数如果没有传回调函数，需要手动调用一下 compiler.run 启动 webpack
// const compiler = webpack(config)
// compiler.run((err, stats) => {
//   if (err) {
//     console.log(err)
//   }
// })
