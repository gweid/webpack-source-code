# webpack 源码阅读

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



webpack.config.js:

```js
const path = require('path')

module.exports = {
  entry: './src/index.js',
  output: {
    filename: 'bundle.js',
    path: path.resolve(__dirname, 'dist')
  },
  mode: "development",
	devtool: "source-map",
  module: {
    rules: [
      {
        test: /\.js$/,
        use: ['babel-loader']
      }
    ]
  },
  plugins: []
}
```



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
                // config 文件有没有配置 watch，如果有，会监听文件改变，重新编译
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
  - 里面还有一层判断 config 文件有没有配置 watch，如果有，会监听文件改变，重新编译
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

由上面的 webpack() 可以看出，compiler 由 createCompiler 这个函数返回，看看 createCompiler 这个函数（webpack/lib/webpack.js）：

```js
const createCompiler = rawOptions => {
    // 格式化、初始化传进来的参数
	const options = getNormalizedWebpackOptions(rawOptions);
	applyWebpackOptionsBaseDefaults(options);
    
    // 通过 new Compiler 得到一个 compiler 对象
	const compiler = new Compiler(options.context);
	// 将 options（经过格式化后的 webpack.config.js ）挂载到 compiler 上
	compiler.options = options;
    
    // ...
    
    // 注册所有的插件
	if (Array.isArray(options.plugins)) {
		for (const plugin of options.plugins) {
			if (typeof plugin === "function") {
				// 如果插件是一个函数，用 call 的形式调用这个函数，并把 compiler 当参数
				plugin.call(compiler, compiler);
			} else {
				// 如果插件是对象形式，那么插件身上都会有 apply 这个函数，调用插件的 apply 函数并把 compiler 当参数
				// 写一个 webpack 插件类似：class MyPlugin = { apply(compiler) {} }
				plugin.apply(compiler);
			}
		}
	}
    
    // 调用 compiler 身上的两个钩子 environment、afterEnvironment
	compiler.hooks.environment.call();
	compiler.hooks.afterEnvironment.call();
    
    // WebpackOptionsApply().process 主要用来处理 config 文件中除了 plugins 的其他属性
	// 这个函数非常重要，会将配置的一些属性转换成插件注入到 webpack 中 
	// 例如：入口 entry 就被转换成了插件注入到 webpack 中 
	new WebpackOptionsApply().process(options, compiler);
	// 调用 initialize 钩子
	compiler.hooks.initialize.call();
	// 返回 compiler
	return compiler;
}
```

createCompiler 函数主要的逻辑就是：

1. 格式化、初始化传进来的参数
2. 通过 new Compiler 得到一个 compiler 对象
3. 将 options（经过格式化后的 webpack.config.js ）挂载到 compiler 上
4. 注册所有的插件
   - 如果插件是一个函数，用 call 的形式调用这个函数，并把 compiler 当参数
   - 如果插件是对象形式，那么插件身上都会有 apply 这个函数，调用插件的 apply 函数并把 compiler 当参数
5. 调用 compiler 身上的一些钩子
6. WebpackOptionsApply().process 处理 config 文件中除了 plugins 的其他属性
7. 返回 compiler



看看 WebpackOptionsApply().process （webpack/lib/WebpackOptionsApply.js）这个函数，这个函数非常重要，会将配置的一些属性转换成插件注入到 webpack 中，例如：入口 entry 就被转换成了插件注入到 webpack 中 

```js
class WebpackOptionsApply extends OptionsApply {
    // ...
    
    /**
	 * 这个方法的作用：将传入的 webpack.config.js 的属性（例如 devtool）转换成 webpack 的 plugin 注入到 webpack 的生命周期中
	 * 导入后就是进行例如：new ChunkPrefetchPreloadPlugin().apply(compiler) 的过程
	 * 这些 plugin 后续将通过 tapable 实现钩子的监听，并进行自身逻辑的处理
	 * 
	 * 所以，在 webpack 中，插件是非常重要的，贯穿了整个 webpack 的生命周期
	 */
    process(options, compiler) {
        // 根据各种配置情况，决定是否使用一些 plugin
		if (options.externals) {
			//@ts-expect-error https://github.com/microsoft/TypeScript/issues/41697
			const ExternalsPlugin = require("./ExternalsPlugin");
			new ExternalsPlugin(options.externalsType, options.externals).apply(
				compiler
			);
		}
        if (options.externalsPresets.node) {
			const NodeTargetPlugin = require("./node/NodeTargetPlugin");
			new NodeTargetPlugin().apply(compiler);
		}
		if (options.externalsPresets.electronMain) {
			//@ts-expect-error https://github.com/microsoft/TypeScript/issues/41697
			const ElectronTargetPlugin = require("./electron/ElectronTargetPlugin");
			new ElectronTargetPlugin("main").apply(compiler);
		}
        
        //... 这里是一堆根据 webpack.config.js 的配置转换成 plugin 的操作
        
        // 处理入口，将 entry: '', 转换成 EntryOptionPlugin 插件进行注入
		new EntryOptionPlugin().apply(compiler);
		compiler.hooks.entryOption.call(options.context, options.entry);
        
        //....
    }
}
```



可以看出，compiler 是通过 new Compiler 这个类得到的，而 new 一个类最主要的就是初始化这个类的 constructor，现在来看看 Compiler 这个类（webpack/lib/Compiler.js）：

```js
class Compiler {
    constructor(context) {
        // 初始化了一系列的钩子
		// 使用的是 tapable
		// tapable，简单来说，就是一个基于事件的流程管理工具，主要基于发布订阅模式实现
        this.hooks = Object.freeze({
            initialize: new SyncHook([]),
            
            // ...
            
            beforeRun: new AsyncSeriesHook(["compiler"]),
            run: new AsyncSeriesHook(["compiler"])
            
            // ...
        })
        
        this.webpack = webpack;
        
        this.name = undefined;
		this.parentCompilation = undefined;
		this.root = this;
		this.outputPath = "";
		this.watching = undefined;
        
        // ...
    }
}
```

可以看出，new Compiler 最主要的就是做了两件事：

- 使用 tapable 初始化了一系列的钩子
  - tapable 是什么？简单来说，就是一个基于事件的流程管理工具，主要基于发布订阅模式实现
  - 这里暂时不展开说 tapable，后面再单独解析
- 初始化了一些参数，例如 this.outputPath 等等

自此，一个 compiler 对象就创建完成



### 3、compiler.run()

再回到 build.js 文件 和 webpack() 这个函数：

build.js：

```js
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

webpack() 函数：

```js
const webpack = (options, callback) => {
    if (callback) {
        const { compiler, watch, watchOptions } = create();

        compiler.run((err, stats) => {
            // ...
        });

        return compiler;   
    }
}
```

可以看到，执行 webpack() 函数的重要一步就是调用 compiler.run，现在回到 Compiler 这个类身上,看看 run 方法：

```js
class Compiler {
    // ...
    
    run(callback) {
        // ...
        
        // 处理错误的函数
		const finalCallback = (err, stats) => {
            // ...
            
			if (err) {
				this.hooks.failed.call(err);
			}
			this.hooks.afterDone.call(stats);
		};
        
        // 定义了一个 onCompiled 函数，主要是传给 this.compile 作为执行的回调函数
        const onCompiled = (err, compilation) => {}
        
        // run，主要是流程： beforeRun 钩子 --> beforeRun 钩子 --> this.compile
		// 如果遇到 error，就执行 finalCallback
		// 这里调用 beforeRun、run 主要就是提供 plugin 执行时机
		const run = () => {
            // 执行 this.hooks.beforeRun.callAsync，那么在 beforeRun 阶段注册的 plugin 就会在这时执行
			this.hooks.beforeRun.callAsync(this, err => {
				if (err) return finalCallback(err);
                // this.hooks.run.callAsync，在 run 阶段注册的 plugin 就会在这时执行
				this.hooks.run.callAsync(this, err => {
					if (err) return finalCallback(err);

					this.readRecords(err => {
						if (err) return finalCallback(err);

						this.compile(onCompiled);
					});
				});
			});
		};
        
        run();
    }
}
```

从上面可以看出，compiler.run 的主要逻辑：

1. 定义了一个错误处函数 finalCallback
2. 定义了一个 onCompiled 函数，作为 this.compile 执行的回调函数
3. 定义了 run，主要流程就是：beforeRun 钩子 --> run 钩子 --> this.compile，如果遇到 error，就执行 finalCallback
4. 执行 compiler.run 内部定义的 run()

而 compiler.run 内部定义的 run 实际上就是调用了 this.compile，也就是 Compiler 上的 compile 方法



### 4、compiler.compile ()

现在看看 compiler.run 里面调用的 compile 函数

```js
class Compiler {
    // ...
    
    compile(callback) {
        // 初始化 compilation 的参数
		const params = this.newCompilationParams();
        
        // 钩子 beforeCompile
        this.hooks.beforeCompile.callAsync(params, err => {
            // 钩子 compile
			this.hooks.compile.call(params);
            
            // 通过 this.newCompilation 返回一个 compilation 对象
			const compilation = this.newCompilation(params);
            
            // 钩子 make
            this.hooks.make.callAsync(compilation, err => {
                // 钩子 finishMake
                this.hooks.finishMake.callAsync(compilation, err => {
                    // 钩子 afterCompile
                    this.hooks.afterCompile.callAsync(compilation, err => {
                        
                    })
                })
            })
        }
    }
}
```

先忽略 compilation 相关的，那么可以看到，compiler.compile() 里面主要就是 5 个钩子的调用

- 钩子 beforeCompile
- 钩子 compile
- 钩子 make
- 钩子 finishMake
- 钩子 afterCompile



### 5、run() --> compile() 的一些 hook

![](/imgs/img1.png)





## tapable





## compilation

首先，了解一下 compilation 以及它与 complier 的一个区别

- compiler：webpack 刚开始构建的时候就创建了，并且在整个 wbepack 的生命周期都存在

- compilation：在准备编译某一个模块（例如 index.js）的时候才会创建，主要存在于 compile 到 make 这一段生命周期里面

问题：既然 compiler 存在于 webpack 整个生命周期，那么为什么不直接使用 compiler 而是要搞一个 compilation 出来？

>  比如，通过 watch 开启对文件的监听，如果文件发生变化，那就重新编译。如果这个时候使用 compiler，那么又要进行前面的一堆初始化操作，完全没有必要，只需要对文件重新编译就好，那么就可以创建一个新的 compilation 对文件重新编译。而如果修改了 webpack.config.js 文件，重新执行 npm run build，这个时候就需要使用 compiler 了。



