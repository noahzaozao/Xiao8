import { defineConfig } from "vite";
import { resolve } from "path";
import { readFileSync, writeFileSync, existsSync } from "fs";
import type { Plugin } from "vite";

// 读取 package.json 获取版本信息
const packageJson = JSON.parse(
  readFileSync(resolve(__dirname, "package.json"), "utf-8")
);
const reactVersion = packageJson.dependencies.react || "^19.1.1";

// 插件：处理 process.env 引用
function replaceProcessEnv(): Plugin {
  return {
    name: "replace-process-env",
    generateBundle(options, bundle) {
      for (const fileName in bundle) {
        const chunk = bundle[fileName];
        if (chunk.type === "chunk" && chunk.code) {
          // 替换 process.env.NODE_ENV
          chunk.code = chunk.code.replace(
            /process\.env\.NODE_ENV/g,
            '"production"'
          );
          // 替换 process.env 的其他引用
          chunk.code = chunk.code.replace(
            /process\.env(?!\.)/g,
            '({ NODE_ENV: "production" })'
          );
        }
      }
    },
    writeBundle(options) {
      // 在文件写入后，再次处理 process.env（处理可能遗漏的情况）
      const outDir = options.dir || "build/react-bundles";
      const jsFile = resolve(outDir, "react.js");
      if (existsSync(jsFile)) {
        let content = readFileSync(jsFile, "utf-8");
        // 替换 process.env.NODE_ENV
        content = content.replace(/process\.env\.NODE_ENV/g, '"production"');
        // 替换 process.env 的其他引用
        content = content.replace(/process\.env(?!\.)/g, '({ NODE_ENV: "production" })');
        // 替换 process 相关的条件检查（在浏览器中不需要）
        // 先替换 process.emit，匹配整个函数调用（包括参数和闭括号）
        content = content.replace(/process\.emit\([^)]*\)/g, 'void 0 /* process.emit removed for browser */');
        // 替换 typeof process 检查（确保不会匹配到 process.emit）
        content = content.replace(/"object"\s*===\s*typeof\s+process/g, '"object" === typeof undefined /* process removed for browser */');
        content = content.replace(/"function"\s*===\s*typeof\s+process\.emit/g, '"function" === typeof undefined /* process.emit removed for browser */');
        
        // 修复：确保所有 hooks 从 __CLIENT_INTERNALS 获取 ReactSharedInternals
        // 这样 ReactDOM 设置的 H 可以被 React 的 hooks 使用
        // 在文件开头添加一个临时的 hooks dispatcher，用于在 ReactDOM 初始化之前
        const tempDispatcherCode = `
// 临时 hooks dispatcher，用于在 ReactDOM 初始化之前
var __tempHooksDispatcher = null;
function getHooksDispatcher() {
  var internals = react_production.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
  if (internals.H) return internals.H;
  // 如果 ReactDOM 还没有初始化，创建一个临时的 dispatcher
  if (!__tempHooksDispatcher) {
    __tempHooksDispatcher = {
      useState: function(initialState) {
        console.warn('[React] useState called before ReactDOM initialization, using temporary implementation');
        var state = typeof initialState === 'function' ? initialState() : initialState;
        // 创建一个可以工作的 setState，在 ReactDOM 初始化后会自动切换到真正的实现
        return [state, function(newState) {
          console.warn('[React] setState called before ReactDOM initialization, state update will be ignored');
          // 注意：这个 setState 不会真正更新状态，但至少不会崩溃
          // 当 ReactDOM 初始化后，组件会重新渲染，使用真正的 hooks dispatcher
        }];
      },
      useEffect: function() { return function() {}; },
      useCallback: function(fn) { return fn; },
      useMemo: function(fn) { return fn(); },
      useRef: function(initialValue) { return { current: initialValue }; },
      useContext: function() { return null; },
      useReducer: function() { return [null, function() {}]; },
      useLayoutEffect: function() { return function() {}; },
      useImperativeHandle: function() {},
      useId: function() { return ''; },
      useSyncExternalStore: function() { return null; },
      useInsertionEffect: function() { return function() {}; },
      useTransition: function() { return [false, function() {}]; },
      useDeferredValue: function(value) { return value; },
      useActionState: function() { return [null, function() {}]; },
      useOptimistic: function() { return null; },
      use: function() { return null; },
      cache: function(fn) { return fn; },
      useMemoCache: function(size) {
        console.warn('[React] useMemoCache called before ReactDOM initialization, using temporary implementation');
        // 返回一个指定大小的数组，每个元素初始化为 undefined
        // 这是一个安全的 no-op 实现，在 ReactDOM 初始化后会切换到真正的实现
        var cache = [];
        for (var i = 0; i < size; i++) {
          cache[i] = undefined;
        }
        return cache;
      }
    };
  }
  return __tempHooksDispatcher;
}
`;
        
        // 在 react_production 定义之后插入临时 dispatcher
        content = content.replace(
          /(var react_production = \{\};)/,
          `$1${tempDispatcherCode}`
        );
        
        // 修复所有 hooks，使其使用 getHooksDispatcher()
        const hookNames = ['useState', 'useEffect', 'useCallback', 'useMemo', 'useRef', 'useContext', 'useReducer', 'useLayoutEffect', 'useImperativeHandle', 'useId', 'useSyncExternalStore', 'useInsertionEffect', 'useTransition', 'useDeferredValue', 'useActionState', 'useOptimistic', 'use', 'cache', 'useMemoCache'];
        
        for (const hookName of hookNames) {
          // 匹配 react_production.hookName = function(...) { return ReactSharedInternals.H.hookName(...); }
          const pattern = new RegExp(
            `react_production\\.${hookName}\\s*=\\s*function\\s*\\([^)]*\\)\\s*\\{[^}]*return\\s+ReactSharedInternals\\.H\\.${hookName}\\([^)]*\\)[^}]*\\}`,
            'g'
          );
          content = content.replace(
            pattern,
            `react_production.${hookName} = function(...args) { var dispatcher = getHooksDispatcher(); return dispatcher.${hookName}(...args); }`
          );
          
          // 也处理多行格式
          const multilinePattern = new RegExp(
            `react_production\\.${hookName}\\s*=\\s*function\\s*\\([^)]*\\)\\s*\\{[\\s\\S]*?return\\s+ReactSharedInternals\\.H\\.${hookName}\\([^)]*\\)[\\s\\S]*?\\}`,
            'g'
          );
          content = content.replace(
            multilinePattern,
            `react_production.${hookName} = function(...args) { var dispatcher = getHooksDispatcher(); return dispatcher.${hookName}(...args); }`
          );
        }
        
        // 处理其他使用 ReactSharedInternals.H 的地方
        content = content.replace(
          /ReactSharedInternals\.H\.(\w+)/g,
          'getHooksDispatcher().$1'
        );
        
        // 修复 __COMPILER_RUNTIME.c 调用，添加安全检查
        content = content.replace(
          /react_production\.__COMPILER_RUNTIME\s*=\s*\{[^}]*c:\s*function\s*\(size\)\s*\{[^}]*return\s+getHooksDispatcher\(\)\.useMemoCache\(size\);[^}]*\}/s,
          `react_production.__COMPILER_RUNTIME = {
    __proto__: null,
    c: function(size) {
      var d = getHooksDispatcher();
      return typeof d.useMemoCache === 'function' ? d.useMemoCache(size) : (function() {
        console.warn('[React] useMemoCache not available, returning empty array');
        var cache = [];
        for (var i = 0; i < size; i++) {
          cache[i] = undefined;
        }
        return cache;
      }());
    }
  }`
        );
        
        writeFileSync(jsFile, content, "utf-8");
      }
    },
  };
}

export default defineConfig({
  define: {
    "process.env.NODE_ENV": '"production"',
  },
  plugins: [replaceProcessEnv()],
  build: {
    lib: {
      entry: resolve(__dirname, "app/react-bundles/react.ts"),
      name: "React",
      formats: ["es"],
      fileName: () => "react.js",
    },
    rollupOptions: {
      output: {
        format: "es",
        exports: "named",
        banner: `/* React ${reactVersion} - Bundled locally at build time */\n`,
      },
    },
    outDir: "build/react-bundles",
    emptyOutDir: false,
    minify: false,
  },
});

