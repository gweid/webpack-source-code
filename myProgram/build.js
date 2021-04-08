const webpack = require('../webpack-master/lib/webpack')
const config = require('./webpack.config')

const compiler = webpack(config, (err, res) => {
  if (err) {
    console.log(err)
  }
})