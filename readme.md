# 

基于 webpack5.24



## 准备工作

首先，下载 webpack 的源码：

https://github.com/webpack/webpack

接着，进入到 webpack 目录，通过 npm 装包

然后，新建一个自己的项目，用来测试 webpack

所以，有基本目录结构：

```css
webpack-source-code
├── webpack-master // webpack 源码
├── myProgram
│   ├── src
│   │   ├── utils
│   │   ├── └── math.js
│   │   └── index.js
│   ├── build.js
│   ├── package-lock.json
│   ├── package.json
│   └── webpack.config.js
├── .gitignore
└── readme.md
```

其中，build.js：

```js
const webpack = require('../webpack-master/lib/webpack')
const config = require('./webpack.config')

// 执行 webpack 函数有传回调函数
// const compiler = webpack(config, (err, stats) => {
//   if (err) {
//     console.log(err)
//   }
// })

// 执行 webpack 函数没有有传回调函数
const compiler = webpack(config)
// 需要手动调用一下 compiler.run
compiler.run((err, stats) => {
  if (err) {
    console.log(err)
  }
})
```

在 build.js 文件中，执行 webpack 函数，将 webpack.config.js 配置传进去



## webpack 的 compiler

webpack 有两个主要的核心对象，一个是 compiler，另外一个是 compilation



### 1、从 webpack(config, callback) 开始

webpack 函数接收两个参数：

- config：就是 webpack.config.js 中的配置
- callback：回调函数，可传可不传

从上面的 build.js 中可以知道，webpack 函数来自于 webpack/lib/webpack.js，进入到文件里面，可以看到：

```js
const webpack = (options, callback) => {
    const create = () => {
        // 1.定义 compiler、watch、watchOptions
        let compiler;
        let watch = false;
        let watchOptions;
        
         // ...
        
        // 2.通过 createCompiler 创建一个 compiler
        compiler = createCompiler(options);
        // 拿到 webpack.config.js 中的 watch、watchOptions
        watch = options.watch;
        watchOptions = options.watchOptions || {};
        
        // 返回 compiler, watch, watchOptions
	    return { compiler, watch, watchOptions };
    }
    
    /**
	* 判断在执行 webpack 函数的时候，有没有传入 callback 回调函数
	* 无论有没有传入回调函数，结果都是会返回一个 compiler 对象
	*/
    if (callback) {
        try {
            const { compiler, watch, watchOptions } = create();
            if (watch) {
                compiler.watch(watchOptions, callback);
            } else {
                compiler.run((err, stats) => {
                    compiler.close(err2 => {
                        callback(err || err2, stats);
                    });
                });
            }
            return compiler;
        } catch (err) {
        }
    } else {
        // 执行 webpack 的时候没有传入回调函数

        // 执行 create 函数，拿到 compiler, watch
        const { compiler, watch } = create();
        if (watch) {
        }
        return compiler;
    }
}
```

可以看出，在 webpack() 内，首先，定义了 create 函数，create 函数主要做的事是：

1. 定义了 compiler 对象及一些其他参数
2. 通过 createCompiler(options) 创建 compiler
3. 将 compiler 返回

接着，会判断 webpack 函数执行的时候有没有传入 callback：

- 传入了 callback，通过 create 函数拿到 compiler 对象，执行 compiler.run，并把 compiler 返回
- 没有传入 callback，通过 create 函数拿到 compiler 对象，直接返回 compiler 

所以，我们在调用 weback 函数的时候，callback 可以传也可以不传，不传 callback 就需要手动调用一下 compiler.run，例如：

```js
const compiler = webpack(config)
compiler.run((err, stats) => {
  if (err) {
    console.log(err)
  }
})
```



### 2、创建 compiler





