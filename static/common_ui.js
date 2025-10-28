// 获取聊天容器元素
const chatContainer = document.getElementById('chat-container');
const chatContentWrapper = document.getElementById('chat-content-wrapper');
const toggleBtn = document.getElementById('toggle-chat-btn');

// 定义一个滚动到底部的函数
function scrollToBottom() {
    if (chatContentWrapper && !chatContainer.classList.contains('minimized')) {
        chatContentWrapper.scrollTop = chatContentWrapper.scrollHeight;
    }
}

// --- 添加新消息函数 (修正) ---
function addNewMessage(messageHTML) {
    if (!chatContentWrapper) return; // 安全检查

    const newMessageElement = document.createElement('div');
    newMessageElement.innerHTML = messageHTML;
    chatContentWrapper.appendChild(newMessageElement);

    // 确保在添加消息后立即滚动到底部
    setTimeout(scrollToBottom, 10); // 短暂延迟确保DOM更新
}

// --- 切换聊天框最小化/展开状态 ---
toggleBtn.addEventListener('click', (event) => {
    event.stopPropagation();

    const isMinimized = chatContainer.classList.toggle('minimized');

    if (isMinimized) {
        // 刚刚最小化
        toggleBtn.textContent = '+';
        toggleBtn.title = 'Restore';
    } else {
        // 刚刚还原展开
        toggleBtn.textContent = '-';
        toggleBtn.title = 'Minimize';
        // 还原后滚动到底部
        setTimeout(scrollToBottom, 300); // 给CSS过渡留出时间
    }
});

// --- 对话区拖动功能 ---
(function() {
    let isDragging = false;
    let hasMoved = false; // 用于判断是否发生了实际的移动
    let startMouseX = 0; // 开始拖动时的鼠标X位置
    let startMouseY = 0; // 开始拖动时的鼠标Y位置
    let startContainerLeft = 0; // 开始拖动时容器的left值
    let startContainerBottom = 0; // 开始拖动时容器的bottom值

    // 获取相关元素
    const chatHeader = document.getElementById('chat-header');
    const textInputArea = document.getElementById('text-input-area');

    // 开始拖动的函数
    function startDrag(e, skipPreventDefault = false) {
        isDragging = true;
        hasMoved = false;
        
        // 获取初始鼠标/触摸位置
        const clientX = e.type.includes('touch') ? e.touches[0].clientX : e.clientX;
        const clientY = e.type.includes('touch') ? e.touches[0].clientY : e.clientY;
        
        // 记录开始时的鼠标位置
        startMouseX = clientX;
        startMouseY = clientY;
        
        // 获取当前容器的实际位置（从计算样式中读取，确保准确）
        const computedStyle = window.getComputedStyle(chatContainer);
        startContainerLeft = parseFloat(computedStyle.left) || 0;
        startContainerBottom = parseFloat(computedStyle.bottom) || 0;
        
        console.log('[Drag Start] Mouse:', clientX, clientY, 'Container:', startContainerLeft, startContainerBottom);
        
        // 添加拖动样式
        chatContainer.style.cursor = 'grabbing';
        if (chatHeader) chatHeader.style.cursor = 'grabbing';
        
        // 阻止默认行为（除非明确跳过）
        if (!skipPreventDefault) {
            e.preventDefault();
        }
    }

    // 移动中
    function onDragMove(e) {
        if (!isDragging) return;
        
        const clientX = e.type.includes('touch') ? e.touches[0].clientX : e.clientX;
        const clientY = e.type.includes('touch') ? e.touches[0].clientY : e.clientY;
        
        // 计算鼠标的位移
        const deltaX = clientX - startMouseX;
        const deltaY = clientY - startMouseY;
        
        // 检查是否真的移动了（移动距离超过5px）
        const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
        
        if (distance > 5) {
            hasMoved = true;
        }
        
        // 立即更新位置：初始位置 + 鼠标位移
        const newLeft = startContainerLeft + deltaX;
        // 注意：Y轴向下为正，但bottom值向上为正，所以要减去deltaY
        const newBottom = startContainerBottom - deltaY;
        
        // 限制在视口内
        const maxLeft = window.innerWidth - chatContainer.offsetWidth;
        const maxBottom = window.innerHeight - chatContainer.offsetHeight;
        
        chatContainer.style.left = Math.max(0, Math.min(maxLeft, newLeft)) + 'px';
        chatContainer.style.bottom = Math.max(0, Math.min(maxBottom, newBottom)) + 'px';
    }

    // 结束拖动
    function endDrag() {
        if (isDragging) {
            const wasDragging = isDragging;
            const didMove = hasMoved;
            
            isDragging = false;
            hasMoved = false;
            chatContainer.style.cursor = '';
            if (chatHeader) chatHeader.style.cursor = '';
            
            console.log('[Drag End] Moved:', didMove);
            
            // 如果在折叠状态下，没有发生移动，则触发展开
            if (wasDragging && !didMove && chatContainer.classList.contains('minimized')) {
                // 使用 setTimeout 确保 click 事件之前执行
                setTimeout(() => {
                    toggleBtn.click();
                }, 0);
            }
        }
    }

    // 展开状态：通过header或输入区域空白处拖动
    if (chatHeader) {
        // 鼠标事件
        chatHeader.addEventListener('mousedown', (e) => {
            if (!chatContainer.classList.contains('minimized')) {
                startDrag(e);
            }
        });
        
        // 触摸事件
        chatHeader.addEventListener('touchstart', (e) => {
            if (!chatContainer.classList.contains('minimized')) {
                startDrag(e);
            }
        }, { passive: false });
    }
    
    // 输入区域：点击空白处（不是输入框、按钮等）可以拖动
    if (textInputArea) {
        textInputArea.addEventListener('mousedown', (e) => {
            if (!chatContainer.classList.contains('minimized')) {
                // 只有点击空白区域才拖动，不包括输入框、按钮等交互元素
                if (e.target === textInputArea) {
                    startDrag(e);
                }
            }
        });
        
        textInputArea.addEventListener('touchstart', (e) => {
            if (!chatContainer.classList.contains('minimized')) {
                if (e.target === textInputArea) {
                    startDrag(e);
                }
            }
        }, { passive: false });
    }

    // 折叠状态：点击容器（除了按钮）可以拖动或展开
    chatContainer.addEventListener('mousedown', (e) => {
        if (chatContainer.classList.contains('minimized')) {
            // 如果点击的是切换按钮，不启动拖动
            if (e.target === toggleBtn || toggleBtn.contains(e.target)) {
                return;
            }
            
            // 启动拖动（移动时拖动，不移动时会在 endDrag 中展开）
            startDrag(e, true); // 跳过 preventDefault，允许后续的 click 事件
        }
    });

    chatContainer.addEventListener('touchstart', (e) => {
        if (chatContainer.classList.contains('minimized')) {
            // 如果点击的是切换按钮，不启动拖动
            if (e.target === toggleBtn || toggleBtn.contains(e.target)) {
                return;
            }
            
            // 启动拖动
            startDrag(e);
        }
    }, { passive: false });

    // 全局移动和释放事件
    document.addEventListener('mousemove', onDragMove);
    document.addEventListener('touchmove', onDragMove, { passive: false });
    document.addEventListener('mouseup', endDrag);
    document.addEventListener('touchend', endDrag);
})();

// --- Sidebar 折叠/展开功能 ---
const sidebar = document.getElementById('sidebar');
const toggleSidebarBtn = document.getElementById('toggle-sidebar-btn');

toggleSidebarBtn.addEventListener('click', (event) => {
    event.stopPropagation();
    const isMinimized = sidebar.classList.toggle('minimized');
    if (isMinimized) {
        toggleSidebarBtn.textContent = '+';
        toggleSidebarBtn.title = '展开侧边栏';
        sidebar.style.width = sidebar.style.height = '48px';
    } else {
        toggleSidebarBtn.textContent = '-';
        toggleSidebarBtn.title = '折叠侧边栏';
        sidebar.style.width = maxsidebarboxWidth + 'px';
        sidebar.style.height = maxsidebarboxHeight + 'px';
    }
});

// 允许点击整个 sidebar 区域还原
sidebar.addEventListener('click', (event) => {
    if (sidebar.classList.contains('minimized') && event.target === sidebar) {
        toggleSidebarBtn.click();
    }
});

// --- 初始化 ---
document.addEventListener('DOMContentLoaded', () => {
    // 设置初始按钮状态 - 聊天框
    if (chatContainer && toggleBtn) {
        if (chatContainer.classList.contains('minimized')) {
            toggleBtn.textContent = '+';
            toggleBtn.title = 'Restore';
        } else {
            toggleBtn.textContent = '-';
            toggleBtn.title = 'Minimize';
            scrollToBottom(); // 初始加载时滚动一次
        }
    }

    // 设置初始按钮状态 - 侧边栏
    if (sidebar && toggleSidebarBtn) {
        if (sidebar.classList.contains('minimized')) {
            toggleSidebarBtn.textContent = '+';
            toggleSidebarBtn.title = '展开侧边栏';
        } else {
            toggleSidebarBtn.textContent = '-';
            toggleSidebarBtn.title = '折叠侧边栏';
        }
    }

    // 确保自动滚动在页面加载后生效
    scrollToBottom();
});

// 监听 DOM 变化，确保新内容添加后自动滚动
const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
        if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
            scrollToBottom();
        }
    });
});

// 开始观察聊天内容区域的变化
if (chatContentWrapper) {
    observer.observe(chatContentWrapper, {childList: true, subtree: true});
}


// #########################################################
// Below is the auto-folding logic for sidebarbox
// #########################################################
// 获取组件最大宽度
const sidebarbox = document.getElementById('sidebarbox');
// const toggleSidebarBtn = document.getElementById('toggle-sidebar-btn');
//组件被重复声明

let sidebarboxWidth = sidebarbox.offsetWidth || 652;
let sidebarboxHeight = sidebarbox.offsetHeight || 308;
let maxsidebarboxWidth = sidebarboxWidth; // 组件最大宽度用于css平滑缩放（默认值）
let maxsidebarboxHeight = sidebarboxHeight; // 组件最大高度用于css平滑缩放（默认值）

const updateSidebarDimensions = () => {
    if (window.innerWidth < 768) { // 检测屏幕尺寸，不建议修改
        sidebar.style.height = 'unset';
        // maxsidebarboxWidth = "90vw"; // 把90vw转换为px
        maxsidebarboxWidth = window.innerWidth * 0.9 || 652; // 计算90vw的px值
    } else {
        sidebar.style.width = sidebar.style.height = 'unset';
        maxsidebarboxWidth = sidebarbox.offsetWidth || 652;
    }
    sidebar.style.width = maxsidebarboxWidth + 'px';
    maxsidebarboxHeight = sidebarbox.offsetHeight || 308;
    sidebar.style.height = maxsidebarboxHeight + 'px';
    console.log("新的最大高度是: " + sidebar.style.height + "，新的最大宽度是: " + sidebar.style.width);
}
window.addEventListener('resize', updateSidebarDimensions);
updateSidebarDimensions();

//设置sidebar大小以应用于css平滑缩放

sidebar.style.width = maxsidebarboxWidth + 'px';
sidebar.style.height = maxsidebarboxHeight + 'px';


// 只有自动收缩（定时器或失去焦点）导致最小化后，悬停才会触发展开（仅PC端处理）
function isMobileDevice() { // 检测方法2选1
    // return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    if(window.innerWidth < 768) {
        return true; // 如果屏幕宽度小于768px，认为是移动设备
    } else {
        return false; // 否则认为是PC端
    }
}

let autoMinimized = false;

if (!isMobileDevice()) {
    sidebar.addEventListener('mouseenter', () => {
        // 仅自动收缩导致最小化时才允许悬停展开
        if (sidebar.classList.contains('minimized') && autoMinimized) {
            toggleSidebarBtn.click();
            autoMinimized = false;
        }
    });
}
// 页面打开时延迟3秒自动收缩 sidebar
// window.addEventListener('DOMContentLoaded', () => {
//     if (!sidebar.classList.contains('minimized')) {
//         setTimeout(() => {
//             toggleSidebarBtn.click();
//             autoMinimized = true;
//         }, 3000);
//     }
// });

// PC端：鼠标离开 sidebar 时延迟5秒收缩
sidebar.addEventListener('mouseleave', () => {
    if (!sidebar.classList.contains('minimized') && !isMobileDevice()) {
        setTimeout(() => {
            if (!sidebar.classList.contains('minimized')) {
                toggleSidebarBtn.click();
                autoMinimized = true;
            }
        }, 5000);
    }
});

// 移动端：点击页面其它区域时自动收缩 sidebar
if (isMobileDevice()) {
    document.addEventListener('touchstart', (e) => {
        if (!sidebar.classList.contains('minimized')) {
            if (!sidebar.contains(e.target)) {
                toggleSidebarBtn.click();
                autoMinimized = true;
            }
        }
    }, {passive: true});
    // 使 sidebar 可聚焦（可保留）
    sidebar.setAttribute('tabindex', '0');
}
