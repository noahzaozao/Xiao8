# Live2D 管理器使用指南

## 概述

重构后的 `live2d.js` 提供了一个统一的 `Live2DManager` 类，用于管理 Live2D 模型的加载、显示和交互。这个管理器可以被多个页面共享使用，避免代码重复。

## 基本用法

### 1. 引入依赖

确保在 HTML 中按顺序引入以下脚本：

```html
<script src="/static/libs/live2dcubismcore.min.js"></script>
<script src="/static/libs/live2d.min.js"></script>
<script src="/static/libs/pixi.min.js"></script>
<script src="/static/libs/index.min.js"></script>
<script src="/static/live2d.js"></script>
```

### 2. 初始化管理器

```javascript
// 获取全局管理器实例
const manager = window.live2dManager;

// 初始化 PIXI 应用
await manager.initPIXI('live2d-canvas', 'live2d-container', {
    autoStart: true,
    transparent: true,
    backgroundAlpha: 0
});
```

### 3. 加载模型

```javascript
// 加载模型
await manager.loadModel('/static/mao_pro/mao_pro.model3.json', {
    preferences: savedPreferences,  // 用户偏好设置
    dragEnabled: true,              // 启用拖拽
    wheelEnabled: true,             // 启用滚轮缩放
    loadEmotionMapping: true        // 加载情感映射
});
```

## 高级功能

### 情感系统

```javascript
// 设置情感
await manager.setEmotion('happy');   // 开心
await manager.setEmotion('sad');     // 悲伤
await manager.setEmotion('angry');   // 愤怒
await manager.setEmotion('surprised'); // 惊讶
await manager.setEmotion('neutral'); // 中性

// 单独播放表情或动作
await manager.playExpression('happy');
await manager.playMotion('happy');

// 清理情感效果
manager.clearEmotionEffects();
manager.clearExpression();
```

### 用户偏好管理

```javascript
// 加载用户偏好
const preferences = await manager.loadUserPreferences();

// 保存用户偏好
const success = await manager.saveUserPreferences(
    modelPath,
    { x: model.x, y: model.y },
    { x: model.scale.x, y: model.scale.y }
);
```

### 事件回调

```javascript
// 设置模型加载完成回调
manager.onModelLoaded = (model, modelPath) => {
    console.log('模型加载完成:', modelPath);
    // 执行自定义逻辑
};

// 设置状态更新回调
manager.onStatusUpdate = (message) => {
    console.log('状态更新:', message);
    // 更新 UI 状态
};
```

## 页面集成示例

### index.html 集成

`index.html` 会自动初始化管理器（如果存在 `cubism4Model` 变量）：

```javascript
// 自动初始化（在 live2d.js 中）
if (typeof cubism4Model !== 'undefined' && cubism4Model) {
    // 自动初始化逻辑
}
```

### l2d_manager.html 集成

```javascript
(async function () {
    // 初始化管理器
    await window.live2dManager.initPIXI('live2d-canvas', 'live2d-container');
    
    // 设置回调
    window.live2dManager.onModelLoaded = (model, modelPath) => {
        console.log('模型加载完成:', modelPath);
    };
    
    // 加载模型列表并处理用户选择
    // ... 其他逻辑
})();
```

## 兼容性

为了保持向后兼容性，原有的全局函数仍然可用：

```javascript
// 兼容性 API
window.LanLan1.setEmotion('happy');
window.LanLan1.playExpression('happy');
window.LanLan1.playMotion('happy');
window.LanLan1.clearEmotionEffects();
window.LanLan1.clearExpression();

// 全局变量
window.LanLan1.live2dModel = manager.getCurrentModel();
window.LanLan1.currentModel = manager.getCurrentModel();
window.LanLan1.emotionMapping = manager.getEmotionMapping();
```

## 配置选项

### PIXI 应用配置

```javascript
await manager.initPIXI('canvas-id', 'container-id', {
    autoStart: true,        // 自动开始渲染
    transparent: true,      // 透明背景
    backgroundAlpha: 0,     // 背景透明度
    // 其他 PIXI.Application 选项
});
```

### 模型加载配置

```javascript
await manager.loadModel(modelPath, {
    preferences: null,           // 用户偏好设置
    isMobile: false,            // 是否为移动端
    dragEnabled: true,          // 启用拖拽
    wheelEnabled: true,         // 启用滚轮缩放
    loadEmotionMapping: true    // 加载情感映射
});
```

## 错误处理

```javascript
try {
    await manager.loadModel(modelPath, options);
} catch (error) {
    console.error('加载模型失败:', error);
    // 处理错误
}
```

## 性能优化

- 管理器会自动处理模型的销毁和重新加载
- 支持情感系统的防重复触发机制
- 自动管理定时器和事件监听器

## 扩展功能

可以通过继承 `Live2DManager` 类来添加自定义功能：

```javascript
class CustomLive2DManager extends Live2DManager {
    constructor() {
        super();
        // 添加自定义属性
    }
    
    // 添加自定义方法
    async customMethod() {
        // 自定义逻辑
    }
}
```

## 注意事项

1. 确保在调用其他方法之前先初始化 PIXI 应用
2. 模型路径必须是有效的 Live2D 模型文件路径
3. 情感映射需要后端 API 支持
4. 用户偏好保存需要后端 API 支持
5. 在页面卸载时，管理器会自动清理资源 