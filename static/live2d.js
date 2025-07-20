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

// 加载用户偏好
async function loadUserPreferences() {
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

(async function () {
    // 帧率控制函数
    function setupFrameSkipping() {
        // 停止默认的ticker
        pixi_app.ticker.stop();

        // 创建一个新的ticker
        let frameCount = 0;
        const frameSkip = 0; // 跳1帧，即每2帧渲染一次

        // 使用PIXI的shared ticker
        PIXI.Ticker.shared.add(() => {
            frameCount++;
            // 当frameCount是frameSkip+1的倍数时渲染
            // 例如，frameSkip=1时，每当frameCount为2、4、6...时渲染
            if (frameCount % (frameSkip + 1) === 0) {
                pixi_app.render();
            }
        });

        // 启动shared ticker
        PIXI.Ticker.shared.start();
    }


    const pixi_app = new PIXI.Application({
        view: document.getElementById('live2d-canvas'),
        resizeTo: document.getElementById('live2d-container'),
        transparent: true,
        backgroundAlpha: 0
    });
    
    // 加载用户偏好
    const preferences = await loadUserPreferences();
    
    const model = await Live2DModel.from(cubism4Model);  // cubism4Model 是模板变量，在index.html中定义

    // 配置渲染纹理数量以支持更多蒙版
    if (model.internalModel && model.internalModel._clippingManager) {
        // 设置渲染纹理数量为2，支持最多64个蒙版
        model.internalModel._clippingManager._renderTextureCount = 2;
        // 重新初始化蒙版管理器（有些库需要）
        if (typeof model.internalModel._clippingManager.initialize === 'function') {
            model.internalModel._clippingManager.initialize(
                model.internalModel.coreModel,
                model.internalModel.coreModel.getDrawableCount(),
                model.internalModel.coreModel.getDrawableMasks(),
                model.internalModel.coreModel.getDrawableMaskCounts(),
                2 // renderTextureCount
            );
        }
        console.log('渲染纹理数量已设置为2');
    }

    // （可选）如果你还需要设置缓冲区大小，可以保留
    if (model.internalModel && model.internalModel.setClippingMaskBufferSize) {
        model.internalModel.setClippingMaskBufferSize(512); // 例如512
        console.log('蒙版缓冲区大小已设置为512');
    }
    
    if (window.innerWidth <= 768){  //移动端
        // 应用用户偏好或使用默认值
        const scale = Math.min(
            0.5,
            window.innerHeight * 1.3 / 4000,
            window.innerWidth * 1.2 / 2000
        );
        model.scale.set(scale);
        model.x = pixi_app.renderer.width*0.5;
        model.y = pixi_app.renderer.height*0.28;
        model.anchor.set(0.5, 0.1);
        pixi_app.stage.addChild(model);
        window.addEventListener('resize', () => {
            // 更新模型位置
            model.x = pixi_app.renderer.width*0.5;
            model.y = pixi_app.renderer.height*0.28;
        });
    }
    else {
        // 应用用户偏好或使用默认值
        if (preferences.length > 0 && preferences[0].scale && preferences[0].position) {
            model.scale.set(preferences[0].scale.x, preferences[0].scale.y);
            model.x = preferences[0].position.x;
            model.y = preferences[0].position.y;
        } else {
            const scale = Math.min(
                0.5,
                (window.innerHeight * 0.75) / 7000,
                (window.innerWidth * 0.6) / 7000
            );
            model.scale.set(scale);
            model.x = pixi_app.renderer.width;
            model.y = pixi_app.renderer.height;
        }
        model.anchor.set(0.65, 0.75);
        pixi_app.stage.addChild(model);

        window.addEventListener('resize', () => {
            // 更新模型位置
            if (preferences.length > 0 && preferences[0].position) {
                model.x = preferences[0].position.x;
                model.y = preferences[0].position.y;
            } else {
                model.x = pixi_app.renderer.width;
                model.y = pixi_app.renderer.height;
            }
        });
        // setupFrameSkipping();
    }
    window.LanLan1 = window.LanLan1 || {};
    window.LanLan1.live2dModel = model;
    /*for (const func in expressions_map) {
        originalFunc = expressions_map[func];
        expressions_map[func] = (function(originalFunc, model) {
            return function() {
                return originalFunc(model);
            };
            })(expressions_map[func], model);
    }
    window.LanLan1.registered_expressions = expressions_map*/
})();
