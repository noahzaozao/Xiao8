/**
 * 请求客户端配置（React / TypeScript 专用）
 * 
 * 约定：
 * - 仅在 React 代码中通过 `import { request } from '~/api/request'` 使用
 * - 不做任何 window 挂载、全局暴露等操作
 * - 所有「全局 JS」相关逻辑统一放在 `request.global.ts` / `react_init.ts` 中
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

// 导出类型（React 代码可以按需引用）
export type { RequestClientConfig, TokenStorage, TokenRefreshFn } from '@project_neko/request';

// 导出配置工具函数（从 config.ts 重新导出），供 React 端直接使用
export { buildApiUrl, buildStaticUrl, buildWebSocketUrl };

