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
window.addEventListener('DOMContentLoaded', () => {
    if (!sidebar.classList.contains('minimized')) {
        setTimeout(() => {
            toggleSidebarBtn.click();
            autoMinimized = true;
        }, 3000);
    }
});

// PC端：鼠标离开 sidebar 时延迟3秒收缩
sidebar.addEventListener('mouseleave', () => {
    if (!sidebar.classList.contains('minimized') && !isMobileDevice()) {
        setTimeout(() => {
            if (!sidebar.classList.contains('minimized')) {
                toggleSidebarBtn.click();
                autoMinimized = true;
            }
        }, 3000);
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
