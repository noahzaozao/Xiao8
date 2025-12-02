/**
 * 首页 API 封装模块 - 全局版本（HTML 专用）
 * 
 * 用于在静态 HTML 中独立使用，打包成 request.api.global.js
 * 此版本使用 window.request，专为 HTML 环境设计
 * 
 * 构建后输出：static/bundles/request.api.global.js
 * 
 * 使用方式：
 * ```html
 * <script src="/static/bundles/request.global.js"></script>
 * <script src="/static/bundles/request.api.global.js"></script>
 * <script>
 *   // 使用全局 API（使用 window.request）
 *   window.RequestAPI.getPageConfig().then(config => {
 *     console.log('页面配置:', config);
 *   });
 * </script>
 * ```
 */

// 类型定义（与 request.api.ts 保持一致）
interface PageConfigResponse {
  success: boolean;
  lanlan_name?: string;
  model_path?: string;
  error?: string;
}

interface CharactersResponse {
  当前猫娘: string;
  猫娘: Record<string, {
    live2d?: string;
    [key: string]: any;
  }>;
  [key: string]: any;
}

interface Live2DModel {
  name: string;
  path: string;
  [key: string]: any;
}

/**
 * 获取 window.request 实例（HTML 环境专用）
 */
function getRequestInstance(): any {
  if (typeof window === 'undefined') {
    console.warn('[RequestAPI] 非浏览器环境');
    return null;
  }

  const win = window as any;
  if (!win.request) {
    console.warn('[RequestAPI] window.request 未初始化，请确保已加载 request.global.js');
    return null;
  }

  return win.request;
}

/**
 * 获取页面配置
 */
async function getPageConfig(lanlanName?: string): Promise<PageConfigResponse> {
  const request = getRequestInstance();
  if (!request) {
    throw new Error('request 实例未初始化，请确保已加载 request.global.js');
  }

  try {
    const apiPath = lanlanName
      ? `/api/config/page_config?lanlan_name=${encodeURIComponent(lanlanName)}`
      : '/api/config/page_config';
    
    const data = await request.get(apiPath);
    
    if (data && data.success) {
      return data;
    } else {
      throw new Error(data?.error || '获取页面配置失败');
    }
  } catch (error: any) {
    console.error('[getPageConfig] 获取页面配置失败:', error);
    throw error;
  }
}

/**
 * 获取角色配置
 */
async function getCharacters(): Promise<CharactersResponse> {
  const request = getRequestInstance();
  if (!request) {
    throw new Error('request 实例未初始化，请确保已加载 request.global.js');
  }

  try {
    const data = await request.get('/api/characters');
    return data;
  } catch (error: any) {
    console.error('[getCharacters] 获取角色配置失败:', error);
    throw error;
  }
}

/**
 * 获取所有可用的 Live2D 模型列表
 */
async function getLive2DModels(): Promise<Live2DModel[]> {
  const request = getRequestInstance();
  if (!request) {
    throw new Error('request 实例未初始化，请确保已加载 request.global.js');
  }

  try {
    const data = await request.get('/api/live2d/models');
    return Array.isArray(data) ? data : [];
  } catch (error: any) {
    console.error('[getLive2DModels] 获取 Live2D 模型列表失败:', error);
    throw error;
  }
}

/**
 * 根据模型名称查找对应的模型路径
 */
async function findLive2DModelByName(modelName: string): Promise<Live2DModel | null> {
  try {
    const models = await getLive2DModels();
    const model = models.find(m => m.name === modelName);
    return model || null;
  } catch (error) {
    console.error('[findLive2DModelByName] 查找模型失败:', error);
    return null;
  }
}

/**
 * 发送关闭信号（Beacon）
 */
async function sendShutdownBeacon(useBeacon: boolean = true): Promise<boolean> {
  const request = getRequestInstance();
  
  const payload = {
    timestamp: Date.now(),
    action: 'shutdown',
  };

  try {
    // 优先使用 navigator.sendBeacon
    if (useBeacon && typeof navigator !== 'undefined' && navigator.sendBeacon) {
      const success = navigator.sendBeacon(
        '/api/beacon/shutdown',
        JSON.stringify(payload)
      );
      
      if (success) {
        console.log('[sendShutdownBeacon] Beacon 信号已发送');
        return true;
      } else {
        console.warn('[sendShutdownBeacon] Beacon 发送失败，尝试使用 request');
      }
    }

    // 备用方案：使用 request.post
    if (request) {
      await request.post('/api/beacon/shutdown', payload);
      console.log('[sendShutdownBeacon] 使用 request 发送关闭信号成功');
      return true;
    } else {
      // 最后的备用方案：使用 fetch
      const response = await fetch('/api/beacon/shutdown', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        keepalive: true,
      });
      
      if (response.ok) {
        console.log('[sendShutdownBeacon] 使用 fetch 发送关闭信号成功');
        return true;
      } else {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
    }
  } catch (error: any) {
    console.error('[sendShutdownBeacon] 发送关闭信号失败:', error);
    return false;
  }
}

/**
 * 获取当前猫娘的配置
 */
async function getCurrentCatgirlConfig(lanlanName?: string): Promise<{
  name: string;
  live2d?: string;
  [key: string]: any;
} | null> {
  try {
    const characters = await getCharacters();
    const targetName = lanlanName || characters['当前猫娘'];
    
    if (!targetName) {
      console.warn('[getCurrentCatgirlConfig] 未找到当前猫娘名称');
      return null;
    }

    const catgirlConfig = characters['猫娘']?.[targetName];
    
    if (!catgirlConfig) {
      console.warn(`[getCurrentCatgirlConfig] 未找到角色 ${targetName} 的配置`);
      return null;
    }

    return {
      name: targetName,
      ...catgirlConfig,
    };
  } catch (error) {
    console.error('[getCurrentCatgirlConfig] 获取猫娘配置失败:', error);
    return null;
  }
}

/**
 * 检查模型是否需要重新加载
 */
async function shouldReloadModel(
  currentModelPath: string,
  newModelName: string
): Promise<boolean> {
  try {
    const modelInfo = await findLive2DModelByName(newModelName);
    
    if (!modelInfo) {
      console.warn(`[shouldReloadModel] 未找到模型 ${newModelName}`);
      return false;
    }

    const newModelPath = modelInfo.path;
    
    if (!currentModelPath) {
      return true;
    }

    const currentModelDir = currentModelPath.split('/').filter(Boolean).pop() || '';
    const newModelDir = newModelPath.split('/').filter(Boolean).pop() || '';
    
    return !newModelPath.includes(currentModelDir) && currentModelDir !== newModelDir;
  } catch (error) {
    console.error('[shouldReloadModel] 检查模型是否需要重新加载失败:', error);
    return false;
  }
}

/**
 * 获取 Live2D 模型的情绪映射配置
 */
async function getEmotionMapping(modelName: string): Promise<{
  success: boolean;
  config?: {
    motions?: Record<string, string[]>;
    expressions?: Record<string, string[]>;
  };
} | null> {
  const request = getRequestInstance();
  if (!request) {
    console.warn('[getEmotionMapping] request 实例未初始化');
    return null;
  }

  try {
    if (!modelName) {
      console.warn('[getEmotionMapping] 模型名称为空');
      return null;
    }

    const data = await request.get(`/api/live2d/emotion_mapping/${encodeURIComponent(modelName)}`);
    
    if (data && data.success && data.config) {
      return data;
    } else {
      console.warn('[getEmotionMapping] 获取情绪映射失败:', data);
      return null;
    }
  } catch (error: any) {
    console.error('[getEmotionMapping] 获取情绪映射失败:', error);
    return null;
  }
}

/**
 * 解锁 Steam 成就
 */
async function unlockSteamAchievement(achievementId: string): Promise<boolean> {
  const request = getRequestInstance();
  if (!request) {
    console.warn('[unlockSteamAchievement] request 实例未初始化');
    return false;
  }

  try {
    const result = await request.post(`/api/steam/set-achievement-status/${achievementId}`, {});
    return result?.success === true;
  } catch (error: any) {
    console.error('[unlockSteamAchievement] 解锁成就失败:', error);
    return false;
  }
}

/**
 * 保存麦克风选择
 */
async function setMicrophone(microphoneId: string | null): Promise<boolean> {
  const request = getRequestInstance();
  if (!request) {
    console.warn('[setMicrophone] request 实例未初始化');
    return false;
  }

  try {
    const result = await request.post('/api/characters/set_microphone', {
      microphone_id: microphoneId
    });
    return result?.success !== false;
  } catch (error: any) {
    console.error('[setMicrophone] 保存麦克风选择失败:', error);
    return false;
  }
}

/**
 * 获取麦克风选择
 */
async function getMicrophone(): Promise<string | null> {
  const request = getRequestInstance();
  if (!request) {
    console.warn('[getMicrophone] request 实例未初始化');
    return null;
  }

  try {
    const data = await request.get('/api/characters/get_microphone');
    return data?.microphone_id || null;
  } catch (error: any) {
    console.error('[getMicrophone] 获取麦克风选择失败:', error);
    return null;
  }
}

/**
 * 情感分析
 */
async function analyzeEmotion(text: string, lanlanName: string): Promise<any | null> {
  const request = getRequestInstance();
  if (!request) {
    console.warn('[analyzeEmotion] request 实例未初始化');
    return null;
  }

  try {
    const data = await request.post('/api/emotion/analysis', {
      text: text,
      lanlan_name: lanlanName
    });
    
    if (data?.error) {
      console.warn('[analyzeEmotion] 情感分析错误:', data.error);
      return null;
    }
    
    return data;
  } catch (error: any) {
    console.error('[analyzeEmotion] 情感分析失败:', error);
    return null;
  }
}

/**
 * 获取当前猫娘的 Live2D 模型信息
 */
async function getCurrentLive2DModel(catgirlName: string): Promise<any | null> {
  const request = getRequestInstance();
  if (!request) {
    console.warn('[getCurrentLive2DModel] request 实例未初始化');
    return null;
  }

  try {
    const data = await request.get(`/api/characters/current_live2d_model?catgirl_name=${encodeURIComponent(catgirlName)}`);
    return data;
  } catch (error: any) {
    console.error('[getCurrentLive2DModel] 获取当前Live2D模型失败:', error);
    return null;
  }
}

/**
 * Agent 健康检查
 */
async function checkAgentHealth(): Promise<boolean> {
  const request = getRequestInstance();
  if (!request) {
    console.warn('[checkAgentHealth] request 实例未初始化');
    return false;
  }

  try {
    const data = await request.get('/api/agent/health');
    return data?.success === true || data === true;
  } catch (error: any) {
    console.error('[checkAgentHealth] Agent健康检查失败:', error);
    return false;
  }
}

/**
 * 检查 Agent 能力可用性
 */
async function checkAgentCapability(capability: 'computer_use' | 'mcp'): Promise<boolean> {
  const request = getRequestInstance();
  if (!request) {
    console.warn('[checkAgentCapability] request 实例未初始化');
    return false;
  }

  try {
    const apis: Record<string, string> = {
      computer_use: '/api/agent/computer_use/availability',
      mcp: '/api/agent/mcp/availability'
    };
    
    const url = apis[capability];
    if (!url) {
      console.warn('[checkAgentCapability] 未知的能力类型:', capability);
      return false;
    }
    
    const data = await request.get(url);
    return data?.ready === true;
  } catch (error: any) {
    console.error('[checkAgentCapability] 检查Agent能力失败:', error);
    return false;
  }
}

/**
 * 获取 Agent flags
 */
async function getAgentFlags(): Promise<any | null> {
  const request = getRequestInstance();
  if (!request) {
    console.warn('[getAgentFlags] request 实例未初始化');
    return null;
  }

  try {
    const data = await request.get('/api/agent/flags');
    if (data?.success) {
      return data;
    }
    return null;
  } catch (error: any) {
    console.error('[getAgentFlags] 获取Agent flags失败:', error);
    return null;
  }
}

/**
 * 设置 Agent flags
 */
async function setAgentFlags(lanlanName: string, flags: Record<string, boolean>): Promise<boolean> {
  const request = getRequestInstance();
  if (!request) {
    console.warn('[setAgentFlags] request 实例未初始化');
    return false;
  }

  try {
    const result = await request.post('/api/agent/flags', {
      lanlan_name: lanlanName,
      flags: flags
    });
    return result?.success !== false;
  } catch (error: any) {
    console.error('[setAgentFlags] 设置Agent flags失败:', error);
    return false;
  }
}

/**
 * Agent 控制
 */
async function controlAgent(action: 'enable_analyzer' | 'disable_analyzer'): Promise<boolean> {
  const request = getRequestInstance();
  if (!request) {
    console.warn('[controlAgent] request 实例未初始化');
    return false;
  }

  try {
    const result = await request.post('/api/agent/admin/control', {
      action: action
    });
    return result?.success !== false;
  } catch (error: any) {
    console.error('[controlAgent] Agent控制失败:', error);
    return false;
  }
}

/**
 * 获取 Agent 任务状态
 */
async function getAgentTaskStatus(): Promise<any | null> {
  const request = getRequestInstance();
  if (!request) {
    console.warn('[getAgentTaskStatus] request 实例未初始化');
    return null;
  }

  try {
    const data = await request.get('/api/agent/task_status');
    if (data?.success) {
      return data;
    }
    return null;
  } catch (error: any) {
    console.error('[getAgentTaskStatus] 获取Agent任务状态失败:', error);
    return null;
  }
}

/**
 * 触发主动搭话
 */
async function triggerProactiveChat(lanlanName: string): Promise<any | null> {
  const request = getRequestInstance();
  if (!request) {
    console.warn('[triggerProactiveChat] request 实例未初始化');
    return null;
  }

  try {
    const data = await request.post('/api/proactive_chat', {
      lanlan_name: lanlanName
    });
    return data;
  } catch (error: any) {
    console.error('[triggerProactiveChat] 触发主动搭话失败:', error);
    return null;
  }
}

/**
 * 获取用户偏好设置
 */
async function getUserPreferences(): Promise<any[]> {
  const request = getRequestInstance();
  if (!request) {
    console.warn('[getUserPreferences] request 实例未初始化');
    return [];
  }

  try {
    const data = await request.get('/api/preferences');
    return Array.isArray(data) ? data : [];
  } catch (error: any) {
    console.error('[getUserPreferences] 获取用户偏好失败:', error);
    return [];
  }
}

/**
 * 保存用户偏好设置
 */
async function saveUserPreferences(
  modelPath: string,
  position: { x: number; y: number },
  scale: { x: number; y: number }
): Promise<boolean> {
  const request = getRequestInstance();
  if (!request) {
    console.warn('[saveUserPreferences] request 实例未初始化');
    return false;
  }

  try {
    // 验证位置和缩放值
    if (!position || typeof position !== 'object' || 
        !Number.isFinite(position.x) || !Number.isFinite(position.y)) {
      console.error('[saveUserPreferences] 位置值无效:', position);
      return false;
    }
    
    if (!scale || typeof scale !== 'object' || 
        !Number.isFinite(scale.x) || !Number.isFinite(scale.y)) {
      console.error('[saveUserPreferences] 缩放值无效:', scale);
      return false;
    }
    
    // 验证缩放值必须为正数
    if (scale.x <= 0 || scale.y <= 0) {
      console.error('[saveUserPreferences] 缩放值必须为正数:', scale);
      return false;
    }

    const preferences = {
      model_path: modelPath,
      position: position,
      scale: scale
    };

    const result = await request.post('/api/preferences', preferences);
    return result?.success === true;
  } catch (error: any) {
    console.error('[saveUserPreferences] 保存用户偏好失败:', error);
    return false;
  }
}

/**
 * 创建 RequestAPI 命名空间对象（HTML 环境专用，使用 window.request）
 */
const RequestAPI = {
  // 页面配置
  getPageConfig,
  
  // 角色配置
  getCharacters,
  getCurrentCatgirlConfig,
  
  // Live2D 模型
  getLive2DModels,
  findLive2DModelByName,
  shouldReloadModel,
  getEmotionMapping,
  getCurrentLive2DModel,
  
  // 用户偏好
  getUserPreferences,
  saveUserPreferences,
  
  // Steam 成就
  unlockSteamAchievement,
  
  // 麦克风
  setMicrophone,
  getMicrophone,
  
  // 情感分析
  analyzeEmotion,
  
  // Agent
  checkAgentHealth,
  checkAgentCapability,
  getAgentFlags,
  setAgentFlags,
  controlAgent,
  getAgentTaskStatus,
  
  // 主动搭话
  triggerProactiveChat,
  
  // 系统功能
  sendShutdownBeacon,
} as const;

/**
 * 初始化全局 API 对象
 * 
 * 将 RequestAPI 命名空间对象暴露到 window.RequestAPI
 * 这样在 HTML 环境中可以使用 window.RequestAPI.getPageConfig() 等方式调用
 */
function initRequestAPI() {
  if (typeof window === 'undefined') {
    console.warn('[RequestAPI] 非浏览器环境，跳过初始化');
    return;
  }

  const win = window as any;

  // 直接暴露整个 RequestAPI 命名空间对象
  win.RequestAPI = RequestAPI;

  console.log('[RequestAPI] API 命名空间已暴露到全局 window.RequestAPI');
  console.log('[RequestAPI] 可用方法:', Object.keys(RequestAPI).join(', '));
}

// 自动初始化
if (typeof window !== 'undefined') {
  // 等待 request.global.js 初始化完成后再初始化 RequestAPI
  const waitForRequestAndInit = async () => {
    const maxWait = 5000;
    const startTime = Date.now();
    
    // 等待 window.request 初始化
    while (!(window as any).request && Date.now() - startTime < maxWait) {
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    
    if ((window as any).request) {
      initRequestAPI();
    } else {
      console.warn('[RequestAPI] 等待 request.global.js 初始化超时，RequestAPI 可能无法正常工作');
      // 即使超时也尝试初始化，getRequestInstance() 会处理错误
      initRequestAPI();
    }
  };

  // 根据 DOM 状态决定何时开始等待
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', waitForRequestAndInit);
  } else {
    // DOM 已加载，直接开始等待
    waitForRequestAndInit();
  }
}

// 导出 RequestAPI 命名空间对象供外部使用（如果需要）
export { RequestAPI };

