# webpack 源码阅读

基于 webpack5.24



![](/imgs/img7.jpg)



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
  context: path.resolve(__dirname, "."), // 这个必须有，不然会有问题
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
    // 格式化、初始化传进来的参数（如 output、devserver、plugin 给赋值一些默认的配置格式，防止后面使用时报错）
	// getNormalizedWebpackOptions + applyWebpackOptionsBaseDefaults 合并出最终的 webpack 配置
	const options = getNormalizedWebpackOptions(rawOptions);
	applyWebpackOptionsBaseDefaults(options);
    
    // 通过 new Compiler 得到一个 compiler 对象
	const compiler = new Compiler(options.context);
	// 将 options（经过格式化后的 webpack.config.js ）挂载到 compiler 上
	compiler.options = options;
    
    // 把 NodeEnvironmentPlugin 插件挂载到compiler实例上
	// NodeEnvironmentPlugin 插件主要是文件系统挂载到 compiler 对象上
	// 如infrastructureLogger(log插件)、inputFileSystem(文件输入插件)、outputFileSystem(文件输出插件)、watchFileSystem(监听文件输入插件)
	new NodeEnvironmentPlugin({
		infrastructureLogging: options.infrastructureLogging
	}).apply(compiler);
    
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

1. 格式化、初始化传进来的参数格式化、初始化传进来的参数（如 output、devserver、plugin 给赋值一些默认的配置格式，防止后面使用时报错）
   - getNormalizedWebpackOptions + applyWebpackOptionsBaseDefaults 合并出最终的 webpack 配置
2. 通过 new Compiler 得到一个 compiler 对象
3. 将 options（经过格式化后的 webpack.config.js ）挂载到 compiler 上
4. NodeEnvironmentPlugin 把文件系统挂载到 compiler 对象上
   - 如 infrastructureLogger(log插件)、inputFileSystem(文件输入插件)、outputFileSystem(文件输出插件)、watchFileSystem(监听文件输入插件) 等
5. 注册所有的插件
   - 如果插件是一个函数，用 call 的形式调用这个函数，并把 compiler 当参数
   - 如果插件是对象形式，那么插件身上都会有 apply 这个函数，调用插件的 apply 函数并把 compiler 当参数
6. 调用 compiler 身上的一些钩子
7. WebpackOptionsApply().process 处理 config 文件中除了 plugins 的其他属性
8. 返回 compiler



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
            
            // 钩子 make, 使用 compilation 对模块执行编译的
            this.hooks.make.callAsync(compilation, err => {
                // 钩子 finishMake
                this.hooks.finishMake.callAsync(compilation, err => {
                    process.nextTick(() => {
                        
                        // 执行compilation的 finsh 方法 对 module 上的错误或者警告处理
                        compilation.finish(err => {
                            
                            // 执行 seal 对 module 代码进行封装输出
                            compilation.seal(err => {
                                
                                // 钩子 afterCompile
                                this.hooks.afterCompile.callAsync(compilation, err => {})
                            })
                        })
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
- 钩子 make：使用 compilation 对模块执行编译的
- 钩子 finishMake
- compilation.finish
- compilation.seal：执行 seal 对 make 阶段处理过的 module 代码进行封装输出
- 钩子 afterCompile



### 5、run() --> compile() 的一些 hook

![](/imgs/img1.png)





## tapable

### 1、tapable 是什么

`tapable`是`webpack`的核心模块，也是`webpack`团队维护的，是`webpack plugin`的基本实现方式。主要的作用就是：基于事件流程管理



### 2、tapable 的基本使用

以 AsyncSeriesHook这个 hook 为例：

```js
const { AsyncSeriesHook } = require("tapable")

// 创建一个 SyncHook 类型的 hook
const run = new AsyncSeriesHook(["compiler"])
```

SyncHook 就是 tapable 中提供的某一个用于创建某一类 hook 的类，通过 new 来生成实例。构造函数 constructor 接收一个数组，数组有多少项，**表示生成的这个实例注册回调的时候接收多少个参数**

hook 的主要有两个实例：

- `tap`：就是**注册事件回调**的方法
- `call`：就是触发事件，**执行 tap 中回调的方法**

所以有，注册事件回调：

```js
run.tapAsync('myRun', (compiler) => {
    console.log(compiler)
})
```

这样就通过 tab 把事件回调函数注册好了。而这个事件调用时机就是在执行 call 的时候调用

```js
run.callAsync(compiler)
```

执行 call，就会调用之前注册的回调，并把 compiler 当做参数传过去



所以 tabpad 的使用主要就是三步：

1. new 一个 hook 类
2. 使用 tab 注册回调
3. 在 call 的时候执行回调



### 3、一些常用的 tapable hook

可以参考 https://juejin.cn/post/6939794845053485093



### 4、tapable 基本原理

可以参考：https://juejin.cn/post/6946094725703139358



## compilation

首先，了解一下 compilation 以及它与 complier 的一个区别

- compiler：webpack 刚开始构建的时候就创建了，并且在整个 wbepack 的生命周期都存在

- compilation：在准备编译某一个模块（例如 index.js）的时候才会创建，主要存在于 compile 到 make 这一段生命周期里面

问题：既然 compiler 存在于 webpack 整个生命周期，那么为什么不直接使用 compiler 而是要搞一个 compilation 出来？

>  比如，通过 watch 开启对文件的监听，如果文件发生变化，那就重新编译。如果这个时候使用 compiler，那么又要进行前面的一堆初始化操作，完全没有必要，只需要对文件重新编译就好，那么就可以创建一个新的 compilation 对文件重新编译。而如果修改了 webpack.config.js 文件，重新执行 npm run build，这个时候就需要使用 compiler 了。



### 1、compilation 的创建

回头看看 compiler.compile()【webpack/lib/Compiler.js】 这个函数：

```js
class Compiler {
    // ...
    
    compile(callback) {
        // 初始化 compilation 的参数
		const params = this.newCompilationParams();
        
        this.hooks.beforeCompile.callAsync(params, err => {
            this.hooks.compile.call(params);
            
            // 通过 this.newCompilation 返回一个 compilation 对象
			const compilation = this.newCompilation(params);
        })
    }
}
```

可以看出来，compilation 由 this.newCompilation() 返回，来看看这个函数：

```js
class Compiler {
    // ...
    
    newCompilation(params) {
        // 调用 this.createCompilation() 返回 compilation
		const compilation = this.createCompilation();
		compilation.name = this.name;
		compilation.records = this.records;
		this.hooks.thisCompilation.call(compilation, params);
		this.hooks.compilation.call(compilation, params);
		return compilation;
	}
}
```

可以看出，compilation 又由 this.createCompilation() 返回

```js
class Compiler {
    // ...
    
    createCompilation() {
		this._cleanupLastCompilation();
        // new Compilation 创建 compilation
		return (this._lastCompilation = new Compilation(this));
	}
}
```

到此，终于可以知道 compilation 其实就是通过 new 一个 Compilation 类得来，并且把 compiler 本身传递给 Compilation 的构造函数 constructor



### 2、compilation 的调用时机

回看上面 compiler.compile() 的代码：

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
            
            // 钩子 make，这个钩子里面就是真正使用 compilation 执行编译的
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

这里面有一个非常重要的钩子调用，就是  this.hooks.make.callAsync，这个钩子里面就是真正使用 compilation 执行编译的。

那么这个钩子是什么时候被注册的呢？

1、webpack/lib/webpack.js 中的 createCompiler：

```js
const createCompiler = rawOptions => {
    // ...
    
    new WebpackOptionsApply().process(options, compiler);
}
```

2、WebpackOptionsApply().process() 【webpack/lib/WebpackOptionsApply.js】

```js
class WebpackOptionsApply extends OptionsApply {
    // ...
    
    process(options, compiler) {
        //...
        new EntryOptionPlugin().apply(compiler);
    }
}
```

3、再看 EntryOptionPlugin().apply(compiler)【webpack/lib/EntryOptionPlugin.js】

```js
class EntryOptionPlugin {
    apply(compiler) {
		compiler.hooks.entryOption.tap("EntryOptionPlugin", (context, entry) => {
			EntryOptionPlugin.applyEntryOption(compiler, context, entry);
			return true;
		});
	}
    
    static applyEntryOption(compiler, context, entry) {
		if (typeof entry === "function") {
			const DynamicEntryPlugin = require("./DynamicEntryPlugin");
			new DynamicEntryPlugin(context, entry).apply(compiler);
		} else {
			const EntryPlugin = require("./EntryPlugin");
			for (const name of Object.keys(entry)) {
				const desc = entry[name];
				const options = EntryOptionPlugin.entryDescriptionToOptions(
					compiler,
					name,
					desc
				);
				for (const entry of desc.import) {
					new EntryPlugin(context, entry, options).apply(compiler);
				}
			}
		}
	}
}
```

可以看到，EntryOptionPlugin.apply() 主要做的事：就是调用了自身的 applyEntryOption 方法，里面对入口 entry 分情况处理，这里主要看 new EntryPlugin(context, entry, options).apply(compiler) 这个

4、然后来到 EntryPlugin.apply()【webpack\lib\EntryPlugin.js】

```js
class EntryPlugin {
    apply(compiler) {
        // ...

		compiler.hooks.make.tapAsync("EntryPlugin", (compilation, callback) => {
		});
	}
}
```

终于找到了 compiler.hooks.make.tapAsync，这就是注册了 make hook 回调函数的地方



通过流程图表示这个注册 compilation 回调的流程：

![](/imgs/img2.png)



### 3、compilation 对模块的处理

由上面可知，compilation 是在 make 这个钩子里面执行的，而注册这个钩子的地方，绕了一圈，定位到了 lib\EntryPlugin.js 中 EntryPlugin 这个类的 apply 中 compiler.hooks.make.tapAsync 进行回调注册。现在接着从这个注册回调中分析：

```js
class EntryPlugin {
    apply(compiler) {
        // ...

		compiler.hooks.make.tapAsync("EntryPlugin", (compilation, callback) => {
			const { entry, options, context } = this;
            
            // 创建依赖
			const dep = EntryPlugin.createDependency(entry, options);
            
            // 通过 compilation 的 addEntry 添加入口，从入口开始编译
			compilation.addEntry(context, dep, options, err => {
				callback(err);
			});
		});
	}
}
```

可以看到，这个注册回调函数里面调用了 compilation.addEntry()，这个 Compilation 类里面的 addEntry 主要的作用就是添加入口模块

```js
class Compilation {
    // 1 初始化 constructor
    conscructor() {
        this.addModuleQueue = new AsyncQueue({
			name: "addModule",
			parent: this.processDependenciesQueue,
			getKey: module => module.identifier(),
			// processor：处理方法，调用 this._addModule
			processor: this._addModule.bind(this)
		});
		this.factorizeQueue = new AsyncQueue({
			name: "factorize",
			parent: this.addModuleQueue,
			// processor：处理方法，调用 this._factorizeModule
			processor: this._factorizeModule.bind(this)
		});
		this.buildQueue = new AsyncQueue({
			name: "build",
			parent: this.factorizeQueue,
			// processor：处理方法，调用 this._buildModule
			processor: this._buildModule.bind(this)
		});
    }
    
    // 2 这个函数的主要作用就是通过 _addEntryItem 添加入口，因为编译需要从入口开始
	addEntry(context, entry, optionsOrName, callback) {
        // ...

        // 添加入口
		this._addEntryItem(context, entry, "dependencies", options, callback);
	}
    
    // 3
    _addEntryItem(context, entry, target, options, callback) {
        // ...
        
        // 调用 addEntry 钩子
		this.hooks.addEntry.call(entry, options);
        // // 调用 this.addModuleTree 将当前的模块加入到 module tree(模块树)
        this.addModuleTree({}, (err, module) => {})
    }
    
    // 4
    addModuleTree({ context, dependency, contextInfo }, callback) {
        // ...
        
        // 调用 handleModuleCreation 处理模块并
        this.handleModuleCreation({}, err => {})
    }
    
    // 5
    handleModuleCreation(
		{factory, dependencies, originModule, contextInfo, context, recursive = true},
		callback
    )
    {
        // 创建了模块图
        const moduleGraph = this.moduleGraph;
		
        // 6
        this.factorizeModule(
            {currentProfile,factory,dependencies,originModule,contextInfo,context},
            (err, newModule) => {
                
                /**
				 * compilation.factorizeModule 执行 factorizeQueue 的 add 方法将模块添加到 factorizeQueue 队列
				 * factorizeQueue 通过 new AsyncQueue 得到
				 * 
				 * factorizeQueue.add()=>setImmediate(root._ensureProcessing)=>AsyncQueue._ensureProcessing=>AsyncQueue._startProcessing => compilation.__factorizeModule
				 * 
				 * compilation._factorizeModule 中再调用 factory.create()
				 * 通过 compilation.factorizeModule 的回调函数中接收 factorizeQueue.add 返回的 newModule
				 * 最后通过 compilation.addModule 添加 newModule 模块
				 */
                
                // 9
                this.addModule(newModule, (err, module) => {
                    
                    /**
					 * compilation.addModule 执行 addModuleQueue.add 将模块添加到 addModuleQueue
					 * addModuleQueue 通过 new AsyncQueue 创建
					 * 
					 * addModuleQueue.add=>setImmediate(root._ensureProcessing)=>AsyncQueue._ensureProcessing=>AsyncQueue._startProcessing => compilation._addModule
					 * 
					 * 在 compilation.addModule 的回调中继续调用 compilation.buildModule
					 */
                    
                    // 12
                    this.buildModule(module, err => {
                        
                        /**
						 * compilation.buildModule 执行 buildQueue.add 将 module 添加到 buildQueue
						 * buildQueue 通过 new AsyncQueue 创建
						 * 
						 * buildQueue.add=>setImmediate(root._ensureProcessing)=>AsyncQueue._ensureProcessing=>AsyncQueue._startProcessing => compilation._buildModule
						 * 
						 * compilation._buildModule 里面执行 module.needBuild 判断模块需不需要构建
						 * 需要构建，执行 module.needBuild 的回调，回调里面执行 module.build 对模块进行构建
						 * this.buildModule 回调里面继续调用 compilation.processModuleDependencies
						 */
                        
                        // 15
                        this.processModuleDependencies(module, err => {
                            
                        })
                    })
                })
            }
        )
    }
     
    // 7
    factorizeModule(options, callback) {
		this.factorizeQueue.add(options, callback);
	}
    // 8
    _factorizeModule(
		{currentProfile,factory,dependencies,originModule,contextInfo,context},
		callback
	) 
    {
        // 对模块进行解析【执行NormalModuleFactory实例上的create方法】
		factory.create({}, (err, result) => {})
    }
    
    // 10
    addModule(module, callback) {
		// 将模块添加到 addModuleQueue
		this.addModuleQueue.add(module, callback);
	}
    // 11
    _addModule(module, callback) {
        // ...
        
        // 添加创建的 module 到 modules
        this._modules.set(identifier, module);
        this.modules.add(module);
        
        // ...
    }
    
    // 13
    buildModule(module, callback) {
		this.buildQueue.add(module, callback);
	}
    // 14
    _buildModule(module, callback) {
        // ...
        
        // 判断当前模块需不需要构建，需要构建就执行回调
        module.needBuild({}, (err, needBuild) => {
            // ...
            
		    // 对模块进行构建
			// 但是这里直接点进 module.build 里面，会发现里面只是抛出了一个错误
			// 其实这里是使用了多态，module.build 是类 Moudle 上的方法，同时 Module 是一个父类
			// 其他子类继承父类 Moudle，并对 build 方法进行重写
			// 所以这里的 module.build 方法其实是 NormalModule 类继承了 Module 类并对重写的 build 方法
		    module.build({}, err => {})
        })
    }
}
```

1. compilation.addEntry：调用 compilation._addEntryItem 添加入口
2.  compilation._addEntryItem：调用 addEntry 钩子。然后通过 compilation.addModuleTree 将当前的模块加入到 module tree(模块树)
3. compilation.addModuleTree：调用 compilation.handleModuleCreation 处理模块并对模块进行创建
4. compilation.handleModuleCreation：
   - 创建了模块图
   - 调用 compilation.factorizeModule
5. compilation.factorizeModule：
   - 执行 factorizeQueue 的 add 方法将模块添加到 factorizeQueue 队列
     - compilation.factorizeQueue.add()=>setImmediate(root._ensureProcessing)=>AsyncQueue._ensureProcessing=>AsyncQueue._startProcessing => compilation.__factorizeModule=>factory.create()
     - 最终就是使用 factory.create() 去创建 module
   - 执行回调，回调中执行 compilation.addModule
6. compilation.addModule：
   - 执行 addModuleQueue.add 将模块添加到 addModuleQueue 队列
     - compilation.addModuleQueue.add()=>setImmediate(root._ensureProcessing)=>AsyncQueue._ensureProcessing=>AsyncQueue._startProcessing => compilation.__addModule
     - 最终就是调用__addModule 方法将 module 添加到 compilation.modules 中
   - 执行回调，回调中继续调用 compilation.buildModule
7. compilation.buildModule：
   - 执行 addModuleQueue.add 将模块添加到 addModuleQueue 队列
     - compilation.buildQueue.add()=>setImmediate(root._ensureProcessing)=>AsyncQueue._ensureProcessing=>AsyncQueue._startProcessing => compilation.__buildModule
     - 最终就是通过 __buildModule 去编译模块

其实 compilation 对模块进行处理，简单来说就是：

1. compilation.addEntry=>compilation._addEntryItem，通过入口将模块添加到 module tree(模块树)
2. 然后调用了 compilation.handleModuleCreation，在里面通过不断的回调，执行了以下几步：
   1. compilation.factorizeModule 系列：处理模块并对模块进行创建，并且添加到 factorizeQueue 队列
   2. compilation.addModule 系列：添加 module 模块
   3. compilation.buildModule 系列：准备编译



简单的流程图：

![](/imgs/img3.png)



## 进行模块编译构建(build)

### 1、从 compilation.buildModule 开始

模块的构建从 compilation.buildModule 开始

```js
class Compilation {
    conscructor() {
		this.buildQueue = new AsyncQueue({
			name: "build",
			parent: this.factorizeQueue,
			// processor：处理方法，调用 this._buildModule
			processor: this._buildModule.bind(this)
		});
    }
    
    handleModuleCreation(
		{factory, dependencies, originModule, contextInfo, context, recursive = true},
		callback
    )
    {
        this.factorizeModule(
            {currentProfile,factory,dependencies,originModule,contextInfo,context},
            (err, newModule) => {

                this.addModule(newModule, (err, module) => {

                    this.buildModule(module, err => {
                        
                        /**
						 * compilation.buildModule 执行 buildQueue.add 将 module 添加到 buildQueue
						 * buildQueue 通过 new AsyncQueue 创建
						 * 
						 * buildQueue.add=>setImmediate(root._ensureProcessing)=>AsyncQueue._ensureProcessing=>AsyncQueue._startProcessing => compilation._buildModule
						 * 
						 * compilation._buildModule 里面执行 module.needBuild 判断模块需不需要构建
						 * 需要构建，执行 module.needBuild 的回调，回调里面执行 module.build 对模块进行构建
						 * this.buildModule 回调里面继续调用 compilation.processModuleDependencies
						 */
                        
                        // 15
                        this.processModuleDependencies(module, err => {
                            
                        })
                    })
                })
            }
        )
    }
    
    buildModule(module, callback) {
		this.buildQueue.add(module, callback);
	}
    _buildModule(module, callback) {
        // ...
        
        // 判断当前模块需不需要构建，需要构建就执行回调
        module.needBuild({}, (err, needBuild) => {
            // ...
            
		    // 对模块进行构建
			// 但是这里直接点进 module.build 里面，会发现里面只是抛出了一个错误
			// 其实这里是使用了多态，module.build 是类 Moudle 上的方法，同时 Module 是一个父类
			// 其他子类继承父类 Moudle，并对 build 方法进行重写
			// 所以这里的 module.build 方法其实是 NormalModule 类继承了 Module 类并对重写的 build 方法
		    module.build({}, err => {})
        })
    }
}
```

compilation.buildModule=>compilation.buildQueue.add()=>setImmediate(root._ensureProcessing)=>AsyncQueue._ensureProcessing=>AsyncQueue._startProcessing => compilation.__buildModule

可以看出最后是执行了 compilation.__buildModule，这个方法里面：

- module.needBuild：判断当前模块需不需要构建，需要构建就执行回调
- 回调中调用 module.build 对模块开始进行构建

这里注意一下，module.build点进去是：

```js
class Module extends DependenciesBlock  {
    // ...
    
    build(options, compilation, resolver, fs, callback) {
		const AbstractMethodError = require("./AbstractMethodError");
		throw new AbstractMethodError();
	}
}
```

发现，这里的 Module类的 build 就只是抛出了一个错误。其实这里用的是多态的概念， Module 只是一个父类，后面的子类可以继承 Module，并对里面的 build 方法进行改写。这里实际上执行的并不是 Module 的 build，而是它的子类 NormalModule 的 build。

可以通过光标在 Module 上，鼠标右键打开菜但，点击 find all Implementations 找到

![](/imgs/img4.png)

打开 webpack\lib\NormalModule.js 文件，可以看到：

```js
class NormalModule extends Module {
    // ...
    
    build(options, compilation, resolver, fs, callback) {
        
    }
}
```

NormalModule 类继承于 Module 类，并重写了 build

所以，实际上，module.build 就是调用的 NormalModule 类的 build 方法



### 2、模块构建 build

module.build 也就是 NormalModule 类的 build 方法：

```js
class NormalModule extends Module {
    // ...
    
    build(options, compilation, resolver, fs, callback) {
        // ...
        
        // 将 doBuild 函数执行后的返回值返回
        return this.doBuild(options, compilation, resolver, fs, err => {})
    }
}
```

NormalModule 类的 build 方法中将 doBuild 函数的结果返回。来到 doBuild 方法：

```js
const { runLoaders } = require("loader-runner");

class NormalModule extends Module {
    // ...
    
    doBuild(options, compilation, resolver, fs, callback) {
        // ...
        
        // 定义 processResult 函数，主要用来处理 runLoaders 执行后的结果
        const processResult = (err, result) => {})
        
        // doBuild 的核心：执行所有的 loader 对匹配到的模块【test: /\.js$/】进行转换
		// 转换后的结果交给 processResult 处理
		// runLoaders 来自 webpack 官方维护的 loader-runner 库
		runLoaders(
			{
				resource: this.resource, // 需要编译的模块路径
				loaders: this.loaders, // 传入 loader
				context: loaderContext,
				// processResource：需要做的进一步操作
				processResource: (loaderContext, resource, callback) => {
                    // ...
                    
                    loaderContext.addDependency(resource);
                    // 读取模块文件
                    fs.readFile(resource, callback);
				}
			},
			(err, result) => {
                // ...
				processResult(err, result.result);
			}
		);
    }
}
```

doBuild 中定义了 processResult，用来处理 runLoaders 执行后的结果

runLoaders： runLoaders 来自 webpack 官方维护的 loader-runner 库，主要用来执行 loader 对匹配到的模块进行转换，最后在回调中将转换后的结果交给 processResult 去处理

```js
class NormalModule extends Module {
    // ...
    
    doBuild(options, compilation, resolver, fs, callback) {
        // ...
        
        // 定义 processResult 函数，主要用来处理 runLoaders 执行后的结果
        const processResult = (err, result) => {
            const source = result[0];
            
            return callback();
        })

		runLoaders({}, (err, result) => {
                // ...
				processResult(err, result.result);
			}
		);
    }
}
```

processResult 做的事就是拿到 loader 转换之后的结果 `const source = result[0]`,最后调用 callback，这个 callback 是 doBuild 上的 callback

```js
class NormalModule extends Module {
    // ...
    
    build(options, compilation, resolver, fs, callback) {
        // ...
        
        // 将 doBuild 函数执行后的返回值返回
        return this.doBuild(options, compilation, resolver, fs, err => {
            // ...
            
            result = this.parser.parse(this._ast || this._source.source(), {
                current: this,
                module: this,
                compilation: compilation,
                options: options
            })
        })
    }
}
```

可以看到执行 doBuild 的 callback 中有一步是 this.parser.parse，这一步就是进行 AST 转换

这个 this.parser.parse 方法主要就是：webpack\lib\javascript\JavascriptParser.js

 中的 JavascriptParser 类的 parse 方法

```js
const { Parser: AcornParser } = require("acorn");

const parser = AcornParser;

class JavascriptParser extends Parser {
    // ...
    
    parse(source, state) {
        ast = JavascriptParser._parse(source, {
            sourceType: this.sourceType,
            onComment: comments,
            onInsertedSemicolon: pos => semicolons.add(pos)
        });
    }
    
    static _parse(code, options) {
        let ast
        ast = parser.parse(code, parserOptions)
    }
}
```

可以看出，在 parse 中继续调用 \_parse 方法生成  ast，_parse 中生成 ast 利用了 acorn 库的 Parser

问题：为什么还要进行 ast 转换？

> 因为需要分析模块代码，看看当前模块还需要依赖于哪些模块，对依赖的模块继续进行编译，这是一步递归的过程。

到此，buildModule=>_buildModule=>module.build 的工作基本完成。



接下来就回到了 compilation.processModuleDependencies 对 module 递归进行依赖收集

```js
class Compilation {
    conscructor() {
        this.processDependenciesQueue = new AsyncQueue({
			name: "processDependencies",
			parallelism: options.parallelism || 100,
			processor: this._processModuleDependencies.bind(this)
		});
    }
    
    handleModuleCreation() {
        this.factorizeModule(
            {currentProfile,factory,dependencies,originModule,contextInfo,context},
            (err, newModule) => {

                this.addModule(newModule, (err, module) => {

                    this.buildModule(module, err => {

                        this.processModuleDependencies(module, err => {
                            
                        })
                    })
                })
            }
        )
    }
    
    processModuleDependencies(module, callback) {
		this.processDependenciesQueue.add(module, callback);
	}
    _processModuleDependencies(module, callback) {
        // ...
        
        const processDependenciesBlock = block => {
			if (block.dependencies) {
				currentBlock = block;
				for (const dep of block.dependencies) processDependency(dep);
			}
			if (block.blocks) {
				for (const b of block.blocks) processDependenciesBlock(b);
			}
		};
        
        // 收集依赖
        processDependenciesBlock(module);
        
        // 循环执行 compilation.handleModuleCreation 再进行模块转换、依赖收集
        asyncLib.forEach(
			sortedDependencies,
			(item, callback) => {
				this.handleModuleCreation(item, err => {}});
			},
			err => {}
		);
    }
}
```

- 执行 compilation.processModuleDependencies(module, callback) 并且传入 buildModule 生成的 module实例；

- 执行 compilation._processModuleDependencies(module, callback)，通过 processDependenciesBlock 进行收集依赖；

- 循环执行 compilation.handleModuleCreation 再进行模块转换、依赖收集

总结就是收集依赖模块，并对依赖模块再进行相同的模块处理



到这里，make 阶段算是完结。



## 对处理完成的模块 module 封装输出

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
                    process.nextTick(() => {
                        
                        // 执行compilation的finsh方法 对modules上的错误或者警告处理
                        // finsh中会执行compilation.hooks.finishModules钩子
                        compilation.finish(err => {
                            
                            // 执行seal 对 module 代码进行封装输出
                            compilation.seal(err => {
                                
                                // 钩子 afterCompile
                                this.hooks.afterCompile.callAsync(compilation, err => {})
                            })
                        })
                    })
                })
            })
        }
    }
}
```

又回到 compiler.compile，可以看到，在 make 钩子函数完成之后：

1. 会调用 finishMake，然后执行当前 compilation 上的 finsh 方法，对生成的 modules时产生的错误或者警告进行处理。 
2. compilation.finish 回调里面继续执行 compilation.seal 对上一个阶段处理完成的 modules 进行封装输出，会生成 chunk 和 assets 等信息，根据不同的 template 生成要输出的代码



这里有几个概念，先看看：

- module：模块，就是不同的资源文件，包括 `js/css/图片` 等文件，在编译阶段，webpack 会根据个个模块的依赖关系组合生成 chunk
- moduleGraph：各个 module 之间的依赖关系，生成 chunkGraph 要用到
- chunk：由一个或者多个 module 组成
- chunkGroup：由一个或者多个 chunk 组成，生成 chunkGraph 要用到
- chunkGraph：用于储存 module、chunk、chunkGroup 三者之间的关系



回到 compilation.seal：

```js
class Compilation {
    // ...
    
    _runCodeGenerationJobs(jobs, callback) {
        // 根据 template 生成代码
        this._codeGenerationModule();
    },
    
    _codeGenerationModule() {},
    
    createChunkAssets(callback) {
        asyncLib.forEach(
			this.chunks,
            (chunk, callback) => {
                asyncLib.forEach(
                    this.chunks,
                    (chunk, callback) => {
                        // ...
                        
                        // 开始输出资源
					    this.emitAsset(file, source, assetInfo);
                    },
                    callback
                )
            },
            callback
        )
    },
    
    // 当模块解析完，就来到了 seal 阶段，对处理过的代码进行封装输出
	// 目的是将 module 生成 chunk，并封存到 compilation.assets 中
	// 在这个过程可以做各种各样的优化
    seal(callback) {
        // 生成 chunkGraph 实例
		const chunkGraph = new ChunkGraph(this.moduleGraph);
        
        // 触发 seal 钩子
		this.hooks.seal.call();
        
        // 循环 this.entries 入口文件创建 chunks
        for (const [name, { dependencies, includeDependencies, options }] of this.entries) {
            // ...
        }
        
        // 用于创建 chunkGraph、moduleGraph
		buildChunkGraph(this, chunkGraphInit);
        
        // 触发钩子 optimize，代表优化开始
		this.hooks.optimize.call();
        
        // 执行各种优化 module
		while (this.hooks.optimizeModules.call(this.modules)) {
			/* empty */
		}
		// 钩子 afterOptimizeModules，代表 module 已经优化完
		this.hooks.afterOptimizeModules.call(this.modules);
		
		// 执行各种优化 chunk
		while (this.hooks.optimizeChunks.call(this.chunks, this.chunkGroups)) {
			/* empty */
		}
		// 钩子 afterOptimizeChunks，代表 chunk 已经优化完
		this.hooks.afterOptimizeChunks.call(this.chunks, this.chunkGroups);
        
        // 优化 modules 树
        this.hooks.optimizeTree.callAsync(this.chunks, this.modules, err => {
            
            // 触发 afterOptimizeTree 钩子，代表 modules 树优化结束
			this.hooks.afterOptimizeTree.call(this.chunks, this.modules);
            
            // 对代码进行优化阶段
			this.hooks.optimizeChunkModules.callAsync(
                this.chunks,
                this.modules,
                err => {
                    // 触发一系列各种优化的钩子，省略代码
                    
                    // 生成 module 的 hash
					this.createModuleHashes();
                    
                    //  调用 codeGeneration 方法用于生成编译好的代码
                    this.codeGeneration(err => {
                        // 执行代码生成的方法 _runCodeGenerationJobs
						// _runCodeGenerationJobs 中会执行 this._codeGenerationModule，这个方法会根据 tempalte 生成代码 
                        this._runCodeGenerationJobs(codeGenerationJobs, err => {
                            // ...
                            
                            // 创建 moduleAssets 资源
							this.createModuleAssets();
                            
                            // 创建 chunkAssets 资源
                            // createChunkAssets 里面会调用 compilation.emitAsset 开始输出
                            this.createChunkAssets(err => {});
                        })
                    })
                }
            )
        })
    }
}
```

总结一下 compilation.seal 的主要流程：

1. 循环 this.entries 入口文件创建 chunks
2. 执行各种优化 module、chunk、module tree
3. 调用 compilation.codeGeneration 方法用于生成编译好的代码
4. 执行代码生成的方法 compilation.\_runCodeGenerationJobs
   - \_runCodeGenerationJobs 中会执行 compilation._codeGenerationModule，这个方法会根据 tempalte 生成代码
5. 执行 compilation.createChunkAssets 创建 chunkAssets 资源，createChunkAssets 里面会调用 compilation.emitAsset 将生成的代码放到 compilation.assets 中，然后一路回调，最后的回调就是用的createChunkAssets(callback) 中的 callback，然后一路找回调，会发现最后调用的回调是 compilation.seal(callback)这里的，而 compilation.seal 在 compiler.compile 中被调用，此时，又回到了 compiler

```js
class Compiler {
    compile(callback) {
        compilation.seal(err => {
            this.hooks.afterCompile.callAsync(compilation, err => {
                // ...
                return callback(null, compilation);
            })
        })
    }
}
```

继续找回调，发现 compilation.seal 被  compiler.compile 调用时又使用了 compiler.compile 的 callback，再看看 compiler.compile 被调用的情况：

```js
class Compiler {
    run(callback) {
        / 定义了一个 onCompiled 函数，主要是传给 this.compile 作为执行的回调函数
        const onCompiled = (err, compilation) => {
            process.nextTick(() => {
                this.emitAssets(compilation, err => {
                    this.emitRecords(err => {})
                })
            })
        })
        
        const run = () => {
            this.compile(onCompiled);
        }
        
        run();
    }
}
```

终于找到，compiler.compile 调用的时候传入了 onCompiled 作为回调，onCompiled  中调用 compiler.emitAssets 和 compiler.emitRecords 对资源做输出。



到此，webpack 源码主体流程基本完成



## 总结





## 附录

参考的一些优秀文章：

[[万字总结] 一文吃透 Webpack 核心原理](https://juejin.cn/post/6949040393165996040)

[webpack编译流程详解](https://juejin.cn/post/6948950633814687758)

[webpack执行过程](https://www.cnblogs.com/pluslius/p/10271537.html)

[webpack构建流程分析](https://juejin.cn/post/6844904000169607175)

[【webpack进阶】你真的掌握了loader么？- loader十问](https://juejin.cn/post/6844903693070909447)

[webpack核心模块tapable用法解析](https://juejin.cn/post/6939794845053485093)

[Webpack 基石 tapable 揭秘](https://juejin.cn/post/6937829048332746788)



一些 webpack4 的流程图

![](/imgs/img5.png)



![](/imgs/img6.jpg)

