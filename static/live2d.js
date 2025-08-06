/*function add_controller(model) {
    model.internalModel.coreModel.setParameterValueById('Param97', 1.0);
}

function remove_controller(model) {
    model.internalModel.coreModel.setParameterValueById('Param97', 0.0);
}

function add_tongue(model) {
    model.internalModel.coreModel.setParameterValueById('Param78', 1.0);
}

function remove_tongue(model) {
    model.internalModel.coreModel.setParameterValueById('Param78', 0.0);
}

function add_tears(model) {
    model.internalModel.coreModel.setParameterValueById('Param105', 5.0);
}

function remove_tears(model) {
    model.internalModel.coreModel.setParameterValueById('Param105', 0.0);
}

function add_mask(model) {
    model.internalModel.coreModel.setParameterValueById('kouzhao', 1.0);
}

function remove_mask(model) {
    model.internalModel.coreModel.setParameterValueById('kouzhao', 0.0);
}

function add_stars(model) {
    model.internalModel.coreModel.setParameterValueById('Param107', 1.0);
}

function remove_stars(model) {
    model.internalModel.coreModel.setParameterValueById('Param107', 0.0);
}

function add_hearts(model) {
    model.internalModel.coreModel.setParameterValueById('Param106', 1.0);
}

function remove_hearts(model) {
    model.internalModel.coreModel.setParameterValueById('Param106', 0.0);
}

function add_anger(model) {
    model.internalModel.coreModel.setParameterValueById('Param104', 1.0);
}

function remove_anger(model) {
    model.internalModel.coreModel.setParameterValueById('Param104', 0.0);
}

function remove_all(model) {
    model.internalModel.coreModel.setParameterValueById('Param104', 0.0);
    model.internalModel.coreModel.setParameterValueById('Param106', 0.0);
    model.internalModel.coreModel.setParameterValueById('Param107', 0.0);
    model.internalModel.coreModel.setParameterValueById('kouzhao', 0.0);
    model.internalModel.coreModel.setParameterValueById('Param105', 0.0);
    model.internalModel.coreModel.setParameterValueById('Param78', 0.0);
    model.internalModel.coreModel.setParameterValueById('Param97', 0.0);
}

let expressions_map = {
    "手柄+": add_controller,
    "手柄-": remove_controller,
    "舌头+": add_tongue,
    "舌头-": remove_tongue,
    "眼泪+": add_tears,
    "眼泪-": remove_tears,
    "口罩+": add_mask,
    "口罩-": remove_mask,
    "星星眼+": add_stars,
    "星星眼-": remove_stars,
    "爱心+": add_hearts,
    "爱心-": remove_hearts,
    "生气+": add_anger,
    "生气-": remove_anger,
    "-": remove_all,
}*/

window.PIXI = PIXI;
const {Live2DModel} = PIXI.live2d;

// 全局变量
let currentModel = null;
let emotionMapping = null;
let currentEmotion = 'neutral';
let pixi_app = null;
let isInitialized = false;

let motionTimer = null; // 动作持续时间定时器
let isEmotionChanging = false; // 防止快速连续点击的标志

// Live2D 管理器类
class Live2DManager {
    constructor() {
        this.currentModel = null;
        this.emotionMapping = null;
        this.currentEmotion = 'neutral';
        this.pixi_app = null;
        this.isInitialized = false;
        this.motionTimer = null;
        this.isEmotionChanging = false;
        this.dragEnabled = false;
        this.isFocusing = false;
        this.isLocked = true;
        this.onModelLoaded = null;
        this.onStatusUpdate = null;
    }

    // 初始化 PIXI 应用
    async initPIXI(canvasId, containerId, options = {}) {
        if (this.isInitialized) {
            console.warn('Live2D 管理器已经初始化');
            return this.pixi_app;
        }

        const defaultOptions = {
            autoStart: true,
            transparent: true,
            backgroundAlpha: 0
        };

        this.pixi_app = new PIXI.Application({
            view: document.getElementById(canvasId),
            resizeTo: document.getElementById(containerId),
            ...defaultOptions,
            ...options
        });

        this.isInitialized = true;
        return this.pixi_app;
    }

    // 加载用户偏好
    async loadUserPreferences() {
        try {
            const response = await fetch('/api/preferences');
            if (response.ok) {
                return await response.json();
            }
        } catch (error) {
            console.warn('加载用户偏好失败:', error);
        }
        return [];
    }

    // 保存用户偏好
    async saveUserPreferences(modelPath, position, scale) {
        try {
            const preferences = {
                model_path: modelPath,
                position: position,
                scale: scale
            };
            const response = await fetch('/api/preferences', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(preferences)
            });
            const result = await response.json();
            return result.success;
        } catch (error) {
            console.error("保存偏好失败:", error);
            return false;
        }
    }



    // 随机选择数组中的一个元素
    getRandomElement(array) {
        if (!array || array.length === 0) return null;
        return array[Math.floor(Math.random() * array.length)];
    }

    // 清除expression到默认状态（使用官方API）
    clearExpression() {
        if (this.currentModel && this.currentModel.internalModel && this.currentModel.internalModel.motionManager && this.currentModel.internalModel.motionManager.expressionManager) {
            try {
                this.currentModel.internalModel.motionManager.expressionManager.resetExpression();
                console.log('expression已使用官方API清除到默认状态');
            } catch (resetError) {
                console.warn('使用官方API清除expression失败:', resetError);
            }
        } else {
            console.warn('无法访问expressionManager，expression清除失败');
        }
    }

    // 播放表情
    async playExpression(emotion) {
        if (!this.currentModel || !this.emotionMapping || !this.emotionMapping.Expressions) {
            console.warn('无法播放表情：模型或映射配置未加载');
            return;
        }
        
        const expressions = this.emotionMapping.Expressions.filter(e => e.Name.startsWith(emotion));
        if (!expressions || expressions.length === 0) {
            console.log(`未找到情感 ${emotion} 对应的表情，将跳过表情播放`);
            return; // Gracefully exit if no expression is found
        }
        
        const expressionFile = this.getRandomElement(expressions).File.split('/').pop();
        if (!expressionFile) return;
        
        try {
            // 获取模型名称（从模型路径中提取）
            let modelName = 'mao_pro'; // 默认模型名称
            
            // 尝试从模型路径中提取模型名称
            if (this.currentModel.internalModel && this.currentModel.internalModel.settings && this.currentModel.internalModel.settings.model) {
                const modelPath = this.currentModel.internalModel.settings.model;
                const pathParts = modelPath.split('/');
                modelName = pathParts[pathParts.length - 2] || pathParts[pathParts.length - 1].replace('.model3.json', '');
            }
            
            // 加载表情文件并应用参数
            const expressionPath = `/static/${modelName}/expressions/${expressionFile}`;
            const response = await fetch(expressionPath);
            if (!response.ok) {
                throw new Error(`Failed to load expression: ${response.statusText}`);
            }
            
            const expressionData = await response.json();
            console.log(`加载表情文件: ${expressionFile}`, expressionData);
            
            // 方法1: 尝试使用原生expression API
            if (this.currentModel.expression) {
                try {
                    // 从文件名中提取expression名称（去掉.exp3.json后缀）
                    const expressionName = expressionFile.replace('.exp3.json', '');
                    console.log(`尝试使用原生API播放expression: ${expressionName}`);
                    
                    const expression = await this.currentModel.expression(expressionName);
                    if (expression) {
                        console.log(`成功使用原生API播放expression: ${expressionName}`);
                        return; // 成功播放，直接返回
                    } else {
                        console.warn('原生expression API失败，回退到手动参数设置');
                    }
                } catch (error) {
                    console.warn('原生expression API出错:', error);
                }
            }
            
            // 方法2: 回退到手动参数设置
            console.log('使用手动参数设置播放expression');
            if (expressionData.Parameters) {
                for (const param of expressionData.Parameters) {
                    try {
                        this.currentModel.internalModel.coreModel.setParameterValueById(param.Id, param.Value);
                    } catch (paramError) {
                        console.warn(`设置参数 ${param.Id} 失败:`, paramError);
                    }
                }
            }
            
            console.log(`手动设置表情: ${expressionFile}`);
        } catch (error) {
            console.error('播放表情失败:', error);
        }
    }

    // 播放动作
    async playMotion(emotion) {
        if (!this.currentModel || !this.emotionMapping || !this.emotionMapping.Motions) {
            console.warn('无法播放动作：模型或映射配置未加载');
            return;
        }
        
        const motions = this.emotionMapping.Motions[emotion];
        if (!motions || motions.length === 0) {
            console.warn(`未找到情感 ${emotion} 对应的动作`);
            return;
        }
        
        const motionFile = this.getRandomElement(motions).File.split('/').pop();
        if (!motionFile) return;
        
        try {
            // 获取模型名称（从模型路径中提取）
            let modelName = 'mao_pro'; // 默认模型名称
            
            // 尝试从模型路径中提取模型名称
            if (this.currentModel.internalModel && this.currentModel.internalModel.settings && this.currentModel.internalModel.settings.model) {
                const modelPath = this.currentModel.internalModel.settings.model;
                const pathParts = modelPath.split('/');
                modelName = pathParts[pathParts.length - 2] || pathParts[pathParts.length - 1].replace('.model3.json', '');
            }
            
            // 清除之前的动作定时器
            if (this.motionTimer) {
                console.log('检测到前一个motion正在播放，正在停止...');
                
                if (this.motionTimer.type === 'animation') {
                    cancelAnimationFrame(this.motionTimer.id);
                } else if (this.motionTimer.type === 'timeout') {
                    clearTimeout(this.motionTimer.id);
                } else if (this.motionTimer.type === 'motion') {
                    // 停止motion播放
                    try {
                        if (this.motionTimer.id && this.motionTimer.id.stop) {
                            this.motionTimer.id.stop();
                        }
                    } catch (motionError) {
                        console.warn('停止motion失败:', motionError);
                    }
                } else {
                    clearTimeout(this.motionTimer);
                }
                this.motionTimer = null;
                console.log('前一个motion已停止');
            }
            
            // 尝试使用Live2D模型的原生motion播放功能
            try {
                // 构建完整的motion路径
                const motionPath = `/static/${modelName}/motions/${motionFile}`;
                console.log(`尝试播放motion: ${motionPath}`);
                
                // 方法1: 直接使用模型的motion播放功能
                if (this.currentModel.motion) {
                    try {
                        console.log(`尝试播放motion: ${motionFile}`);
                        
                        // 使用情感名称作为motion组名，这样可以确保播放正确的motion
                        console.log(`尝试使用情感组播放motion: ${emotion}`);
                        
                        const motion = await this.currentModel.motion(emotion);
                        
                        if (motion) {
                            console.log(`成功开始播放motion（情感组: ${emotion}，预期文件: ${motionFile}）`);
                            
                            // 获取motion的实际持续时间
                            let motionDuration = 5000; // 默认5秒
                            
                            // 尝试从motion文件获取持续时间
                            try {
                                const response = await fetch(motionPath);
                                if (response.ok) {
                                    const motionData = await response.json();
                                    if (motionData.Meta && motionData.Meta.Duration) {
                                        motionDuration = motionData.Meta.Duration * 1000;
                                    }
                                }
                            } catch (error) {
                                console.warn('无法获取motion持续时间，使用默认值');
                            }
                            
                            console.log(`预期motion持续时间: ${motionDuration}ms`);
                            
                            // 设置定时器在motion结束后清理
                            this.motionTimer = setTimeout(() => {
                                console.log(`motion播放完成（预期文件: ${motionFile}）`);
                                this.motionTimer = null;
                                this.clearEmotionEffects();
                            }, motionDuration);
                            
                            return; // 成功播放，直接返回
                        } else {
                            console.warn('motion播放失败');
                        }
                    } catch (error) {
                        console.warn('模型motion方法失败:', error);
                    }
                }
                
                // 方法2: 备用方案 - 如果方法1失败，尝试其他方法
                if (!this.motionTimer) {
                    console.log('方法1失败，尝试备用方案');
                    
                    // 这里可以添加其他备用方案，但目前方法1已经工作
                    console.warn('所有motion播放方法都失败，回退到简单动作');
                    this.playSimpleMotion(emotion);
                }
                
                // 如果所有方法都失败，回退到简单动作
                console.warn(`无法播放motion: ${motionFile}，回退到简单动作`);
                this.playSimpleMotion(emotion);
                
            } catch (error) {
                console.error('motion播放过程中出错:', error);
                this.playSimpleMotion(emotion);
            }
            
        } catch (error) {
            console.error('播放动作失败:', error);
            // 回退到简单动作
            this.playSimpleMotion(emotion);
        }
    }

    // 播放简单动作（回退方案）
    playSimpleMotion(emotion) {
        try {
            switch (emotion) {
                case 'happy':
                    // 轻微点头
                    this.currentModel.internalModel.coreModel.setParameterValueById('ParamAngleY', 8);
                    const happyTimer = setTimeout(() => {
                        this.currentModel.internalModel.coreModel.setParameterValueById('ParamAngleY', 0);
                        this.motionTimer = null;
                        this.clearEmotionEffects();
                    }, 1000);
                    this.motionTimer = { type: 'timeout', id: happyTimer };
                    break;
                case 'sad':
                    // 轻微低头
                    this.currentModel.internalModel.coreModel.setParameterValueById('ParamAngleY', -5);
                    const sadTimer = setTimeout(() => {
                        this.currentModel.internalModel.coreModel.setParameterValueById('ParamAngleY', 0);
                        this.motionTimer = null;
                        this.clearEmotionEffects();
                    }, 1200);
                    this.motionTimer = { type: 'timeout', id: sadTimer };
                    break;
                case 'angry':
                    // 轻微摇头
                    this.currentModel.internalModel.coreModel.setParameterValueById('ParamAngleX', 5);
                    setTimeout(() => {
                        this.currentModel.internalModel.coreModel.setParameterValueById('ParamAngleX', -5);
                    }, 400);
                    const angryTimer = setTimeout(() => {
                        this.currentModel.internalModel.coreModel.setParameterValueById('ParamAngleX', 0);
                        this.motionTimer = null;
                        this.clearEmotionEffects();
                    }, 800);
                    this.motionTimer = { type: 'timeout', id: angryTimer };
                    break;
                case 'surprised':
                    // 轻微后仰
                    this.currentModel.internalModel.coreModel.setParameterValueById('ParamAngleY', -8);
                    const surprisedTimer = setTimeout(() => {
                        this.currentModel.internalModel.coreModel.setParameterValueById('ParamAngleY', 0);
                        this.motionTimer = null;
                        this.clearEmotionEffects();
                    }, 800);
                    this.motionTimer = { type: 'timeout', id: surprisedTimer };
                    break;
                default:
                    // 中性状态，重置角度
                    this.currentModel.internalModel.coreModel.setParameterValueById('ParamAngleX', 0);
                    this.currentModel.internalModel.coreModel.setParameterValueById('ParamAngleY', 0);
                    break;
            }
            console.log(`播放简单动作: ${emotion}`);
        } catch (paramError) {
            console.warn('设置简单动作参数失败:', paramError);
        }
    }

    // 清理当前情感效果
    clearEmotionEffects() {
        let hasCleared = false;
        
        console.log('开始清理情感效果...');
        
        // 清除动作定时器
        if (this.motionTimer) {
            console.log(`清除motion定时器，类型: ${this.motionTimer.type || 'unknown'}`);
            
            if (this.motionTimer.type === 'animation') {
                // 取消动画帧
                cancelAnimationFrame(this.motionTimer.id);
            } else if (this.motionTimer.type === 'timeout') {
                // 清除普通定时器
                clearTimeout(this.motionTimer.id);
            } else if (this.motionTimer.type === 'motion') {
                // 停止motion播放
                try {
                    if (this.motionTimer.id && this.motionTimer.id.stop) {
                        this.motionTimer.id.stop();
                    }
                } catch (motionError) {
                    console.warn('停止motion失败:', motionError);
                }
            } else {
                // 兼容旧的定时器格式
                clearTimeout(this.motionTimer);
            }
            this.motionTimer = null;
            hasCleared = true;
        }
        
        // 重置角度参数
        if (this.currentModel && this.currentModel.internalModel && this.currentModel.internalModel.coreModel) {
            try {
                this.currentModel.internalModel.coreModel.setParameterValueById('ParamAngleX', 0);
                this.currentModel.internalModel.coreModel.setParameterValueById('ParamAngleY', 0);
                this.currentModel.internalModel.coreModel.setParameterValueById('ParamAngleZ', 0);
                console.log('已重置角度参数');
            } catch (paramError) {
                console.warn('重置角度参数失败:', paramError);
            }
        }
        
        // 恢复idle动画
        if (this.currentModel && this.currentModel.internalModel && this.currentModel.internalModel.motionManager) {
            try {
                // 尝试重新启动idle动画
                if (this.currentModel.internalModel.motionManager.startMotion) {
                    // 这里可以尝试重新启动idle动画，但需要知道具体的idle动画文件
                    if (hasCleared) {
                        console.log('情感效果已清理，模型将恢复默认状态');
                    }
                }
            } catch (motionError) {
                console.warn('恢复idle动画失败:', motionError);
            }
        }
        
        console.log('情感效果清理完成');
    }

    // 设置情感并播放对应的表情和动作
    async setEmotion(emotion) {
        // 如果情感相同，有一定概率随机播放motion
        if (this.currentEmotion === emotion) {
            // 30% 的概率随机播放motion
            if (Math.random() < 0.3) {
                console.log(`情感相同 (${emotion})，随机播放motion`);
                await this.playMotion(emotion);
            } else {
                console.log(`情感相同 (${emotion})，跳过播放`);
                return;
            }
        }
        
        // 防止快速连续点击
        if (this.isEmotionChanging) {
            console.log('情感切换中，忽略新的情感请求');
            return;
        }
        
        console.log(`新情感触发: ${emotion}，当前情感: ${this.currentEmotion}`);
        
        // 设置标志，防止快速连续点击
        this.isEmotionChanging = true;
        
        try {
            console.log(`开始设置新情感: ${emotion}`);
            
            // 清理之前的情感效果（包括定时器等）
            this.clearEmotionEffects();
            
            // 使用官方API清除expression到默认状态
            this.clearExpression();
            
            this.currentEmotion = emotion;
            console.log(`情感已更新为: ${emotion}`);
            
            // 暂停idle动画，防止覆盖我们的动作
            if (this.currentModel && this.currentModel.internalModel && this.currentModel.internalModel.motionManager) {
                try {
                    // 尝试停止所有正在播放的动作
                    if (this.currentModel.internalModel.motionManager.stopAllMotions) {
                        this.currentModel.internalModel.motionManager.stopAllMotions();
                        console.log('已停止idle动画');
                    }
                } catch (motionError) {
                    console.warn('停止idle动画失败:', motionError);
                }
            }
            
            // 播放表情
            await this.playExpression(emotion);
            
            // 播放动作
            await this.playMotion(emotion);
            
            console.log(`情感 ${emotion} 设置完成`);
        } catch (error) {
            console.error(`设置情感 ${emotion} 失败:`, error);
        } finally {
            // 重置标志
            this.isEmotionChanging = false;
        }
    }

    // 加载模型
    async loadModel(modelPath, options = {}) {
        if (!this.pixi_app) {
            throw new Error('PIXI 应用未初始化，请先调用 initPIXI()');
        }

        // 移除当前模型
        if (this.currentModel) {
            this.pixi_app.stage.removeChild(this.currentModel);
            this.currentModel.destroy({ children: true });
        }

        try {
            const model = await Live2DModel.from(modelPath, { autoInteract: false });
            this.currentModel = model;

            // 配置渲染纹理数量以支持更多蒙版
            if (model.internalModel && model.internalModel.renderer && model.internalModel.renderer._clippingManager) {
                model.internalModel.renderer._clippingManager._renderTextureCount = 3;
                if (typeof model.internalModel.renderer._clippingManager.initialize === 'function') {
                    model.internalModel.renderer._clippingManager.initialize(
                        model.internalModel.coreModel,
                        model.internalModel.coreModel.getDrawableCount(),
                        model.internalModel.coreModel.getDrawableMasks(),
                        model.internalModel.coreModel.getDrawableMaskCounts(),
                        3
                    );
                }
                console.log('渲染纹理数量已设置为3');
            }

            // 应用位置和缩放设置
            this.applyModelSettings(model, options);

            // 添加到舞台
            this.pixi_app.stage.addChild(model);

            // 设置交互性
            if (options.dragEnabled !== false) {
                this.setupDragAndDrop(model);
            }

            // 设置滚轮缩放
            if (options.wheelEnabled !== false) {
                this.setupWheelZoom(model);
            }

            // 启用鼠标跟踪
            if (options.mouseTracking !== false) {
                this.enableMouseTracking(model);
            }

            // 设置 HTML 锁定图标
            this.setupHTMLLockIcon(model);

            // 加载情感映射
            if (options.loadEmotionMapping !== false) {
                if (model.internalModel && model.internalModel.settings && model.internalModel.settings.json && model.internalModel.settings.json.FileReferences) {
                    this.emotionMapping = model.internalModel.settings.json.FileReferences;
                    console.log("已从模型配置中提取情感映射:", this.emotionMapping);
                } else {
                    console.warn("模型配置中未找到FileReferences，无法加载情感映射");
                }
            }

            // 调用回调函数
            if (this.onModelLoaded) {
                this.onModelLoaded(model, modelPath);
            }

            return model;
        } catch (error) {
            console.error('加载模型失败:', error);
            throw error;
        }
    }

    // 应用模型设置
    applyModelSettings(model, options) {
        const { preferences, isMobile = false } = options;

        if (isMobile) {
            // 移动端设置
            const scale = Math.min(
                0.5,
                window.innerHeight * 1.3 / 4000,
                window.innerWidth * 1.2 / 2000
            );
            model.scale.set(scale);
            model.x = this.pixi_app.renderer.width * 0.5;
            model.y = this.pixi_app.renderer.height * 0.28;
            model.anchor.set(0.5, 0.1);
        } else {
            // 桌面端设置
            if (preferences && preferences.scale && preferences.position) {
                // 使用保存的偏好设置
                model.scale.set(preferences.scale.x, preferences.scale.y);
                model.x = preferences.position.x;
                model.y = preferences.position.y;
            } else {
                // 使用默认设置
                const scale = Math.min(
                    0.5,
                    (window.innerHeight * 0.75) / 7000,
                    (window.innerWidth * 0.6) / 7000
                );
                model.scale.set(scale);
                model.x = this.pixi_app.renderer.width;
                model.y = this.pixi_app.renderer.height;
            }
            model.anchor.set(0.65, 0.75);
        }
    }

    // 设置拖拽功能
    setupDragAndDrop(model) {
        model.interactive = true;
        this.pixi_app.stage.interactive = true;
        this.pixi_app.stage.hitArea = this.pixi_app.screen;

        let isDragging = false;
        let dragStartPos = new PIXI.Point();

        model.on('pointerdown', (event) => {
            if (this.isLocked) return;
            isDragging = true;
            this.isFocusing = false; // 拖拽时禁用聚焦
            const globalPos = event.data.global;
            dragStartPos.x = globalPos.x - model.x;
            dragStartPos.y = globalPos.y - model.y;
            document.getElementById('live2d-canvas').style.cursor = 'grabbing';
        });

        const onDragEnd = () => {
            if (isDragging) {
                isDragging = false;
                document.getElementById('live2d-canvas').style.cursor = 'grab';
            }
        };

        this.pixi_app.stage.on('pointerup', onDragEnd);
        this.pixi_app.stage.on('pointerupoutside', onDragEnd);

        this.pixi_app.stage.on('pointermove', (event) => {
            if (isDragging) {
                const newPosition = event.data.global;
                model.x = newPosition.x - dragStartPos.x;
                model.y = newPosition.y - dragStartPos.y;
            }
        });
    }

    // 设置滚轮缩放
    setupWheelZoom(model) {
        const onWheelScroll = (event) => {
            if (this.isLocked || !this.currentModel) return;
            event.preventDefault();
            const scaleFactor = 1.1;
            const oldScale = this.currentModel.scale.x;
            let newScale = event.deltaY < 0 ? oldScale * scaleFactor : oldScale / scaleFactor;
            this.currentModel.scale.set(newScale);
        };

        const view = this.pixi_app.view;
        if (view.lastWheelListener) {
            view.removeEventListener('wheel', view.lastWheelListener);
        }
        view.addEventListener('wheel', onWheelScroll, { passive: false });
        view.lastWheelListener = onWheelScroll;
    }
    
    // 设置 HTML 锁形图标
    setupHTMLLockIcon(model) {
        const container = document.getElementById('live2d-canvas');
        
        // 在 l2d_manager 等页面，默认解锁并可交互
        if (!document.getElementById('chat-container')) {
            this.isLocked = false;
            container.style.pointerEvents = 'auto';
            return;
        }

        const lockIcon = document.createElement('div');
        lockIcon.id = 'live2d-lock-icon';
        lockIcon.innerText = this.isLocked ? '🔒' : '🔓';
        Object.assign(lockIcon.style, {
            position: 'fixed',
            zIndex: '30',
            fontSize: '24px',
            cursor: 'pointer',
            userSelect: 'none',
            textShadow: '0 0 4px black',
            pointerEvents: 'auto',
            display: 'none' // 默认隐藏
        });

        document.body.appendChild(lockIcon);

        lockIcon.addEventListener('click', (e) => {
            e.stopPropagation();
            this.isLocked = !this.isLocked;
            lockIcon.innerText = this.isLocked ? '🔒' : '🔓';

            if (this.isLocked) {
                container.style.pointerEvents = 'none';
            } else {
                container.style.pointerEvents = 'auto';
            }
        });

        // 初始状态
        container.style.pointerEvents = this.isLocked ? 'none' : 'auto';

        // 持续更新图标位置
        this.pixi_app.ticker.add(() => {
            const bounds = model.getBounds();
            const screenWidth = window.innerWidth;
            const screenHeight = window.innerHeight;

            const targetX = bounds.right*0.75 + bounds.left*0.25;
            const targetY = (bounds.top+bounds.bottom)/2;

            lockIcon.style.left = `${Math.min(targetX, screenWidth - 40)}px`;
            lockIcon.style.top = `${Math.min(targetY, screenHeight - 40)}px`;
        });
    }

    // 启用鼠标跟踪以检测与模型的接近度
    enableMouseTracking(model, options = {}) {
        const { threshold = 70 } = options;

        this.pixi_app.stage.on('pointermove', (event) => {
            const lockIcon = document.getElementById('live2d-lock-icon');
            const pointer = event.data.global;
            
            // 在拖拽期间不执行任何操作
            if (model.interactive && model.dragging) {
                this.isFocusing = false;
                if (lockIcon) lockIcon.style.display = 'none';
                return;
            }

            const bounds = model.getBounds();
            const dx = Math.max(bounds.left - pointer.x, 0, pointer.x - bounds.right);
            const dy = Math.max(bounds.top - pointer.y, 0, pointer.y - bounds.bottom);
            const distance = Math.sqrt(dx * dx + dy * dy);

            if (distance < threshold) {
                this.isFocusing = true;
                if (lockIcon) lockIcon.style.display = 'block';
            } else {
                this.isFocusing = false;
                if (lockIcon) lockIcon.style.display = 'none';
            }

            if (this.isFocusing) {
                model.focus(pointer.x, pointer.y);
            }
        });
    }

    // 获取当前模型
    getCurrentModel() {
        return this.currentModel;
    }

    // 获取当前情感映射
    getEmotionMapping() {
        return this.emotionMapping;
    }

    // 获取 PIXI 应用
    getPIXIApp() {
        return this.pixi_app;
    }
}

// 创建全局 Live2D 管理器实例
window.Live2DManager = Live2DManager;
window.live2dManager = new Live2DManager();

// 兼容性：保持原有的全局变量和函数
window.LanLan1 = window.LanLan1 || {};
window.LanLan1.setEmotion = (emotion) => window.live2dManager.setEmotion(emotion);
window.LanLan1.playExpression = (emotion) => window.live2dManager.playExpression(emotion);
window.LanLan1.playMotion = (emotion) => window.live2dManager.playMotion(emotion);
window.LanLan1.clearEmotionEffects = () => window.live2dManager.clearEmotionEffects();
window.LanLan1.clearExpression = () => window.live2dManager.clearExpression();

// 自动初始化（如果存在 cubism4Model 变量）
if (typeof cubism4Model !== 'undefined' && cubism4Model) {
    (async function() {
        try {
            // 初始化 PIXI 应用
            await window.live2dManager.initPIXI('live2d-canvas', 'live2d-container');
            
            // 加载用户偏好
            const preferences = await window.live2dManager.loadUserPreferences();
            
            // 根据模型路径找到对应的偏好设置
            let modelPreferences = null;
            if (preferences && preferences.length > 0) {
                modelPreferences = preferences.find(p => p && p.model_path === cubism4Model);
                if (modelPreferences) {
                    console.log('找到模型偏好设置:', modelPreferences);
                } else {
                    console.log('未找到模型偏好设置，将使用默认设置');
                }
            }
            
            // 加载模型
            await window.live2dManager.loadModel(cubism4Model, {
                preferences: modelPreferences,
                isMobile: window.innerWidth <= 768
            });

            // 设置全局引用（兼容性）
            window.LanLan1.live2dModel = window.live2dManager.getCurrentModel();
            window.LanLan1.currentModel = window.live2dManager.getCurrentModel();
            window.LanLan1.emotionMapping = window.live2dManager.getEmotionMapping();

            console.log('Live2D 管理器自动初始化完成');
        } catch (error) {
            console.error('Live2D 管理器自动初始化失败:', error);
        }
    })();
}
