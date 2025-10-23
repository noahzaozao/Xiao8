# 打包exe时的日志配置指南

## 概述

本指南说明如何确保应用打包为exe后，日志系统能够正常工作。

## PyInstaller配置

### 1. 基本配置

如果使用PyInstaller打包，需要在`.spec`文件中包含日志模块：

```python
# -*- mode: python ; coding: utf-8 -*-

block_cipher = None

a = Analysis(
    ['main_server.py'],  # 主入口文件
    pathex=[],
    binaries=[],
    datas=[
        # 确保包含日志配置模块
        ('utils/logger_config.py', 'utils'),
        # 其他资源文件...
    ],
    hiddenimports=[
        'utils.logger_config',  # 显式导入日志模块
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name='Xiao8',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=False,  # 如果需要看到日志输出，设置为True
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon='assets/icon.ico'  # 应用图标
)
```

### 2. 打包命令

```bash
# 使用spec文件打包
pyinstaller Xiao8.spec

# 或者使用命令行参数
pyinstaller --onefile --windowed \
    --name Xiao8 \
    --icon=assets/icon.ico \
    --add-data "utils/logger_config.py;utils" \
    --hidden-import utils.logger_config \
    main_server.py
```

注意：
- Windows使用分号 `;` 分隔路径
- Linux/macOS使用冒号 `:` 分隔路径

## 测试打包后的日志功能

### 1. 创建测试脚本

在打包前，先运行测试脚本确保日志系统工作正常：

```bash
python test_logger.py
```

### 2. 打包后测试

```bash
# 1. 打包应用
pyinstaller Xiao8.spec

# 2. 运行打包后的exe
cd dist
./Xiao8.exe

# 3. 检查日志文件是否正常生成
# Windows: 检查 %APPDATA%\Xiao8\logs\
# 查看日志文件内容，确认有日志输出
```

### 3. 验证日志路径

在应用启动时，日志系统会输出日志文件位置。确保：

```
=== Xiao8_Main 日志系统已初始化 ===
日志目录: C:\Users\用户名\AppData\Roaming\Xiao8\logs
日志文件: C:\Users\用户名\AppData\Roaming\Xiao8\logs\Xiao8_Main_20251023.log
...
```

## 常见问题排查

### 问题1: 打包后找不到日志模块

**症状**: 运行exe时报错 `ModuleNotFoundError: No module named 'utils.logger_config'`

**解决方案**:
```python
# 在.spec文件中添加:
hiddenimports=['utils.logger_config'],

# 或在主文件开头添加:
try:
    from utils.logger_config import setup_logging
except ImportError:
    # 降级到基本logging
    import logging
    logging.basicConfig(level=logging.INFO)
    logger = logging.getLogger(__name__)
```

### 问题2: 日志文件没有生成

**症状**: exe运行正常，但找不到日志文件

**排查步骤**:

1. 确认日志目录权限：
```python
# 在代码中添加调试输出
from utils.logger_config import RobustLoggerConfig
config = RobustLoggerConfig("Xiao8")
print(f"日志目录: {config.get_log_directory_path()}")
print(f"目录是否存在: {config.log_dir.exists()}")
print(f"是否可写: {os.access(config.log_dir, os.W_OK)}")
```

2. 检查是否有权限问题：
   - Windows: 以管理员身份运行试试
   - 检查杀毒软件是否拦截

3. 查看控制台输出：
   - 临时将 `console=True` 设置在spec文件中
   - 查看是否有错误信息

### 问题3: 日志中文乱码

**症状**: 日志文件中中文显示为乱码

**解决方案**:

已在`logger_config.py`中设置了`encoding='utf-8'`，如果仍有问题：

```python
# 在应用启动时设置
import sys
if sys.platform == 'win32':
    # Windows控制台UTF-8支持
    import locale
    if locale.getpreferredencoding().upper() != 'UTF-8':
        import codecs
        sys.stdout = codecs.getwriter('utf-8')(sys.stdout.buffer, 'strict')
        sys.stderr = codecs.getwriter('utf-8')(sys.stderr.buffer, 'strict')
```

### 问题4: exe体积过大

**症状**: 打包后exe文件很大

**优化方案**:

1. 排除不必要的模块：
```python
# 在.spec文件中
excludes=[
    'tkinter',      # 如果不使用GUI
    'matplotlib',   # 如果不需要画图
    'PyQt5',        # 如果不使用Qt
    'numpy',        # 如果不需要
    # ... 其他不需要的库
],
```

2. 使用UPX压缩：
```python
exe = EXE(
    # ...
    upx=True,
    upx_exclude=['vcruntime140.dll'],  # 某些dll不能压缩
)
```

## 部署最佳实践

### 1. 为用户提供日志访问

在应用中添加"打开日志目录"功能：

```python
# 在设置或帮助菜单中
def open_log_directory():
    """打开日志目录供用户查看"""
    from utils.logger_config import RobustLoggerConfig
    import subprocess
    import platform
    
    config = RobustLoggerConfig("Xiao8")
    log_dir = config.get_log_directory_path()
    
    try:
        system = platform.system()
        if system == "Windows":
            os.startfile(log_dir)
        elif system == "Darwin":
            subprocess.run(['open', log_dir])
        else:
            subprocess.run(['xdg-open', log_dir])
    except Exception as e:
        # 如果无法打开，显示路径让用户手动打开
        print(f"日志目录: {log_dir}")
```

### 2. 收集用户反馈时的日志

```python
def export_logs_for_support():
    """导出日志用于技术支持"""
    from utils.logger_config import RobustLoggerConfig
    import zipfile
    from datetime import datetime
    from pathlib import Path
    
    config = RobustLoggerConfig("Xiao8")
    log_dir = Path(config.get_log_directory_path())
    
    # 创建桌面上的压缩包
    desktop = Path.home() / "Desktop"
    export_name = f"Xiao8_logs_{datetime.now().strftime('%Y%m%d_%H%M%S')}.zip"
    export_path = desktop / export_name
    
    with zipfile.ZipFile(export_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
        for log_file in log_dir.glob("*.log*"):
            # 只包含最近的日志（例如最近3天）
            if (datetime.now() - datetime.fromtimestamp(log_file.stat().st_mtime)).days <= 3:
                zipf.write(log_file, log_file.name)
    
    return str(export_path)
```

### 3. 版本信息记录

在应用启动时记录版本信息：

```python
from utils.logger_config import setup_logging
import logging

# 应用版本号
APP_VERSION = "1.0.0"
APP_BUILD = "20251023"

logger, config = setup_logging("Xiao8_Main", logging.INFO)

# 记录版本和环境信息
logger.info(f"{'='*60}")
logger.info(f"Xiao8 启动")
logger.info(f"版本: {APP_VERSION} (Build {APP_BUILD})")
logger.info(f"Python: {sys.version}")
logger.info(f"平台: {sys.platform}")
logger.info(f"工作目录: {os.getcwd()}")
if getattr(sys, 'frozen', False):
    logger.info(f"运行模式: 已打包 (exe)")
    logger.info(f"可执行文件: {sys.executable}")
else:
    logger.info(f"运行模式: 开发环境")
logger.info(f"{'='*60}")
```

## 多环境配置

### 开发环境 vs 生产环境

```python
import sys

# 判断是否为打包后的exe
IS_FROZEN = getattr(sys, 'frozen', False)

if IS_FROZEN:
    # 生产环境（exe）- 使用INFO级别
    from utils.logger_config import setup_logging
    import logging
    logger, config = setup_logging("Xiao8_Main", logging.INFO)
else:
    # 开发环境 - 使用DEBUG级别
    from utils.logger_config import setup_logging
    import logging
    logger, config = setup_logging("Xiao8_Main", logging.DEBUG)
```

## 自动更新时的日志处理

如果应用支持自动更新：

```python
def prepare_for_update():
    """更新前准备"""
    logger.info("="*60)
    logger.info("准备进行应用更新")
    logger.info(f"当前版本: {current_version}")
    logger.info(f"目标版本: {target_version}")
    logger.info("="*60)
    
    # 关闭日志处理器，避免文件被锁定
    for handler in logger.handlers[:]:
        handler.close()
        logger.removeHandler(handler)

def after_update():
    """更新后恢复"""
    # 重新初始化日志系统
    from utils.logger_config import setup_logging
    import logging
    
    global logger, config
    logger, config = setup_logging("Xiao8_Main", logging.INFO)
    
    logger.info("="*60)
    logger.info("应用更新完成")
    logger.info(f"新版本: {new_version}")
    logger.info("="*60)
```

## 检查清单

打包前的检查清单：

- [ ] `.spec`文件包含`utils/logger_config.py`
- [ ] `hiddenimports`包含`utils.logger_config`
- [ ] 运行`test_logger.py`测试通过
- [ ] 主文件使用新的日志系统
- [ ] 所有服务器文件使用新的日志系统
- [ ] 测试打包后的exe，确认日志正常生成
- [ ] 验证日志文件在正确的用户目录
- [ ] 测试日志轮转功能
- [ ] 测试旧日志清理功能
- [ ] 添加"打开日志目录"功能（可选）
- [ ] 添加"导出日志"功能（可选）

## 总结

正确配置日志系统后：

✅ **开箱即用**: 用户安装后无需配置
✅ **自动管理**: 日志轮转、清理全自动
✅ **易于排查**: 错误日志单独保存
✅ **权限友好**: 不需要管理员权限
✅ **跨平台**: Windows/macOS/Linux通用

祝打包顺利！如有问题，请查看日志文件获取详细信息。

