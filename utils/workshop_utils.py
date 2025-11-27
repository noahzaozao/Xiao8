# -*- coding: utf-8 -*-
"""
创意工坊路径管理工具模块
用于处理创意工坊路径的获取、配置和管理
所有配置路径统一从 config_manager 获取
"""

import os
import asyncio
import pathlib
import logging
from typing import Optional, Dict, Any

from utils.config_manager import get_config_manager, load_json_config, save_json_config

logger = logging.getLogger(__name__)

# 配置文件名（不是路径，路径由config_manager管理）
WORKSHOP_CONFIG_FILENAME = 'workshop_config.json'

# 默认配置数据
DEFAULT_WORKSHOP_CONFIG = {
    "default_workshop_folder": "",  # 空字符串表示使用 config_manager.live2d_dir
    "auto_create_folder": True
}


def get_default_workshop_folder() -> str:
    """
    获取默认的创意工坊物品文件夹路径
    从 config_manager 获取 live2d_dir 作为默认路径
    """
    config_manager = get_config_manager()
    return str(config_manager.live2d_dir)


def get_workshop_config() -> Dict[str, Any]:
    """
    获取创意工坊配置
    
    Returns:
        dict: 创意工坊配置
    """
    try:
        config = load_json_config(WORKSHOP_CONFIG_FILENAME, DEFAULT_WORKSHOP_CONFIG)
        # 如果配置中的 default_workshop_folder 为空，使用 live2d_dir
        if not config.get("default_workshop_folder"):
            config["default_workshop_folder"] = get_default_workshop_folder()
        return config
    except Exception as e:
        logger.error(f"加载创意工坊配置失败: {e}")
        return {
            "default_workshop_folder": get_default_workshop_folder(),
            "auto_create_folder": True
        }


def save_workshop_config_data(config: Dict[str, Any]) -> None:
    """
    保存创意工坊配置
    
    Args:
        config: 要保存的配置数据
    """
    try:
        save_json_config(WORKSHOP_CONFIG_FILENAME, config)
        logger.info(f"成功保存创意工坊配置: {config}")
    except Exception as e:
        logger.error(f"保存创意工坊配置失败: {e}")


def ensure_workshop_folder_exists(folder_path: Optional[str] = None) -> bool:
    """
    确保创意工坊文件夹存在，如果不存在则自动创建
    
    Args:
        folder_path: 指定的文件夹路径，如果为None则使用配置中的默认路径
        
    Returns:
        bool: 文件夹是否存在或创建成功
    """
    config = get_workshop_config()
    
    # 确定目标文件夹路径
    raw_folder = folder_path or config.get("default_workshop_folder") or get_default_workshop_folder()
    
    # 确保路径是绝对路径，如果不是则转换
    if not os.path.isabs(raw_folder):
        # 如果是相对路径，尝试以用户主目录为基础
        base_dir = os.path.expanduser('~')
        target_folder = os.path.join(base_dir, raw_folder)
    else:
        target_folder = raw_folder
    
    # 标准化路径
    target_folder = os.path.normpath(target_folder)
    
    logger.info(f'ensure_workshop_folder_exists - 最终处理的目标文件夹: {target_folder}')
    
    # 如果文件夹存在，直接返回True
    if os.path.exists(target_folder):
        return True
    
    # 如果文件夹不存在，检查是否允许自动创建
    auto_create = config.get("auto_create_folder", True)
    
    # 如果不允许自动创建，明确返回False
    if not auto_create:
        return False
    
    # 如果允许自动创建，尝试创建文件夹
    try:
        # 使用exist_ok=True确保即使中间目录不存在也能创建
        os.makedirs(target_folder, exist_ok=True)
        return True
    except Exception as e:
        logger.error(f"创建创意工坊文件夹失败: {e}")
        return False


def get_workshop_root(globals_dict: Optional[Dict[str, Any]] = None) -> str:
    """
    获取创意工坊根目录路径
    
    Args:
        globals_dict: 全局变量字典，用于访问get_subscribed_workshop_items函数
        
    Returns:
        str: 创意工坊根目录路径
    """
    # 如果没有提供globals_dict，使用当前模块的globals
    if globals_dict is None:
        globals_dict = globals()
    
    try:
        # 尝试获取get_subscribed_workshop_items函数引用
        subscribed_items_func = globals_dict.get('get_subscribed_workshop_items')
        if subscribed_items_func:
            # 使用asyncio.run()来运行异步函数
            workshop_items_result = asyncio.run(subscribed_items_func())
            if isinstance(workshop_items_result, dict) and workshop_items_result.get('success', False):
                items = workshop_items_result.get('items', [])
                if items:
                    first_item = items[0]
                    WORKSHOP_PATH_FIRST = first_item.get('installedFolder')
                    if WORKSHOP_PATH_FIRST:
                        logger.info(f"成功获取第一个创意工坊物品的安装目录: {WORKSHOP_PATH_FIRST}")
                        
                        p = pathlib.Path(WORKSHOP_PATH_FIRST)
                        # 确保目录存在
                        if p.parent.exists():
                            return str(p.parent)
                        else:
                            logger.warning(f"计算得到的创意工坊根目录不存在: {p.parent}")
                    else:
                        logger.warning("第一个创意工坊物品没有安装目录")
                else:
                    logger.warning("未找到任何订阅的创意工坊物品")
            else:
                logger.error("获取订阅的创意工坊物品失败")
        else:
            logger.warning("get_subscribed_workshop_items函数尚未定义，使用默认路径")
    except Exception as e:
        logger.error(f"获取创意工坊物品列表时出错: {e}")
    
    # 返回默认的创意工坊文件夹路径作为后备
    config = get_workshop_config()
    default_path = config.get("default_workshop_folder") or get_default_workshop_folder()
    logger.info(f"使用默认创意工坊路径: {default_path}")
    
    # 确保默认路径存在
    ensure_workshop_folder_exists(default_path)
    return default_path


# ============ 兼容性别名 ============
# 为了向后兼容，保留旧的变量名和函数名

# 配置数据 - 使用函数获取，不再是模块级常量
workshop_config: Dict[str, Any] = {}


def load_workshop_config() -> None:
    """
    加载创意工坊配置（兼容性函数）
    """
    global workshop_config
    workshop_config = get_workshop_config()
    logger.info(f'创意工坊配置已加载: {workshop_config}')


def save_workshop_config() -> None:
    """
    保存创意工坊配置（兼容性函数）
    """
    global workshop_config
    save_workshop_config_data(workshop_config)


# 初始化时加载配置
load_workshop_config()
