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
    
    /**
     * 初始化全局变量（如果未定义）
     * @param {string} name - 变量名（不需要 'window.' 前缀）
     * @param {*} defaultValue - 默认值
     */
    function initVar(name, defaultValue) {
        if (typeof window[name] === 'undefined') {
            window[name] = defaultValue;
        }
    }
    
    /**
     * 初始化全局函数（如果未定义）
     * @param {string} name - 函数名（不需要 'window.' 前缀）
     * @param {Function} fn - 函数实现
     * @param {boolean} isPlaceholder - 是否标记为占位符（默认 false）
     */
    function initFunction(name, fn, isPlaceholder = false) {
        if (typeof window[name] === 'undefined') {
            window[name] = fn;
            if (isPlaceholder) {
                window[name].__isPlaceholder = true;
            }
        }
    }
    
    // ==================== 页面配置相关 ====================
    initVar('lanlan_config', { lanlan_name: "" });
    initVar('cubism4Model', "");
    // 页面配置加载状态（Promise）
    initVar('pageConfigReady', Promise.resolve(true));
    
    // ==================== Beacon 功能相关 ====================
    initVar('beaconSent', false);
    
    // ==================== 菜单跟踪相关 ====================
    initVar('activeMenuCount', 0);
    initFunction('markMenuOpen', function() {
        window.activeMenuCount++;
    });
    initFunction('markMenuClosed', function() {
        window.activeMenuCount = Math.max(0, window.activeMenuCount - 1);
    });
    
    // ==================== Live2D 相关 ====================
    initVar('LanLan1', {});
    
    // ==================== 页面特定变量 ====================
    initVar('characterData', null);
    initVar('expandedCatgirlName', null);
    initVar('currentMemoryFile', null);
    initVar('chatData', []);
    initVar('currentCatName', '');
    initVar('pendingApiKey', null);
    initVar('hasUnsavedChanges', false);
    initVar('viewerWs', null);
    initVar('reconnectAttempts', 0);
    initVar('viewerAudioContext', null);
    initVar('audioQueue', []);
    initVar('isPlaying', false);
    initVar('lipSyncActive', false);
    initVar('animationFrameId', null);
    initVar('globalAnalyser', null);
    initVar('_openSettingsWindows', {});
    
    // ==================== app.js 相关全局变量和函数 ====================
    initFunction('showStatusToast', function(message, duration) {
        console.warn('[Global Vars] showStatusToast 尚未初始化，消息:', message);
    }, true);
    
    initVar('proactiveChatEnabled', false);
    initVar('focusModeEnabled', false);
    
    initFunction('switchMicCapture', async function() {
        console.warn('[Global Vars] switchMicCapture 尚未初始化');
    }, true);
    
    initFunction('switchScreenSharing', async function() {
        console.warn('[Global Vars] switchScreenSharing 尚未初始化');
    }, true);
    
    initFunction('startScreenSharing', function() {
        console.warn('[Global Vars] startScreenSharing 尚未初始化');
    }, true);
    
    initFunction('stopScreenSharing', function() {
        console.warn('[Global Vars] stopScreenSharing 尚未初始化');
    }, true);
    
    // 屏幕共享别名（由 app.js 初始化）
    if (typeof window.screen_share === 'undefined') {
        window.screen_share = window.startScreenSharing;
        window.screen_share.__isPlaceholder = true;
    }
    
    initFunction('renderFloatingMicList', async function() {
        console.warn('[Global Vars] renderFloatingMicList 尚未初始化');
    }, true);
    
    initFunction('resetProactiveChatBackoff', function() {
        console.warn('[Global Vars] resetProactiveChatBackoff 尚未初始化');
    }, true);
    
    initFunction('stopProactiveChatSchedule', function() {
        console.warn('[Global Vars] stopProactiveChatSchedule 尚未初始化');
    }, true);
    
    initFunction('saveXiao8Settings', function() {
        console.warn('[Global Vars] saveXiao8Settings 尚未初始化');
    }, true);
    
    // ==================== live2d.js 相关全局变量 ====================
    initVar('Live2DManager', null);
    initVar('live2dManager', null);
    // PIXI 库（由 live2d.js 初始化，来自外部库，不需要默认值）
    // 注意：window.PIXI 由外部库提供，这里不初始化
    
    // ==================== i18n-i18next.js 相关全局变量和函数 ====================
    initVar('i18nInitialized', false);
    
    initFunction('t', function(key, params) {
        console.warn('[Global Vars] t 函数尚未初始化，key:', key);
        return key || '';
    }, true);
    
    initVar('i18n', null);
    
    initFunction('updatePageTexts', function() {
        console.warn('[Global Vars] updatePageTexts 尚未初始化');
    }, true);
    
    initFunction('updateLive2DDynamicTexts', function() {
        console.warn('[Global Vars] updateLive2DDynamicTexts 尚未初始化');
    }, true);
    
    initFunction('translateStatusMessage', function(message) {
        return message || '';
    }, true);
    
    initFunction('changeLanguage', function(lng) {
        console.warn('[Global Vars] changeLanguage 尚未初始化，lng:', lng);
    }, true);
    
    initFunction('diagnoseI18n', function() {
        console.warn('[Global Vars] diagnoseI18n 尚未初始化');
    });
    
    initFunction('testTranslation', function(key) {
        console.warn('[Global Vars] testTranslation 尚未初始化，key:', key);
        return key || '';
    });
    
    // ==================== common_dialogs.js 相关全局函数 ====================
    initFunction('showAlert', function(message, title) {
        console.warn('[Global Vars] showAlert 尚未初始化，使用原生 alert，message:', message);
        alert(message);
        return Promise.resolve(true);
    }, true);
    
    initFunction('showConfirm', function(message, title) {
        console.warn('[Global Vars] showConfirm 尚未初始化，使用原生 confirm，message:', message);
        return Promise.resolve(confirm(message));
    }, true);
    
    initFunction('showPrompt', function(message, defaultValue, title) {
        console.warn('[Global Vars] showPrompt 尚未初始化，使用原生 prompt，message:', message);
        return Promise.resolve(prompt(message, defaultValue));
    }, true);
    
    // ==================== audio-loader.js 相关全局变量 ====================
    initVar('AM', null);
    
    // ==================== 初始化完成标记 ====================
    initVar('globalVarsInitialized', true);
    
    /**
     * 工具函数：安全地设置全局函数（如果未定义或是占位符）
     * 用于在其他文件中替换占位符函数
     * 
     * @param {string} name - 函数名（不需要 'window.' 前缀）
     * @param {Function} fn - 实际的函数实现
     * @returns {boolean} - 是否成功设置（如果已存在且不是占位符则返回 false）
     * 
     * @example
     * // 在 app.js 中
     * if (setGlobalFunction('showStatusToast', showStatusToast)) {
     *     console.log('函数已设置');
     * }
     */
    window.setGlobalFunction = function(name, fn) {
        if (typeof window[name] === 'undefined' || (window[name] && window[name].__isPlaceholder)) {
            window[name] = fn;
            if (window[name]) {
                delete window[name].__isPlaceholder;
            }
            return true;
        }
        return false;
    };
    
    /**
     * 工具函数：检查全局变量/函数是否需要初始化
     * 
     * @param {string} name - 变量/函数名（不需要 'window.' 前缀）
     * @returns {boolean} - 如果未定义或是占位符则返回 true
     * 
     * @example
     * if (shouldInitGlobal('showStatusToast')) {
     *     window.showStatusToast = myFunction;
     *     delete window.showStatusToast.__isPlaceholder;
     * }
     */
    window.shouldInitGlobal = function(name) {
        return typeof window[name] === 'undefined' || (window[name] && window[name].__isPlaceholder);
    };
    
    /**
     * 工具函数：批量从全局变量获取值到局部作用域
     * 用于在 HTML 模板中简化局部变量的初始化
     * 
     * @param {...string} varNames - 变量名列表（不需要 'window.' 前缀）
     * @returns {Object} - 包含所有变量的对象
     * 
     * @example
     * // 在 HTML 模板中
     * const { lanlan_config, cubism4Model } = window.getGlobalVars('lanlan_config', 'cubism4Model');
     * // 或者使用解构赋值
     * const vars = window.getGlobalVars('characterData', 'expandedCatgirlName');
     * let characterData = vars.characterData;
     * let expandedCatgirlName = vars.expandedCatgirlName;
     */
    window.getGlobalVars = function(...varNames) {
        const result = {};
        for (const name of varNames) {
            result[name] = window[name];
        }
        return result;
    };
    
    console.log('[Global Vars] 全局变量已初始化');
})();
