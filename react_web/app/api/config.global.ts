/**
 * 全局配置管理模块
 * 用于 HTML/JS 环境，构建为 config.global.js
 * 自动暴露到 window 对象
 */

import {
  getApiBaseUrl,
  getStaticServerUrl,
  buildApiUrl,
  buildStaticUrl,
  buildWebSocketUrl,
} from './config';

/**
 * 初始化并暴露配置函数到全局
 */
function initConfig() {
  if (typeof window === 'undefined') {
    console.warn('[Config] 非浏览器环境，跳过初始化');
    return;
  }

  const win = window as any;

  // 暴露配置获取函数
  win.getApiBaseUrl = getApiBaseUrl;
  win.getStaticServerUrl = getStaticServerUrl;
  win.buildApiUrl = buildApiUrl;
  win.buildStaticUrl = buildStaticUrl;
  win.buildWebSocketUrl = buildWebSocketUrl;

  // 暴露当前配置值（向后兼容）
  win.API_BASE_URL = getApiBaseUrl();
  win.STATIC_SERVER_URL = getStaticServerUrl();

  console.log('[Config] 配置管理模块已初始化', {
    API_BASE_URL: win.API_BASE_URL,
    STATIC_SERVER_URL: win.STATIC_SERVER_URL,
  });
}

// 自动初始化
if (typeof window !== 'undefined') {
  // 如果 DOM 已加载，立即初始化
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initConfig);
  } else {
    initConfig();
  }
}

// 导出供外部使用（如果需要）
export {
  getApiBaseUrl,
  getStaticServerUrl,
  buildApiUrl,
  buildStaticUrl,
  buildWebSocketUrl,
};

