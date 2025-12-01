/**
 * HTML/JS 页面通用的轻量初始化工具
 *
 * 目标：
 * - 只服务于传统 HTML/JS，不侵入 React 代码
 * - 封装常用的等待/检测工具，避免在每个页面重复实现
 *
 * 构建后输出：static/bundles/react_init.js
 */

declare global {
  interface Window {
    ReactInit?: {
      waitForRequestInit: (maxWait?: number) => Promise<void>;
      checkRequestAvailable: () => void;
    };
  }
}

/**
 * 等待 request.global.js 初始化完成
 * 在需要使用 window.request / window.buildApiUrl 之前调用
 */
export async function waitForRequestInit(maxWait = 5000): Promise<void> {
  // 如果已经初始化，直接返回
  if (typeof window !== 'undefined' && (window as any).request || (window as any).buildApiUrl) {
    return;
  }

  const startTime = Date.now();

  while (typeof window !== 'undefined' && !(window as any).request && !(window as any).buildApiUrl) {
    if (Date.now() - startTime > maxWait) {
      console.warn(`等待 request.global.js 初始化超时（${maxWait}ms），继续执行`);
      break;
    }
    await new Promise(resolve => setTimeout(resolve, 50));
  }

  if (typeof window !== 'undefined' && ((window as any).request || (window as any).buildApiUrl)) {
    console.log('request.global.js 初始化完成');
  }
}

/**
 * 检查 request 相关全局对象是否已初始化
 * 主要用于调试 / 自检
 */
export function checkRequestAvailable(): void {
  if (typeof window === 'undefined') {
    console.warn('checkRequestAvailable 仅在浏览器环境中有效');
    return;
  }

  const win = window as any;

  if (win.request) {
    console.log('✓ window.request 可用');
  } else {
    console.warn('✗ window.request 不可用');
  }

  if (win.buildApiUrl) {
    console.log('✓ window.buildApiUrl 可用');
  } else {
    console.warn('✗ window.buildApiUrl 不可用');
  }

  if (win.buildStaticUrl) {
    console.log('✓ window.buildStaticUrl 可用');
  } else {
    console.warn('✗ window.buildStaticUrl 不可用');
  }

  if (win.buildWebSocketUrl) {
    console.log('✓ window.buildWebSocketUrl 可用');
  } else {
    console.warn('✗ window.buildWebSocketUrl 不可用');
  }

  if (win.API_BASE_URL) {
    console.log('✓ window.API_BASE_URL:', win.API_BASE_URL);
  } else {
    console.warn('✗ window.API_BASE_URL 不可用');
  }
}

/**
 * 挂载到 window.ReactInit，供 HTML/JS 直接访问
 */
if (typeof window !== 'undefined') {
  const win = window as any;

  // 模块加载时的初始化日志，方便在控制台确认 react_init 是否已生效
  if (!win.ReactInit) {
    console.log('[ReactInit] 初始化全局工具对象...');
  } else {
    console.log('[ReactInit] 复用已有的全局工具对象');
  }

  if (!win.ReactInit) {
    win.ReactInit = {} as any;
  }
  win.ReactInit.waitForRequestInit = waitForRequestInit;
  win.ReactInit.checkRequestAvailable = checkRequestAvailable;
}
