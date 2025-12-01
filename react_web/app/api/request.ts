/**
 * 请求客户端配置
 * 使用 @project_neko/request 包提供的统一请求库
 */

import { createRequestClient, WebTokenStorage } from '@project_neko/request';
import { getApiBaseUrl, buildApiUrl, buildStaticUrl, buildWebSocketUrl } from './config';

/**
 * 创建并导出请求客户端实例
 */
export const request = createRequestClient({
  baseURL: getApiBaseUrl(),
  storage: new WebTokenStorage(),
  refreshApi: async (refreshToken: string) => {
    const baseURL = getApiBaseUrl();
    const refreshUrl = `${baseURL.replace(/\/$/, "")}/api/auth/refresh`;
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
  // 可选配置
  timeout: 15000,
  returnDataOnly: true,
  // 自定义错误处理
  errorHandler: async (error) => {
    // 可以在这里进行错误上报或统一处理
    if (error.response?.status === 403) {
      // 处理 403 错误，例如跳转到登录页
      console.warn('Access forbidden, redirecting to login...');
    }
  },
});

// 导出类型
export type { RequestClientConfig, TokenStorage, TokenRefreshFn } from '@project_neko/request';

// 导出配置工具函数（从 config.ts 重新导出）
export { buildApiUrl, buildStaticUrl, buildWebSocketUrl };

/**
 * 将 request 实例和相关工具函数暴露到全局，供外部 JS 文件使用
 * 在 main.tsx 中调用此函数来初始化全局 API
 */
export function exposeRequestToGlobal(): void {
  if (typeof window !== 'undefined') {
    const win = window as any;
    
    // 暴露 request 实例
    win.request = request;
    
    // 暴露工具函数
    win.buildApiUrl = buildApiUrl;
    win.buildStaticUrl = buildStaticUrl;
    win.buildWebSocketUrl = buildWebSocketUrl;
    
    // 暴露配置（向后兼容）
    win.API_BASE_URL = getApiBaseUrl();
    win.STATIC_SERVER_URL = getStaticServerUrl();
    
    console.log('[Request] request 实例和工具函数已暴露到全局');
  }
}

