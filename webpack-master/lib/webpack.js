/*
	MIT License http://www.opensource.org/licenses/mit-license.php
	Author Tobias Koppers @sokra
*/

"use strict";

const util = require("util");
const webpackOptionsSchema = require("../schemas/WebpackOptions.json");
const Compiler = require("./Compiler");
const MultiCompiler = require("./MultiCompiler");
const WebpackOptionsApply = require("./WebpackOptionsApply");
const {
	applyWebpackOptionsDefaults,
	applyWebpackOptionsBaseDefaults
} = require("./config/defaults");
const { getNormalizedWebpackOptions } = require("./config/normalization");
const NodeEnvironmentPlugin = require("./node/NodeEnvironmentPlugin");
const validateSchema = require("./validateSchema");

/** @typedef {import("../declarations/WebpackOptions").WebpackOptions} WebpackOptions */
/** @typedef {import("./Compiler").WatchOptions} WatchOptions */
/** @typedef {import("./MultiCompiler").MultiCompilerOptions} MultiCompilerOptions */
/** @typedef {import("./MultiStats")} MultiStats */
/** @typedef {import("./Stats")} Stats */

/**
 * @template T
 * @callback Callback
 * @param {Error=} err
 * @param {T=} stats
 * @returns {void}
 */

/**
 * @param {WebpackOptions[]} childOptions options array
 * @param {MultiCompilerOptions} options options
 * @returns {MultiCompiler} a multi-compiler
 */
const createMultiCompiler = (childOptions, options) => {
	const compilers = childOptions.map(options => createCompiler(options));
	const compiler = new MultiCompiler(compilers, options);
	for (const childCompiler of compilers) {
		if (childCompiler.options.dependencies) {
			compiler.setDependencies(
				childCompiler,
				childCompiler.options.dependencies
			);
		}
	}
	return compiler;
};

/**
 * @param {WebpackOptions} rawOptions options object
 * @returns {Compiler} a compiler
 */
// 创建 compiler
const createCompiler = rawOptions => {
	// 格式化、初始化传进来的参数（如 output、devserver、plugin 给赋值一些默认的配置格式，防止后面使用时报错）
	const options = getNormalizedWebpackOptions(rawOptions);
	applyWebpackOptionsBaseDefaults(options);

	// 通过 new Compiler 得到一个 compiler 对象
	const compiler = new Compiler(options.context);
	// 将 options（经过格式化后的 webpack.config.js ）挂载到 compiler 上
	compiler.options = options;

	// 把 NodeEnvironmentPlugin 插件挂载到compiler实例上
	// NodeEnvironmentPlugin 插件主要是文件系统挂载到compiler对象上
	// 如 infrastructureLogger(log插件)、inputFileSystem(文件输入插件)、outputFileSystem(文件输出插件)、watchFileSystem(监听文件输入插件)
	new NodeEnvironmentPlugin({
		infrastructureLogging: options.infrastructureLogging
	}).apply(compiler);

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
	applyWebpackOptionsDefaults(options);

	// 调用 compiler 身上的两个钩子 environment、afterEnvironment
	compiler.hooks.environment.call();
	compiler.hooks.afterEnvironment.call();

	// WebpackOptionsApply().process 主要用来处理 config 文件中除了 plugins 的其他属性
	// 这个东西非常重要，会将配置的一些属性转换成插件注入到 webpack 中 
	// 例如：入口 entry 就被转换成了插件注入到 webpack 中 
	new WebpackOptionsApply().process(options, compiler);
	// 调用 initialize 钩子
	compiler.hooks.initialize.call();
	// 返回 compiler
	return compiler;
};

/**
 * @callback WebpackFunctionSingle
 * @param {WebpackOptions} options options object
 * @param {Callback<Stats>=} callback callback
 * @returns {Compiler} the compiler object
 */

/**
 * @callback WebpackFunctionMulti
 * @param {WebpackOptions[] & MultiCompilerOptions} options options objects
 * @param {Callback<MultiStats>=} callback callback
 * @returns {MultiCompiler} the multi compiler object
 */

const webpack = /** @type {WebpackFunctionSingle & WebpackFunctionMulti} */ (
	/**
	 * @param {WebpackOptions | (WebpackOptions[] & MultiCompilerOptions)} options options
	 * @param {Callback<Stats> & Callback<MultiStats>=} callback callback
	 * @returns {Compiler | MultiCompiler}
	 */
	(options, callback) => {
		const create = () => {
			// 检验传入的配置文件【webpack.config.js】是否符合 webpack 内部定义的 webpackOptionsSchema 范式
			validateSchema(webpackOptionsSchema, options);
			/** @type {MultiCompiler|Compiler} */

			// 1.定义 compiler、watch、watchOptions
			let compiler;
			let watch = false;
			/** @type {WatchOptions|WatchOptions[]} */
			let watchOptions;

			// 如果传入的 webpack.config.js 中的配置是数组，一般很少，对象跟函数居多
			if (Array.isArray(options)) {
				/** @type {MultiCompiler} */
				compiler = createMultiCompiler(options, options);
				watch = options.some(options => options.watch);
				watchOptions = options.map(options => options.watchOptions || {});
			} else {
				/** @type {Compiler} */
				// 2.通过 createCompiler 创建一个 compiler
				compiler = createCompiler(options);
				// 拿到 webpack.config.js 中的 watch、watchOptions
				watch = options.watch;
				watchOptions = options.watchOptions || {};
			}

			// 返回 compiler, watch, watchOptions
			return { compiler, watch, watchOptions };
		};
		
		/**
		 * 判断在执行 webpack 函数的时候，有没有传入 callback 回调函数
		 * 无论有没有传入回调函数，结果都是会返回一个 compiler 对象
		 * 差别是：传入了 callback，会调用 compiler.run，没有传入，需要在使用 webpack 拿到 compiler 之后手动调用 compiler.run
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
				process.nextTick(() => callback(err));
				return null;
			}
		} else {
			// 执行 webpack 的时候没有传入回调函数

			// 执行 create 函数，拿到 compiler, watch
			const { compiler, watch } = create();
			if (watch) {
				util.deprecate(
					() => {},
					"A 'callback' argument need to be provided to the 'webpack(options, callback)' function when the 'watch' option is set. There is no way to handle the 'watch' option without a callback.",
					"DEP_WEBPACK_WATCH_WITHOUT_CALLBACK"
				)();
			}
			return compiler;
		}
	}
);

module.exports = webpack;
