function init_app(){
    const micButton = document.getElementById('micButton');
    const muteButton = document.getElementById('muteButton');
    const screenButton = document.getElementById('screenButton');
    const stopButton = document.getElementById('stopButton');
    const resetSessionButton = document.getElementById('resetSessionButton');
    const statusElement = document.getElementById('status');
    const chatContainer = document.getElementById('chatContainer');
    const textInputBox = document.getElementById('textInputBox');
    const textSendButton = document.getElementById('textSendButton');
    const modeHint = document.getElementById('mode-hint');

    let audioContext;
    let workletNode;
    let stream;
    let isRecording = false;
    let socket;
    let currentGeminiMessage = null;
    let audioPlayerContext = null;
    let videoTrack, videoSenderInterval;
    let audioBufferQueue = [];
    let isPlaying = false;
    let audioStartTime = 0;
    let scheduledSources = [];
    let animationFrameId;
    let seqCounter = 0;
    let globalAnalyser = null;
    let lipSyncActive = false;
    let screenCaptureStream = null; // 暂存屏幕共享stream，不再需要每次都弹窗选择共享区域，方便自动重连
    // 新增：当前选择的麦克风设备ID
    let selectedMicrophoneId = null;
    
    // 麦克风静音检测相关变量
    let silenceDetectionTimer = null;
    let hasSoundDetected = false;
    let inputAnalyser = null;
    
    // 模式管理
    let isTextSessionActive = false;
    let isSwitchingMode = false; // 新增：模式切换标志
    
    // WebSocket心跳保活
    let heartbeatInterval = null;
    const HEARTBEAT_INTERVAL = 30000; // 30秒发送一次心跳

    function isMobile() {
      return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
        navigator.userAgent
      );
    }

    // 建立WebSocket连接
    function connectWebSocket() {
        const protocol = window.location.protocol === "https:" ? "wss" : "ws";
        socket = new WebSocket(`${protocol}://${window.location.host}/ws/${lanlan_config.lanlan_name}`);

        socket.onopen = () => {
            console.log('WebSocket连接已建立');
            
            // 启动心跳保活机制
            if (heartbeatInterval) {
                clearInterval(heartbeatInterval);
            }
            heartbeatInterval = setInterval(() => {
                if (socket.readyState === WebSocket.OPEN) {
                    socket.send(JSON.stringify({
                        action: 'ping'
                    }));
                    console.log('发送心跳ping');
                }
            }, HEARTBEAT_INTERVAL);
            console.log('心跳保活机制已启动');
        };

        socket.onmessage = (event) => {
            if (event.data instanceof Blob) {
                // 处理二进制音频数据
                console.log("收到新的音频块")
                handleAudioBlob(event.data);
                return;
            }

            try {
                const response = JSON.parse(event.data);
                console.log('WebSocket收到消息:', response);

                if (response.type === 'gemini_response') {
                    // 检查是否是新消息的开始
                    const isNewMessage = response.isNewMessage || false;
                    appendMessage(response.text, 'gemini', isNewMessage);
                } else if (response.type === 'user_transcript') {
                    // 处理用户语音转录，显示在聊天界面
                    appendMessage(response.text, 'user', true);
                } else if (response.type === 'user_activity') {
                    clearAudioQueue();
                } if (response.type === 'cozy_audio') {
                    // 处理音频响应
                    console.log("收到新的音频头")
                    const isNewMessage = response.isNewMessage || false;

                    if (isNewMessage) {
                        // 如果是新消息，清空当前音频队列
                        clearAudioQueue();
                    }

                    // 根据数据格式选择处理方法
                    if (response.format === 'base64') {
                        handleBase64Audio(response.audioData, isNewMessage);
                    }
                } else if (response.type === 'status') {
                    // 如果正在切换模式且收到"已离开"消息，则忽略
                    if (isSwitchingMode && response.message.includes('已离开')) {
                        console.log('模式切换中，忽略"已离开"状态消息');
                        return;
                    }
                    statusElement.textContent = response.message;
                    if (response.message === `${lanlan_config.lanlan_name}失联了，即将重启！`){
                        if (isRecording === false && !isTextSessionActive){
                            statusElement.textContent = `${lanlan_config.lanlan_name}正在打盹...`;
                        } else if (isTextSessionActive) {
                            statusElement.textContent = `正在文本聊天中...`;
                        } else {
                            stopRecording();
                            if (socket.readyState === WebSocket.OPEN) {
                                socket.send(JSON.stringify({
                                    action: 'end_session'
                                }));
                            }
                            hideLive2d();
                            micButton.disabled = true;
                            muteButton.disabled = true;
                            screenButton.disabled = true;
                            stopButton.disabled = true;
                            resetSessionButton.disabled = true;

                            setTimeout(async () => {
                                try {
                                    // 发送start session事件
                                    socket.send(JSON.stringify({
                                        action: 'start_session',
                                        input_type: 'audio'
                                    }));
                                    
                                    // 等待2.5秒后执行后续操作
                                    await new Promise(resolve => setTimeout(resolve, 2500));
                                    
                                    showLive2d();
                                    await startMicCapture();
                                    if (screenCaptureStream != null){
                                        await startScreenSharing();
                                    }
                                    statusElement.textContent = `重启完成，${lanlan_config.lanlan_name}回来了！`;
                                } catch (error) {
                                    console.error("重启时出错:", error);
                                    statusElement.textContent = "重启失败，请手动刷新。";
                                }
                            }, 7500); // 7.5秒后执行
                        }
                    }
                } else if (response.type === 'expression') {
                    window.LanLan1.registered_expressions[response.message]();
                } else if (response.type === 'system' && response.data === 'turn end') {
                    console.log('收到turn end事件，开始情感分析');
                    console.log('当前currentGeminiMessage:', currentGeminiMessage);
                    // 消息完成时进行情感分析
                    if (currentGeminiMessage) {
                        const fullText = currentGeminiMessage.textContent.replace(/^\[\d{2}:\d{2}:\d{2}\] 🎀 /, '');
                        setTimeout(async () => {
                            const emotionResult = await analyzeEmotion(fullText);
                            if (emotionResult && emotionResult.emotion) {
                                console.log('消息完成，情感分析结果:', emotionResult);
                                applyEmotion(emotionResult.emotion);
                            }
                        }, 100);
                    }
                }
            } catch (error) {
                console.error('处理消息失败:', error);
            }
        };

        socket.onclose = () => {
            console.log('WebSocket连接已关闭');
            
            // 清理心跳定时器
            if (heartbeatInterval) {
                clearInterval(heartbeatInterval);
                heartbeatInterval = null;
                console.log('心跳保活机制已停止');
            }
            
            // 重置文本session状态，因为后端会清理session
            if (isTextSessionActive) {
                isTextSessionActive = false;
                console.log('WebSocket断开，已重置文本session状态');
            }
            // 尝试重新连接
            setTimeout(connectWebSocket, 3000);
        };

        socket.onerror = (error) => {
            console.error('WebSocket错误:', error);
        };
    }

    // 初始化连接
    connectWebSocket();

    // 添加消息到聊天界面
    function appendMessage(text, sender, isNewMessage = true) {
        function getCurrentTimeString() {
            return new Date().toLocaleTimeString('en-US', {
                hour12: false,
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
            });
        }

        if (sender === 'gemini' && !isNewMessage && currentGeminiMessage) {
            // 追加到现有的Gemini消息
            // currentGeminiMessage.textContent += text;
            currentGeminiMessage.insertAdjacentHTML('beforeend', text.replaceAll('\n', '<br>'));
        } else {
            // 创建新消息
            const messageDiv = document.createElement('div');
            messageDiv.classList.add('message', sender);
            
            // 根据sender设置不同的图标
            const icon = sender === 'user' ? '💬' : '🎀';
            messageDiv.textContent = "[" + getCurrentTimeString() + "] " + icon + " " + text;
            chatContainer.appendChild(messageDiv);

            // 如果是Gemini消息，更新当前消息引用
            if (sender === 'gemini') {
                currentGeminiMessage = messageDiv;
            }
        }
        chatContainer.scrollTop = chatContainer.scrollHeight;
    }


        // 全局变量用于缓存麦克风列表和缓存时间戳
    let cachedMicrophones = null;
    let cacheTimestamp = 0;
    const CACHE_DURATION = 30000; // 缓存30秒

    // 初始化麦克风选择器
    async function initMicrophoneSelector() {
        const toggleButton = document.getElementById('toggle-mic-selector');
        const micList = document.getElementById('mic-list');
        const micContainer = document.getElementById('mic-container');
        
        // 检查元素是否存在
        if (!toggleButton || !micList) {
            console.error('麦克风选择器元素未找到');
            return;
        }
        
        // 添加调试信息
        console.log('麦克风选择器初始化 - 元素已找到');
        
        // 页面加载时预加载麦克风列表，减少首次点击的延迟
        await loadMicrophoneList(true); // true表示预加载模式
        
        // 点击切换按钮时显示/隐藏麦克风列表
        toggleButton.addEventListener('click', async (event) => {
            // 添加调试信息
            console.log('麦克风选择器按钮被点击');
            event.stopPropagation();
            if (micList.classList.contains('show')) {
                micList.classList.remove('show');
                // 列表收起时，箭头变为向右
                toggleButton.textContent = '▶';
            } else {
                try {
                    // 快速显示缓存的列表
                    if (cachedMicrophones && (Date.now() - cacheTimestamp < CACHE_DURATION)) {
                        renderMicrophoneList(cachedMicrophones);
                        micList.classList.add('show');
                        toggleButton.textContent = '◀';
                        console.log('使用缓存的麦克风列表');
                        
                        // 后台刷新缓存，不阻塞UI
                        setTimeout(() => {
                            loadMicrophoneList();
                        }, 0);
                    } else {
                        // 缓存过期或不存在，重新加载
                        await loadMicrophoneList();
                        micList.classList.add('show');
                        toggleButton.textContent = '◀';
                    }
                    // 添加调试信息
                    console.log('麦克风列表已显示');
                } catch (error) {
                    console.error('加载麦克风列表失败:', error);
                }
            }
        });
        
        // 修复：确保点击事件不会被父元素拦截
        if (micContainer) {
            micContainer.addEventListener('click', (event) => {
                event.stopPropagation();
            });
        }
        
        // 点击页面其他地方时隐藏麦克风列表
        document.addEventListener('click', (event) => {
            if (!micList.contains(event.target) && event.target !== toggleButton) {
                micList.classList.remove('show');
                // 列表收起时，箭头变为向右
                toggleButton.textContent = '▶';
            }
        });
        
        // 尝试从本地存储或配置中加载上次选择的麦克风
        await loadSelectedMicrophone();
    }
    
    // 加载麦克风列表
    async function loadMicrophoneList(isPreload = false) {
        try {
            // 获取所有媒体设备
            const devices = await navigator.mediaDevices.enumerateDevices();
            const audioInputs = devices.filter(device => device.kind === 'audioinput');
            
            // 缓存结果
            cachedMicrophones = audioInputs;
            cacheTimestamp = Date.now();
            
            // 仅在非预加载模式或没有麦克风时渲染UI
            if (!isPreload || audioInputs.length === 0) {
                renderMicrophoneList(audioInputs);
            }
        } catch (err) {
            console.error('获取麦克风设备列表失败:', err);
            
            if (!isPreload) {
                const micList = document.getElementById('mic-list');
                micList.innerHTML = '';
                const errorItem = document.createElement('div');
                errorItem.className = 'mic-option';
                errorItem.textContent = '获取麦克风列表失败';
                micList.appendChild(errorItem);
            }
        }
    }

    // 渲染麦克风列表到UI
    function renderMicrophoneList(audioInputs) {
        const micList = document.getElementById('mic-list');
        micList.innerHTML = '';
        
        // 如果没有麦克风设备
        if (audioInputs.length === 0) {
            const noMicItem = document.createElement('div');
            noMicItem.className = 'mic-option';
            noMicItem.textContent = '没有检测到麦克风设备';
            noMicItem.disabled = true;
            micList.appendChild(noMicItem);
            return;
        }
        
        // 添加默认麦克风选项（使用系统默认）
        const defaultOption = document.createElement('button');
        defaultOption.className = `mic-option ${selectedMicrophoneId === null ? 'selected' : ''} default`;
        defaultOption.textContent = '系统默认麦克风';
        defaultOption.addEventListener('click', () => selectMicrophone(null));
        micList.appendChild(defaultOption);
        
        // 添加分隔线
        const separator = document.createElement('div');
        separator.style.height = '1px';
        separator.style.backgroundColor = '#eee';
        separator.style.margin = '5px 0';
        micList.appendChild(separator);
        
        // 添加各个麦克风设备选项
        audioInputs.forEach(device => {
            const option = document.createElement('button');
            option.className = `mic-option ${selectedMicrophoneId === device.deviceId ? 'selected' : ''}`;
            option.textContent = device.label || `麦克风 ${micList.children.length - 1}`;
            option.dataset.deviceId = device.deviceId; // 存储设备ID
            option.addEventListener('click', () => selectMicrophone(device.deviceId));
            micList.appendChild(option);
        });
    }
    
    // 选择麦克风
    async function selectMicrophone(deviceId) {
        selectedMicrophoneId = deviceId;
        
        // 更新UI选中状态
        const options = document.querySelectorAll('.mic-option');
        options.forEach(option => {
            if ((option.classList.contains('default') && deviceId === null) || 
                (option.dataset.deviceId === deviceId && deviceId !== null)) {
                option.classList.add('selected');
            } else {
                option.classList.remove('selected');
            }
        });
        
        // 保存选择到服务器
        await saveSelectedMicrophone(deviceId);
        
        // 如果正在录音，重启录音以使用新选择的麦克风
        if (isRecording) {
            const wasRecording = isRecording;
            await stopMicCapture();
            if (wasRecording) {
                await startMicCapture();
            }
        }
    }
    
    // 保存选择的麦克风到服务器
    async function saveSelectedMicrophone(deviceId) {
        try {
            const response = await fetch('/api/characters/set_microphone', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    microphone_id: deviceId
                })
            });
            
            if (!response.ok) {
                console.error('保存麦克风选择失败');
            }
        } catch (err) {
            console.error('保存麦克风选择时发生错误:', err);
        }
    }
    
    // 加载上次选择的麦克风
    async function loadSelectedMicrophone() {
        try {
            const response = await fetch('/api/characters/get_microphone');
            if (response.ok) {
                const data = await response.json();
                selectedMicrophoneId = data.microphone_id || null;
            }
        } catch (err) {
            console.error('加载麦克风选择失败:', err);
            selectedMicrophoneId = null;
        }
    }
    
    // 开麦，按钮on click
    async function startMicCapture() {
        try {
            // 开始录音前添加录音状态类到两个按钮
            micButton.classList.add('recording');
            // 同步更新麦克风选择器按钮样式
            const toggleButton = document.getElementById('toggle-mic-selector');
            if (toggleButton) {
                toggleButton.classList.add('recording');
            }
            
            if (!audioPlayerContext) {
                audioPlayerContext = new (window.AudioContext || window.webkitAudioContext)();
            }

            if (audioPlayerContext.state === 'suspended') {
                await audioPlayerContext.resume();
            }

            // 获取麦克风流，使用选择的麦克风设备ID
            const constraints = {
                audio: selectedMicrophoneId ? { deviceId: { exact: selectedMicrophoneId } } : true
            };
            
            stream = await navigator.mediaDevices.getUserMedia(constraints);

            // 检查音频轨道状态
            const audioTracks = stream.getAudioTracks();
            console.log("音频轨道数量:", audioTracks.length);
            console.log("音频轨道状态:", audioTracks.map(track => ({
                label: track.label,
                enabled: track.enabled,
                muted: track.muted,
                readyState: track.readyState
            })));

            if (audioTracks.length === 0) {
                console.error("没有可用的音频轨道");
                statusElement.textContent = '无法访问麦克风';
                return;
            }

            await startAudioWorklet(stream);

            micButton.disabled = true;
            muteButton.disabled = false;
            screenButton.disabled = false;
            stopButton.disabled = true;
            resetSessionButton.disabled = false;
            statusElement.textContent = '正在语音...';
        } catch (err) {
            console.error('获取麦克风权限失败:', err);
            statusElement.textContent = '无法访问麦克风';
            // 失败时移除两个按钮的录音状态类
            micButton.classList.remove('recording');
            const toggleButton = document.getElementById('toggle-mic-selector');
            if (toggleButton) {
                toggleButton.classList.remove('recording');
            }
        }
    }

    async function stopMicCapture(){ // 闭麦，按钮on click
        isSwitchingMode = true; // 开始模式切换（从语音切换到待机/文本模式）
        
        // 停止录音时移除两个按钮的录音状态类
        micButton.classList.remove('recording');
        const toggleButton = document.getElementById('toggle-mic-selector');
        if (toggleButton) {
            toggleButton.classList.remove('recording');
        }
        
        stopRecording();
        micButton.disabled = false;
        muteButton.disabled = true;
        screenButton.disabled = true;
        stopButton.disabled = true;
        resetSessionButton.disabled = false;
        
        // 显示文本输入区
        const textInputArea = document.getElementById('text-input-area');
        textInputArea.classList.remove('hidden');
        
        // 如果是从语音模式切换回来，显示待机状态
        statusElement.textContent = `${lanlan_config.lanlan_name}待机中...`;
        
        // 延迟重置模式切换标志，确保"已离开"消息已经被忽略
        setTimeout(() => {
            isSwitchingMode = false;
        }, 500);
    }

    async function getMobileCameraStream() {
      const makeConstraints = (facing) => ({
        video: {
          facingMode: facing,
          frameRate: { ideal: 1, max: 1 },
        },
        audio: false,
      });

      const attempts = [
        { label: 'rear', constraints: makeConstraints({ ideal: 'environment' }) },
        { label: 'front', constraints: makeConstraints('user') },
        { label: 'any', constraints: { video: { frameRate: { ideal: 1, max: 1 } }, audio: false } },
      ];

      let lastError;

      for (const attempt of attempts) {
        try {
          console.log(`Trying ${attempt.label} camera @ ${1}fps…`);
          return await navigator.mediaDevices.getUserMedia(attempt.constraints);
        } catch (err) {
          console.warn(`${attempt.label} failed →`, err);
          statusElement.textContent = err;
          return err;
        }
      }
    }

    async function startScreenSharing(){ // 分享屏幕，按钮on click
        // 检查是否在录音状态
        if (!isRecording) {
            statusElement.textContent = '请先开启麦克风录音！';
            return;
        }
        
        try {
            // 初始化音频播放上下文
            showLive2d();
            if (!audioPlayerContext) {
                audioPlayerContext = new (window.AudioContext || window.webkitAudioContext)();
            }

            // 如果上下文被暂停，则恢复它
            if (audioPlayerContext.state === 'suspended') {
                await audioPlayerContext.resume();
            }
            let captureStream;

            if (screenCaptureStream == null){
                if (isMobile()) {
                // On mobile we capture the *camera* instead of the screen.
                // `environment` is the rear camera (iOS + many Androids). If that's not
                // available the UA will fall back to any camera it has.
                screenCaptureStream = await getMobileCameraStream();

                } else {
                // Desktop/laptop: capture the user's chosen screen / window / tab.
                screenCaptureStream = await navigator.mediaDevices.getDisplayMedia({
                    video: {
                    cursor: 'always',
                    frameRate: 1,
                    },
                    audio: false,
                });
                }
            }
            startScreenVideoStreaming(screenCaptureStream, isMobile() ? 'camera' : 'screen');

            micButton.disabled = true;
            muteButton.disabled = false;
            screenButton.disabled = true;
            stopButton.disabled = false;
            resetSessionButton.disabled = false;

            // 当用户停止共享屏幕时
            screenCaptureStream.getVideoTracks()[0].onended = stopScreening;

            // 获取麦克风流
            if (!isRecording) statusElement.textContent = '没开麦啊喂！';
          } catch (err) {
            console.error(isMobile() ? '摄像头访问失败:' : '屏幕共享失败:', err);
            console.error('启动失败 →', err);
            let hint = '';
            switch (err.name) {
              case 'NotAllowedError':
                hint = '请检查 iOS 设置 → Safari → 摄像头 权限是否为"允许"';
                break;
              case 'NotFoundError':
                hint = '未检测到摄像头设备';
                break;
              case 'NotReadableError':
              case 'AbortError':
                hint = '摄像头被其它应用占用？关闭扫码/拍照应用后重试';
                break;
            }
            statusElement.textContent = `${err.name}: ${err.message}${hint ? `\n${hint}` : ''}`;
          }
    }

    async function stopScreenSharing(){ // 停止共享，按钮on click
        stopScreening();
        micButton.disabled = true;
        muteButton.disabled = false;
        screenButton.disabled = false;
        stopButton.disabled = true;
        resetSessionButton.disabled = false;
        screenCaptureStream = null;
        statusElement.textContent = '正在语音...';
    }

    window.switchMicCapture = async () => {
        if (muteButton.disabled) {
            await startMicCapture();
        } else {
            await stopMicCapture();
        }
    }
    window.switchScreenSharing = async () => {
        if (stopButton.disabled) {
            // 检查是否在录音状态
            if (!isRecording) {
                statusElement.textContent = '请先开启麦克风！';
                return;
            }
            await startScreenSharing();
        } else {
            await stopScreenSharing();
        }
    }

    // 开始麦克风录音
    micButton.addEventListener('click', async () => {
        // 如果有活跃的文本会话，先结束它
        if (isTextSessionActive) {
            isSwitchingMode = true; // 开始模式切换
            if (socket.readyState === WebSocket.OPEN) {
                socket.send(JSON.stringify({
                    action: 'end_session'
                }));
            }
            isTextSessionActive = false;
            statusElement.textContent = '正在切换到语音模式...';
            // 增加等待时间，确保后端完全清理资源
            await new Promise(resolve => setTimeout(resolve, 1500)); // 从500ms增加到1500ms
        }
        
        // 隐藏文本输入区
        const textInputArea = document.getElementById('text-input-area');
        textInputArea.classList.add('hidden');
        
        // 立即禁用所有语音按钮
        micButton.disabled = true;
        muteButton.disabled = true;
        screenButton.disabled = true;
        stopButton.disabled = true;
        resetSessionButton.disabled = true;
        
        // 发送start session事件
        if (socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({
                action: 'start_session',
                input_type: 'audio'
            }));
        }
        
        statusElement.textContent = '正在初始化麦克风...';
        
        // 3秒后执行正常的麦克风启动逻辑
        setTimeout(async () => {
            try {
                // 显示Live2D
                showLive2d();
                await startMicCapture();
                isSwitchingMode = false; // 模式切换完成
            } catch (error) {
                console.error('启动麦克风失败:', error);
                // 如果失败，恢复按钮状态和文本输入区
                micButton.disabled = false;
                muteButton.disabled = true;
                screenButton.disabled = true;
                stopButton.disabled = true;
                resetSessionButton.disabled = false;
                textInputArea.classList.remove('hidden');
                statusElement.textContent = '麦克风启动失败';
                isSwitchingMode = false; // 切换失败，重置标志
            }
        }, 2500);
    });

    // 开始屏幕共享
    screenButton.addEventListener('click', startScreenSharing);

    // 停止屏幕共享
    stopButton.addEventListener('click', stopScreenSharing);

    // 停止对话
    muteButton.addEventListener('click', stopMicCapture);

    resetSessionButton.addEventListener('click', () => {
        isSwitchingMode = true; // 开始重置会话（也是一种模式切换）
        hideLive2d()
        if (socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({
                action: 'end_session'
            }));
        }
        stopRecording();
        clearAudioQueue();
        
        // 重置所有状态
        isTextSessionActive = false;
        
        // 显示文本输入区
        const textInputArea = document.getElementById('text-input-area');
        textInputArea.classList.remove('hidden');
        
        // 启用所有输入
        micButton.disabled = false;
        textSendButton.disabled = false;
        textInputBox.disabled = false;
        
        // 禁用语音控制按钮
        muteButton.disabled = true;
        screenButton.disabled = true;
        stopButton.disabled = true;
        resetSessionButton.disabled = true;
        
        // 更新提示文字
        modeHint.textContent = '文本聊天模式 - 直接输入消息发送';
        modeHint.classList.remove('voice-active');
        
        statusElement.textContent = '会话已结束';
        
        // 延迟重置模式切换标志，确保"已离开"消息已经被忽略
        setTimeout(() => {
            isSwitchingMode = false;
        }, 500);
    });
    
    // 文本发送按钮事件
    textSendButton.addEventListener('click', async () => {
        const text = textInputBox.value.trim();
        if (!text) {
            return; // 静默返回，不显示错误
        }
        
        // 如果还没有启动session，先启动
        if (!isTextSessionActive) {
            // 临时禁用文本输入
            textSendButton.disabled = true;
            textInputBox.disabled = true;
            resetSessionButton.disabled = false;
            
            // 启动文本session
            if (socket.readyState === WebSocket.OPEN) {
                socket.send(JSON.stringify({
                    action: 'start_session',
                    input_type: 'text',
                    new_session: false
                }));
            }
            
            statusElement.textContent = '正在初始化文本对话...';
            modeHint.textContent = '正在连接...';
            
            // 等待session初始化
            await new Promise(resolve => setTimeout(resolve, 2500));
            
            isTextSessionActive = true;
            showLive2d();
            
            // 重新启用文本输入
            textSendButton.disabled = false;
            textInputBox.disabled = false;
            
            statusElement.textContent = '正在文本聊天中';
            modeHint.textContent = '文本聊天模式 - 可点击"开始语音"切换到语音模式';
        }
        
        // 发送文本消息
        if (socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({
                action: 'stream_data',
                data: text,
                input_type: 'text'
            }));
            
            // 清空输入框
            textInputBox.value = '';
            
            // 在聊天界面显示用户消息
            appendMessage(text, 'user', true);
            
            statusElement.textContent = '正在文本聊天中';
        } else {
            statusElement.textContent = 'WebSocket未连接！';
        }
    });
    
    // 支持Enter键发送（Shift+Enter换行）
    textInputBox.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            textSendButton.click();
        }
    });

    // 情感分析功能
    async function analyzeEmotion(text) {
        console.log('analyzeEmotion被调用，文本:', text);
        try {
            const response = await fetch('/api/emotion/analysis', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    text: text
                })
            });

            if (!response.ok) {
                console.warn('情感分析请求失败:', response.status);
                return null;
            }

            const result = await response.json();
            console.log('情感分析API返回结果:', result);
            
            if (result.error) {
                console.warn('情感分析错误:', result.error);
                return null;
            }

            return result;
        } catch (error) {
            console.error('情感分析请求异常:', error);
            return null;
        }
    }

    // 应用情感到Live2D模型
    function applyEmotion(emotion) {
        if (window.LanLan1 && window.LanLan1.setEmotion) {
            console.log('调用window.LanLan1.setEmotion:', emotion);
            window.LanLan1.setEmotion(emotion);
        } else {
            console.warn('情感功能未初始化');
        }
    }

    // 启动麦克风静音检测
    function startSilenceDetection() {
        // 重置检测状态
        hasSoundDetected = false;
        
        // 清除之前的定时器(如果有)
        if (silenceDetectionTimer) {
            clearTimeout(silenceDetectionTimer);
        }
        
        // 启动5秒定时器
        silenceDetectionTimer = setTimeout(() => {
            if (!hasSoundDetected && isRecording) {
                statusElement.textContent = '⚠️ 麦克风无声音，请检查麦克风设置';
                console.warn('麦克风静音检测：5秒内未检测到声音');
            }
        }, 5000);
    }
    
    // 停止麦克风静音检测
    function stopSilenceDetection() {
        if (silenceDetectionTimer) {
            clearTimeout(silenceDetectionTimer);
            silenceDetectionTimer = null;
        }
        hasSoundDetected = false;
    }
    
    // 监测音频输入音量
    function monitorInputVolume() {
        if (!inputAnalyser || !isRecording) {
            return;
        }
        
        const dataArray = new Uint8Array(inputAnalyser.fftSize);
        inputAnalyser.getByteTimeDomainData(dataArray);
        
        // 计算音量(RMS)
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
            const val = (dataArray[i] - 128) / 128.0;
            sum += val * val;
        }
        const rms = Math.sqrt(sum / dataArray.length);
        
        // 如果音量超过阈值(0.01),认为检测到声音
        if (rms > 0.01) {
            if (!hasSoundDetected) {
                hasSoundDetected = true;
                console.log('麦克风静音检测：检测到声音，RMS =', rms);
            }
        }
        
        // 持续监测
        if (isRecording) {
            requestAnimationFrame(monitorInputVolume);
        }
    }

    // 使用AudioWorklet开始音频处理
    async function startAudioWorklet(stream) {
        isRecording = true;

        // 创建音频上下文
        audioContext = new AudioContext();
        console.log("音频上下文采样率:", audioContext.sampleRate);

        // 创建媒体流源
        const source = audioContext.createMediaStreamSource(stream);
        
        // 创建analyser节点用于监测输入音量
        inputAnalyser = audioContext.createAnalyser();
        inputAnalyser.fftSize = 2048;
        inputAnalyser.smoothingTimeConstant = 0.8;
        
        // 连接source到analyser(用于音量检测)
        source.connect(inputAnalyser);

        try {
            // 加载AudioWorklet处理器
            await audioContext.audioWorklet.addModule('/static/audio-processor.js');

            // 创建AudioWorkletNode
            workletNode = new AudioWorkletNode(audioContext, 'audio-processor', {
                processorOptions: {
                    originalSampleRate: audioContext.sampleRate,
                    targetSampleRate: 16000
                }
            });

            // 监听处理器发送的消息
            workletNode.port.onmessage = (event) => {
                const audioData = event.data;

                // 新增逻辑：focus_mode为true且正在播放语音时，不回传麦克风音频
                if (typeof focus_mode !== 'undefined' && focus_mode === true && isPlaying === true) {
                    // 处于focus_mode且语音播放中，跳过回传
                    return;
                }

                if (isRecording && socket.readyState === WebSocket.OPEN) {
                    socket.send(JSON.stringify({
                        action: 'stream_data',
                        data: Array.from(audioData),
                        input_type: 'audio'
                    }));
                }
            };

            // 连接节点
            source.connect(workletNode);
            // 不需要连接到destination，因为我们不需要听到声音
            // workletNode.connect(audioContext.destination);
            
            // 启动静音检测
            startSilenceDetection();
            monitorInputVolume();

        } catch (err) {
            console.error('加载AudioWorklet失败:', err);
            console.dir(err); // <--- 使用 console.dir()
            statusElement.textContent = 'AudioWorklet加载失败';
            stopSilenceDetection();
        }
    }


    // 停止录屏
    function stopScreening() {
        if (videoSenderInterval) clearInterval(videoSenderInterval);
    }

    // 停止录音
    function stopRecording() {

        stopScreening();
        if (!isRecording) return;

        isRecording = false;
        currentGeminiMessage = null;
        
        // 停止静音检测
        stopSilenceDetection();
        
        // 清理输入analyser
        inputAnalyser = null;

        // 停止所有轨道
        if (stream) {
            stream.getTracks().forEach(track => track.stop());
        }

        // 关闭AudioContext
        if (audioContext) {
            audioContext.close();
        }

        // 通知服务器暂停会话
        if (socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({
                action: 'pause_session'
            }));
        }
        // statusElement.textContent = '录制已停止';
    }

    // 清空音频队列并停止所有播放
    function clearAudioQueue() {
        // 停止所有计划的音频源
        scheduledSources.forEach(source => {
            try {
                source.stop();
            } catch (e) {
                // 忽略已经停止的源
            }
        });

        // 清空队列和计划源列表
        scheduledSources = [];
        audioBufferQueue = [];
        isPlaying = false;
        audioStartTime = 0;
        nextStartTime = 0; // 新增：重置预调度时间
    }


    function scheduleAudioChunks() {
        const scheduleAheadTime = 5;

        initializeGlobalAnalyser();

        // 关键：预调度所有在lookahead时间内的chunk
        while (nextChunkTime < audioPlayerContext.currentTime + scheduleAheadTime) {
            if (audioBufferQueue.length > 0) {
                const { buffer: nextBuffer } = audioBufferQueue.shift();
                console.log('ctx', audioPlayerContext.sampleRate,
                    'buf', nextBuffer.sampleRate);

                const source = audioPlayerContext.createBufferSource();
                source.buffer = nextBuffer;
                // source.connect(audioPlayerContext.destination);


                // 创建analyser节点用于lipSync
                // const analyser = audioPlayerContext.createAnalyser();
                // analyser.fftSize = 2048;
                // source.connect(analyser);
                // analyser.connect(audioPlayerContext.destination);
                // if (window.LanLan1 && window.LanLan1.live2dModel) {
                //     startLipSync(window.LanLan1.live2dModel, analyser);
                // }


                source.connect(globalAnalyser);

                if (!lipSyncActive && window.LanLan1 && window.LanLan1.live2dModel) {
                    startLipSync(window.LanLan1.live2dModel, globalAnalyser);
                    lipSyncActive = true;
                }

                // 精确时间调度
                source.start(nextChunkTime);
                // console.log(`调度chunk在时间: ${nextChunkTime.toFixed(3)}`);

                // 设置结束回调处理lipSync停止
                source.onended = () => {
                    // if (window.LanLan1 && window.LanLan1.live2dModel) {
                    //     stopLipSync(window.LanLan1.live2dModel);
                    // }
                    const index = scheduledSources.indexOf(source);
                    if (index !== -1) {
                        scheduledSources.splice(index, 1);
                    }

                    if (scheduledSources.length === 0 && audioBufferQueue.length === 0) {
                        if (window.LanLan1 && window.LanLan1.live2dModel) {
                            stopLipSync(window.LanLan1.live2dModel);
                        }
                        lipSyncActive = false;
                        isPlaying = false; // 新增：所有音频播放完毕，重置isPlaying
                    }
                };

                // // 更新下一个chunk的时间
                nextChunkTime += nextBuffer.duration;

                scheduledSources.push(source);
            } else {
                break;
            }
        }

        // 继续调度循环
        setTimeout(scheduleAudioChunks, 25); // 25ms间隔检查
    }


    async function handleAudioBlob(blob) {
        // 你现有的PCM处理代码...
        const pcmBytes = await blob.arrayBuffer();
        if (!pcmBytes || pcmBytes.byteLength === 0) {
            console.warn('收到空的PCM数据，跳过处理');
            return;
        }

        if (!audioPlayerContext) {
            audioPlayerContext = new (window.AudioContext || window.webkitAudioContext)();
        }

        if (audioPlayerContext.state === 'suspended') {
            await audioPlayerContext.resume();
        }

        const int16Array = new Int16Array(pcmBytes);
        const audioBuffer = audioPlayerContext.createBuffer(1, int16Array.length, 48000);
        const channelData = audioBuffer.getChannelData(0);
        for (let i = 0; i < int16Array.length; i++) {
            channelData[i] = int16Array[i] / 32768.0;
        }

        const bufferObj = { seq: seqCounter++, buffer: audioBuffer };
        audioBufferQueue.push(bufferObj);

        let i = audioBufferQueue.length - 1;
        while (i > 0 && audioBufferQueue[i].seq < audioBufferQueue[i - 1].seq) {
            [audioBufferQueue[i], audioBufferQueue[i - 1]] =
              [audioBufferQueue[i - 1], audioBufferQueue[i]];
            i--;
        }

        // 如果是第一次，初始化调度
        if (!isPlaying) {
            nextChunkTime = audioPlayerContext.currentTime + 0.1;
            isPlaying = true;
            scheduleAudioChunks(); // 开始调度循环
        }
    }

    function startScreenVideoStreaming(stream, input_type) {
        const video = document.createElement('video');
        // console.log('Ready for sharing 1')

        video.srcObject = stream;
        video.autoplay = true;
        video.muted = true;
        // console.log('Ready for sharing 2')

        videoTrack = stream.getVideoTracks()[0];
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        // 定时抓取当前帧并编码为jpeg
        video.play().then(() => {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            videoSenderInterval = setInterval(() => {
                ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                const dataUrl = canvas.toDataURL('image/jpeg', 0.8); // base64 jpeg

                if (socket.readyState === WebSocket.OPEN) {
                    socket.send(JSON.stringify({
                        action: 'stream_data',
                        data: dataUrl,
                        input_type: input_type,
                    }));
                }
            }, 1000); } // 每100ms一帧
        )
    }

    function initializeGlobalAnalyser() {
        if (!globalAnalyser && audioPlayerContext) {
            globalAnalyser = audioPlayerContext.createAnalyser();
            globalAnalyser.fftSize = 2048;
            globalAnalyser.connect(audioPlayerContext.destination);
        }
    }

    function startLipSync(model, analyser) {
        const dataArray = new Uint8Array(analyser.fftSize);

        function animate() {
            analyser.getByteTimeDomainData(dataArray);
            // 简单求音量（RMS 或最大振幅）
            let sum = 0;
            for (let i = 0; i < dataArray.length; i++) {
                const val = (dataArray[i] - 128) / 128; // 归一化到 -1~1
                sum += val * val;
            }
            const rms = Math.sqrt(sum / dataArray.length);
            // 这里可以调整映射关系
            const mouthOpen = Math.min(1, rms * 8); // 放大到 0~1
            // 通过统一通道设置嘴巴开合，屏蔽 motion 对嘴巴的控制
            if (window.LanLan1 && typeof window.LanLan1.setMouth === 'function') {
                window.LanLan1.setMouth(mouthOpen);
            }

            animationFrameId = requestAnimationFrame(animate);
        }

        animate();
    }

    function stopLipSync(model) {
        cancelAnimationFrame(animationFrameId);
        if (window.LanLan1 && typeof window.LanLan1.setMouth === 'function') {
            window.LanLan1.setMouth(0);
        } else if (model && model.internalModel && model.internalModel.coreModel) {
            // 兜底
            try { model.internalModel.coreModel.setParameterValueById("ParamMouthOpenY", 0); } catch (_) {}
        }
    }

    // 隐藏live2d函数
    function hideLive2d() {
        const container = document.getElementById('live2d-container');
        container.classList.add('minimized');
    }

    // 显示live2d函数
    function showLive2d() {
        const container = document.getElementById('live2d-container');

        // 判断是否已经最小化（通过检查是否有hidden类或检查样式）
        if (!container.classList.contains('minimized') &&
            container.style.visibility !== 'minimized') {
            // 如果已经显示，则不执行任何操作
            return;
        }

        // 先恢复容器尺寸和可见性，但保持透明度为0和位置在屏幕外
        // container.style.height = '1080px';
        // container.style.width = '720px';
        container.style.visibility = 'visible';

        // 强制浏览器重新计算样式，确保过渡效果正常
        void container.offsetWidth;

        // 移除hidden类，触发过渡动画
        container.classList.remove('minimized');
    }
    window.startScreenSharing = startScreenSharing;
    window.stopScreenSharing  = stopScreenSharing;
    window.screen_share       = startScreenSharing;
    
    // 初始化麦克风选择器
    initMicrophoneSelector();
} // 兼容老按钮

const ready = () => {
    if (ready._called) return;
    ready._called = true;
    init_app();
};

document.addEventListener("DOMContentLoaded", ready);
window.addEventListener("load", ready);

