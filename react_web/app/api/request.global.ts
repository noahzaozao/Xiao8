/**
 * 全局 Request 初始化脚本
 * 用于在静态 HTML 中独立使用，打包成 request.global.js
 */

import { createRequestClient, WebTokenStorage } from '@project_neko/request';
import {
  getApiBaseUrl,
  getStaticServerUrl,
  buildApiUrl,
  buildStaticUrl,
  buildWebSocketUrl,
} from './config';

/**
 * 创建并初始化全局 request 实例
 */
function initRequest() {
  if (typeof window === 'undefined') {
    console.warn('[Request] 非浏览器环境，跳过初始化');
    return;
  }

  const baseURL = getApiBaseUrl();

  // 创建 request 实例
  const request = createRequestClient({
    baseURL,
    storage: new WebTokenStorage(),
    refreshApi: async (refreshToken: string) => {
      const refreshUrl = `${baseURL.replace(/\/$/, '')}/api/auth/refresh`;
      const res = await fetch(refreshUrl, {
        method: 'POST',
        body: JSON.stringify({ refreshToken }),
        headers: { 'Content-Type': 'application/json' },
      }).then(r => r.json());

      return {
        accessToken: res.access_token,
        refreshToken: res.refresh_token,
      };
    },
    timeout: 15000,
    returnDataOnly: true,
    errorHandler: async (error: any) => {
      if (error.response?.status === 403) {
        console.warn('[Request] Access forbidden, redirecting to login...');
      }
    },
  });

  // 暴露到全局
  const win = window as any;
  win.request = request;
  win.buildApiUrl = buildApiUrl;
  win.buildStaticUrl = buildStaticUrl;
  win.buildWebSocketUrl = buildWebSocketUrl;
  win.API_BASE_URL = baseURL;
  win.STATIC_SERVER_URL = getStaticServerUrl();

  console.log('[Request] request 实例和工具函数已暴露到全局');
}

// 自动初始化
if (typeof window !== 'undefined') {
  // 如果 DOM 已加载，立即初始化
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initRequest);
  } else {
    initRequest();
  }
}

// 导出供外部使用（如果需要）
export { initRequest, buildApiUrl, buildStaticUrl, buildWebSocketUrl };

