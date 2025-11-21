/**
 * 全局变量统一管理文件
 * 此文件应在所有其他脚本之前加载，以避免变量未定义或时序问题
 * 
 * 使用方式：
 * 在 HTML 的 <head> 中首先引入：
 * <script src="/static/global_vars.js"></script>
 */

(function() {
    'use strict';
    
    // ==================== 页面配置相关 ====================
    // 页面配置对象
    if (typeof window.lanlan_config === 'undefined') {
        window.lanlan_config = {
            lanlan_name: ""
        };
    }
    
    // Cubism 4 模型路径
    if (typeof window.cubism4Model === 'undefined') {
        window.cubism4Model = "";
    }
    
    // 页面配置加载状态（Promise）
    if (typeof window.pageConfigReady === 'undefined') {
        // 默认返回一个已解决的Promise，后续会被实际加载函数替换
        window.pageConfigReady = Promise.resolve(true);
    }
    
    // ==================== Beacon 功能相关 ====================
    // Beacon 发送状态标记（防止重复发送）
    if (typeof window.beaconSent === 'undefined') {
        window.beaconSent = false;
    }
    
    // ==================== 菜单跟踪相关 ====================
    // 活动菜单计数（用于跟踪当前打开的菜单数量）
    if (typeof window.activeMenuCount === 'undefined') {
        window.activeMenuCount = 0;
    }
    
    // 标记菜单打开
    if (typeof window.markMenuOpen === 'undefined') {
        window.markMenuOpen = function() {
            window.activeMenuCount++;
        };
    }
    
    // 标记菜单关闭
    if (typeof window.markMenuClosed === 'undefined') {
        window.markMenuClosed = function() {
            window.activeMenuCount = Math.max(0, window.activeMenuCount - 1);
        };
    }
    
    // ==================== Live2D 相关 ====================
    // Live2D 角色对象（兼容旧代码）
    if (typeof window.LanLan1 === 'undefined') {
        window.LanLan1 = {};
    }
    
    // ==================== 页面特定变量 ====================
    // 角色管理器页面：角色数据缓存
    if (typeof window.characterData === 'undefined') {
        window.characterData = null;
    }
    
    // 角色管理器页面：当前展开的猫娘名称
    if (typeof window.expandedCatgirlName === 'undefined') {
        window.expandedCatgirlName = null;
    }
    
    // 记忆浏览器页面：当前选中的记忆文件
    if (typeof window.currentMemoryFile === 'undefined') {
        window.currentMemoryFile = null;
    }
    
    // 记忆浏览器页面：聊天数据
    if (typeof window.chatData === 'undefined') {
        window.chatData = [];
    }
    
    // 记忆浏览器页面：当前猫娘名称
    if (typeof window.currentCatName === 'undefined') {
        window.currentCatName = '';
    }
    
    // API Key 设置页面：待保存的 API Key
    if (typeof window.pendingApiKey === 'undefined') {
        window.pendingApiKey = null;
    }
    
    // Live2D 管理器页面：是否有未保存的更改
    if (typeof window.hasUnsavedChanges === 'undefined') {
        window.hasUnsavedChanges = false;
    }
    
    // Viewer 页面：WebSocket 连接
    if (typeof window.viewerWs === 'undefined') {
        window.viewerWs = null;
    }
    
    // Viewer 页面：重连尝试次数
    if (typeof window.reconnectAttempts === 'undefined') {
        window.reconnectAttempts = 0;
    }
    
    // Viewer 页面：音频相关
    if (typeof window.viewerAudioContext === 'undefined') {
        window.viewerAudioContext = null;
    }
    
    if (typeof window.audioQueue === 'undefined') {
        window.audioQueue = [];
    }
    
    if (typeof window.isPlaying === 'undefined') {
        window.isPlaying = false;
    }
    
    if (typeof window.lipSyncActive === 'undefined') {
        window.lipSyncActive = false;
    }
    
    if (typeof window.animationFrameId === 'undefined') {
        window.animationFrameId = null;
    }
    
    if (typeof window.globalAnalyser === 'undefined') {
        window.globalAnalyser = null;
    }
    
    // ==================== 设置窗口管理 ====================
    // 已打开的设置窗口引用映射（URL -> Window对象）
    if (typeof window._openSettingsWindows === 'undefined') {
        window._openSettingsWindows = {};
    }
    
    // ==================== app.js 相关全局变量和函数 ====================
    // 状态提示函数（由 app.js 初始化）
    if (typeof window.showStatusToast === 'undefined') {
        window.showStatusToast = function(message, duration) {
            console.warn('[Global Vars] showStatusToast 尚未初始化，消息:', message);
        };
        // 标记为占位符
        window.showStatusToast.__isPlaceholder = true;
    }
    
    // 主动聊天功能开关
    if (typeof window.proactiveChatEnabled === 'undefined') {
        window.proactiveChatEnabled = false;
    }
    
    // Focus 模式开关
    if (typeof window.focusModeEnabled === 'undefined') {
        window.focusModeEnabled = false;
    }
    
    // 麦克风切换函数（由 app.js 初始化）
    if (typeof window.switchMicCapture === 'undefined') {
        window.switchMicCapture = async function() {
            console.warn('[Global Vars] switchMicCapture 尚未初始化');
        };
    }
    
    // 屏幕共享切换函数（由 app.js 初始化）
    if (typeof window.switchScreenSharing === 'undefined') {
        window.switchScreenSharing = async function() {
            console.warn('[Global Vars] switchScreenSharing 尚未初始化');
        };
    }
    
    // 开始屏幕共享函数（由 app.js 初始化）
    if (typeof window.startScreenSharing === 'undefined') {
        window.startScreenSharing = function() {
            console.warn('[Global Vars] startScreenSharing 尚未初始化');
        };
    }
    
    // 停止屏幕共享函数（由 app.js 初始化）
    if (typeof window.stopScreenSharing === 'undefined') {
        window.stopScreenSharing = function() {
            console.warn('[Global Vars] stopScreenSharing 尚未初始化');
        };
    }
    
    // 屏幕共享别名（由 app.js 初始化）
    if (typeof window.screen_share === 'undefined') {
        window.screen_share = window.startScreenSharing;
    }
    
    // 渲染浮动麦克风列表函数（由 app.js 初始化）
    if (typeof window.renderFloatingMicList === 'undefined') {
        window.renderFloatingMicList = async function() {
            console.warn('[Global Vars] renderFloatingMicList 尚未初始化');
        };
    }
    
    // 重置主动聊天退避函数（由 app.js 初始化）
    if (typeof window.resetProactiveChatBackoff === 'undefined') {
        window.resetProactiveChatBackoff = function() {
            console.warn('[Global Vars] resetProactiveChatBackoff 尚未初始化');
        };
    }
    
    // 停止主动聊天调度函数（由 app.js 初始化）
    if (typeof window.stopProactiveChatSchedule === 'undefined') {
        window.stopProactiveChatSchedule = function() {
            console.warn('[Global Vars] stopProactiveChatSchedule 尚未初始化');
        };
    }
    
    // 保存设置函数（由 app.js 初始化）
    if (typeof window.saveXiao8Settings === 'undefined') {
        window.saveXiao8Settings = function() {
            console.warn('[Global Vars] saveXiao8Settings 尚未初始化');
        };
    }
    
    // ==================== live2d.js 相关全局变量 ====================
    // Live2D 管理器类（由 live2d.js 初始化）
    if (typeof window.Live2DManager === 'undefined') {
        window.Live2DManager = null;
    }
    
    // Live2D 管理器实例（由 live2d.js 初始化）
    if (typeof window.live2dManager === 'undefined') {
        window.live2dManager = null;
    }
    
    // PIXI 库（由 live2d.js 初始化，来自外部库，不需要默认值）
    // 注意：window.PIXI 由外部库提供，这里不初始化
    
    // ==================== i18n-i18next.js 相关全局变量和函数 ====================
    // i18n 初始化标记
    if (typeof window.i18nInitialized === 'undefined') {
        window.i18nInitialized = false;
    }
    
    // 翻译函数（由 i18n-i18next.js 初始化）
    if (typeof window.t === 'undefined') {
        window.t = function(key, params) {
            console.warn('[Global Vars] t 函数尚未初始化，key:', key);
            return key || '';
        };
    }
    
    // i18n 实例（由 i18n-i18next.js 初始化）
    if (typeof window.i18n === 'undefined') {
        window.i18n = null;
    }
    
    // 更新页面文本函数（由 i18n-i18next.js 初始化）
    if (typeof window.updatePageTexts === 'undefined') {
        window.updatePageTexts = function() {
            console.warn('[Global Vars] updatePageTexts 尚未初始化');
        };
    }
    
    // 更新 Live2D 动态文本函数（由 i18n-i18next.js 初始化）
    if (typeof window.updateLive2DDynamicTexts === 'undefined') {
        window.updateLive2DDynamicTexts = function() {
            console.warn('[Global Vars] updateLive2DDynamicTexts 尚未初始化');
        };
    }
    
    // 翻译状态消息函数（由 i18n-i18next.js 初始化）
    if (typeof window.translateStatusMessage === 'undefined') {
        window.translateStatusMessage = function(message) {
            return message || '';
        };
    }
    
    // 切换语言函数（由 i18n-i18next.js 初始化）
    if (typeof window.changeLanguage === 'undefined') {
        window.changeLanguage = function(lng) {
            console.warn('[Global Vars] changeLanguage 尚未初始化，lng:', lng);
        };
    }
    
    // i18n 诊断函数（由 i18n-i18next.js 初始化）
    if (typeof window.diagnoseI18n === 'undefined') {
        window.diagnoseI18n = function() {
            console.warn('[Global Vars] diagnoseI18n 尚未初始化');
        };
    }
    
    // 测试翻译函数（由 i18n-i18next.js 初始化）
    if (typeof window.testTranslation === 'undefined') {
        window.testTranslation = function(key) {
            console.warn('[Global Vars] testTranslation 尚未初始化，key:', key);
            return key || '';
        };
    }
    
    // ==================== common_dialogs.js 相关全局函数 ====================
    // 显示警告对话框函数（由 common_dialogs.js 初始化）
    if (typeof window.showAlert === 'undefined') {
        window.showAlert = function(message, title) {
            console.warn('[Global Vars] showAlert 尚未初始化，使用原生 alert，message:', message);
            alert(message);
            return Promise.resolve(true);
        };
    }
    
    // 显示确认对话框函数（由 common_dialogs.js 初始化）
    if (typeof window.showConfirm === 'undefined') {
        window.showConfirm = function(message, title) {
            console.warn('[Global Vars] showConfirm 尚未初始化，使用原生 confirm，message:', message);
            return Promise.resolve(confirm(message));
        };
    }
    
    // 显示输入对话框函数（由 common_dialogs.js 初始化）
    if (typeof window.showPrompt === 'undefined') {
        window.showPrompt = function(message, defaultValue, title) {
            console.warn('[Global Vars] showPrompt 尚未初始化，使用原生 prompt，message:', message);
            return Promise.resolve(prompt(message, defaultValue));
        };
    }
    
    // ==================== audio-loader.js 相关全局变量 ====================
    // 音频管理器实例（由 audio-loader.js 初始化）
    if (typeof window.AM === 'undefined') {
        window.AM = null;
    }
    
    // ==================== 初始化完成标记 ====================
    // 标记全局变量已初始化（用于检查）
    window.globalVarsInitialized = true;
    
    console.log('[Global Vars] 全局变量已初始化');
})();

