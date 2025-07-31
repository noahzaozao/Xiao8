# Live2D 情感系统

## 概述

Live2D情感系统允许根据文本情感分析结果自动播放对应的表情和动作，使角色表现更加生动。

## 功能特性

- **情感分析**: 使用AI模型分析文本情感
- **表情映射**: 将情感映射到Live2D表情文件
- **动作映射**: 将情感映射到Live2D动作文件
- **随机选择**: 每个情感可以配置多个表情/动作，随机选择播放
- **置信度控制**: 当情感分析置信度低于0.3时自动转为中性情感

## 配置文件

### use_preferences.json

配置文件位置: `config/use_preferences.json`

```json
{
  "mao_pro": {
    "motions": {
      "happy": ["mtn_01.motion3.json", "mtn_02.motion3.json"],
      "sad": ["mtn_03.motion3.json"],
      "angry": ["mtn_04.motion3.json"],
      "neutral": ["mtn_01.motion3.json"],
      "surprised": ["special_03.motion3.json"]
    },
    "expressions": {
      "happy": ["exp_01.exp3.json", "exp_02.exp3.json"],
      "sad": ["exp_03.exp3.json", "exp_04.exp3.json"],
      "angry": ["exp_05.exp3.json"],
      "neutral": ["exp_01.exp3.json"],
      "surprised": ["exp_06.exp3.json", "exp_07.exp3.json"]
    }
  }
}
```

### 配置说明

- **motions**: 动作文件映射，支持的情感类型: happy, sad, angry, neutral, surprised
- **expressions**: 表情文件映射，支持相同的情感类型
- 每个情感可以配置多个文件，系统会随机选择其中一个播放

## API接口

### 情感分析API

**POST** `/api/emotion/analysis`

请求体:
```json
{
  "text": "要分析的文本",
  "api_key": "API密钥(可选)",
  "model": "模型名称(可选)"
}
```

响应:
```json
{
  "emotion": "happy",
  "confidence": 0.85
}
```

### Live2D映射API

**GET** `/api/live2d/emotion_mapping/{model_name}`

响应:
```json
{
  "success": true,
  "mapping": {
    "motions": {...},
    "expressions": {...}
  }
}
```

## 前端使用

### JavaScript API

```javascript
// 设置情感并播放对应的表情和动作
window.LanLan1.setEmotion('happy');

// 单独播放表情
window.LanLan1.playExpression('sad');

// 单独播放动作
window.LanLan1.playMotion('angry');
```

### 测试按钮

在界面上添加了测试按钮来验证功能:
- 😊 开心
- 😢 悲伤  
- 😠 愤怒
- 😲 惊讶
- 😐 中性

## 文件结构

```
static/
├── mao_pro/
│   ├── expressions/
│   │   ├── exp_01.exp3.json
│   │   ├── exp_02.exp3.json
│   │   └── ...
│   ├── motions/
│   │   ├── mtn_01.motion3.json
│   │   ├── mtn_02.motion3.json
│   │   └── ...
│   └── mao_pro.model3.json
└── xiaoba/
    ├── expressions/
    ├── motions/
    └── xiaoba.model3.json
```

## 集成到现有系统

### 1. 在对话系统中集成

```javascript
// 在收到AI回复后分析情感并播放
async function handleAIResponse(text) {
    // 发送情感分析请求
    const response = await fetch('/api/emotion/analysis', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({text: text})
    });
    
    const result = await response.json();
    
    // 播放对应的情感
    if (window.LanLan1 && window.LanLan1.setEmotion) {
        window.LanLan1.setEmotion(result.emotion);
    }
}
```

### 2. 在语音合成中集成

```javascript
// 在语音播放时同步播放情感
function playAudioWithEmotion(audioData, text) {
    // 分析文本情感
    analyzeEmotion(text).then(emotion => {
        // 播放情感
        window.LanLan1.setEmotion(emotion);
        
        // 播放音频
        playAudio(audioData);
    });
}
```

## 故障排除

### 常见问题

1. **表情/动作不播放**
   - 检查配置文件中的文件路径是否正确
   - 确认Live2D模型文件存在
   - 查看浏览器控制台错误信息

2. **情感分析失败**
   - 检查API密钥配置
   - 确认网络连接正常
   - 查看服务器日志

3. **模型名称不匹配**
   - 确认配置文件中的模型名称与实际的模型文件夹名称一致
   - 检查模型路径解析逻辑

### 调试方法

1. 打开浏览器开发者工具
2. 查看Console标签页的日志信息
3. 使用测试按钮验证功能
4. 检查Network标签页的API请求

## 扩展功能

### 添加新的情感类型

1. 在配置文件中添加新的情感类型
2. 准备对应的表情和动作文件
3. 更新前端代码支持新情感

### 自定义映射逻辑

可以修改 `live2d.js` 中的映射逻辑来实现更复杂的规则，比如：
- 基于时间的情感变化
- 基于对话历史的情感累积
- 基于用户行为的情感响应

## 性能优化

- 表情和动作文件会被缓存
- 情感分析结果会被缓存一段时间
- 避免频繁的情感切换以减少资源消耗 