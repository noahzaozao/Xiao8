from config.api import *
from config.prompts_chara import *
import json
import os
import logging

# Setup logger for this module
logger = logging.getLogger(__name__)

# 读取角色配置
CHARACTER_JSON_PATH = os.path.join(os.path.dirname(__file__), 'characters.json')
# 默认值
_default_master = {"档案名": "哥哥", "性别": "男", "昵称": "哥哥"}
_default_lanlan = {"test": {"性别": "女", "年龄": 15, "昵称": "T酱, 小T", "live2d": "mao_pro", "voice_id": "", "system_prompt": lanlan_prompt}}


def load_characters(character_json_path=CHARACTER_JSON_PATH):
    try:
        with open(CHARACTER_JSON_PATH, 'r', encoding='utf-8') as f:
            character_data = json.load(f)
    except FileNotFoundError:
        logger.info(f"未找到猫娘配置文件: {CHARACTER_JSON_PATH}，请检查文件是否存在。使用默认人设。")
        character_data = {"主人": _default_master, "猫娘": _default_lanlan}
    except Exception as e:
        logger.error(f"💥 读取猫娘配置文件出错: {e}，使用默认人设。")
        character_data = {"主人": _default_master, "猫娘": _default_lanlan}
    return character_data

def save_characters(data, character_json_path=CHARACTER_JSON_PATH):
    with open(character_json_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

def get_character_data():
    character_data = load_characters()
    # MASTER_NAME 必须始终存在，取档案名
    MASTER_NAME = character_data.get('主人', {}).get('档案名', _default_master['档案名'])
    # 获取所有猫娘名
    catgirl_names = list(character_data['猫娘'].keys()) if character_data['猫娘'] and len(character_data['猫娘']) > 0 else list(_default_lanlan.keys())
    her_name = catgirl_names[0] if catgirl_names else ''
    master_basic_config = character_data.get('主人', _default_master)
    lanlan_basic_config = character_data['猫娘'] if catgirl_names else _default_lanlan

    NAME_MAPPING = {'human': MASTER_NAME, 'system': "SYSTEM_MESSAGE"}
    # 生成以猫娘名为key的各类store
    LANLAN_PROMPT = {name: character_data['猫娘'][name].get('system_prompt', lanlan_prompt) for name in catgirl_names}
    SEMANTIC_STORE = {name: f'memory/store/semantic_memory_{name}' for name in catgirl_names}
    TIME_STORE = {name: f'memory/store/time_indexed_{name}' for name in catgirl_names}
    SETTING_STORE = {name: f'memory/store/settings_{name}.json' for name in catgirl_names}
    RECENT_LOG = {name: f'memory/store/recent_{name}.json' for name in catgirl_names}

    return MASTER_NAME, her_name, master_basic_config, lanlan_basic_config, NAME_MAPPING, LANLAN_PROMPT, SEMANTIC_STORE, TIME_STORE, SETTING_STORE, RECENT_LOG

TIME_ORIGINAL_TABLE_NAME = "time_indexed_original"
TIME_COMPRESSED_TABLE_NAME = "time_indexed_compressed"

try:
    with open('./config/core_config.json', 'r', encoding='utf-8') as f:
        core_cfg = json.load(f)
    if 'coreApiKey' in core_cfg and core_cfg['coreApiKey'] and core_cfg['coreApiKey'] != CORE_API_KEY:
        logger.warning("coreApiKey in core_config.json is updated. Overwriting CORE_API_KEY.")
        CORE_API_KEY = core_cfg['coreApiKey']
    if 'coreApi' in core_cfg and core_cfg['coreApi']:
        logger.warning("coreApi: " + core_cfg['coreApi'])
        if core_cfg['coreApi'] == 'qwen':
            CORE_URL = "wss://dashscope.aliyuncs.com/api-ws/v1/realtime"
            CORE_MODEL = "qwen-omni-turbo-realtime-2025-05-08"
        elif core_cfg['coreApi'] == 'glm':
            CORE_URL = "wss://open.bigmodel.cn/api/paas/v4/realtime"
            CORE_MODEL = "glm-realtime-air" 
        elif core_cfg['coreApi'] == 'openai':
            CORE_URL = "wss://api.openai.com/v1/realtime"
            CORE_MODEL = "gpt-4o-realtime-preview"
        else:
            logger.error("💥 Unknown coreApi: " + core_cfg['coreApi'])
    else:
        CORE_URL = "wss://dashscope.aliyuncs.com/api-ws/v1/realtime"
        CORE_MODEL = "qwen-omni-turbo-realtime-2025-05-08"
    ASSIST_API_KEY_QWEN = core_cfg['assistApiKeyQwen'] if 'assistApiKeyQwen' in core_cfg and core_cfg['assistApiKeyQwen'] != '' else CORE_API_KEY
    ASSIST_API_KEY_OPENAI = core_cfg['assistApiKeyOpenai'] if 'assistApiKeyOpenai' in core_cfg and core_cfg['assistApiKeyOpenai'] != '' else CORE_API_KEY
    ASSIST_API_KEY_GLM = core_cfg['assistApiKeyGlm'] if 'assistApiKeyGlm' in core_cfg and core_cfg['assistApiKeyGlm'] != '' else CORE_API_KEY
    if 'assistApi' in core_cfg and core_cfg['assistApi']:
        logger.warning("assistApi: " + core_cfg['assistApi'])
        if core_cfg['assistApi'] == 'qwen':
            logger.warning("assistApi: " + core_cfg['assistApi'])
            OPENROUTER_URL = "https://dashscope.aliyuncs.com/compatible-mode/v1"
            SUMMARY_MODEL = "qwen-plus"
            CORRECTION_MODEL = "qwen-max"
            AUDIO_API_KEY = OPENROUTER_API_KEY = ASSIST_API_KEY_QWEN
        elif core_cfg['assistApi'] == 'openai':
            logger.warning("assistApi: " + core_cfg['assistApi'])
            OPENROUTER_URL = "https://api.openai.com/v1"
            SUMMARY_MODEL= "gpt-4.1"
            CORRECTION_MODEL = "o4-mini"
            AUDIO_API_KEY = OPENROUTER_API_KEY = ASSIST_API_KEY_OPENAI
        elif core_cfg['assistApi'] == 'glm':
            OPENROUTER_URL = "https://open.bigmodel.cn/api/paas/v4"
            SUMMARY_MODEL = "glm-4-air-250414"
            CORRECTION_MODEL = "glm-z1-air"
            AUDIO_API_KEY = OPENROUTER_API_KEY = ASSIST_API_KEY_GLM
        else:
            logger.error("💥 Unknown assistApi: " + core_cfg['assistApi']) 
    else:
        OPENROUTER_URL = "https://dashscope.aliyuncs.com/compatible-mode/v1"
        SUMMARY_MODEL = "qwen-plus"
        CORRECTION_MODEL = "qwen-max"
        AUDIO_API_KEY = OPENROUTER_API_KEY = ASSIST_API_KEY_QWEN

except FileNotFoundError:
    pass
except Exception as e:
    logger.error(f"Error parsing Core API Key: {e}")

if  AUDIO_API_KEY == '':
    AUDIO_API_KEY = CORE_API_KEY
if  OPENROUTER_API_KEY == '':
    OPENROUTER_API_KEY = CORE_API_KEY

if not CORE_API_KEY.startswith('sk'):
    logger.error("💥 请检查Core API Key是否正确，通常以'sk-'开头。请在设置页面中重新设置。")
