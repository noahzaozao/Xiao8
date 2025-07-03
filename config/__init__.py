from config.api import *
from config.prompts_chara import *
import json
import os

# 读取角色配置
CHARACTER_JSON_PATH = os.path.join(os.path.dirname(__file__), 'characters.json')
# 默认值
_default_master = {"档案名": "哥哥", "性别": "男", "昵称": "哥哥"}
_default_lanlan = {"test": {"性别": "女", "年龄": 15, "昵称": "T酱, 小T", "live2d": "mao_pro", "voice_id": "", "system_prompt": lanlan_prompt}}

def get_character_data():
    try:
        with open(CHARACTER_JSON_PATH, 'r', encoding='utf-8') as f:
            character_data = json.load(f)
    except FileNotFoundError:
        print(f"⚠️ 未找到猫娘配置文件: {CHARACTER_JSON_PATH}，请检查文件是否存在。使用默认人设。")
        character_data = {"主人": _default_master, "猫娘": _default_lanlan}
    except Exception as e:
        print(f"💥 读取猫娘配置文件出错: {e}，使用默认人设。")
        character_data = {"主人": _default_master, "猫娘": _default_lanlan}

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
    with open('core_config.txt', 'r') as f:
        core_cfg = json.load(f)
    if 'coreApiKey' in core_cfg and core_cfg['coreApiKey'] and core_cfg['coreApiKey'] != CORE_API_KEY:
        print(f"Warning: coreApiKey in core_config.txt is updated. Overwriting CORE_API_KEY.")
        CORE_API_KEY = core_cfg['coreApiKey']

except FileNotFoundError:
    pass
except Exception as e:
    print(f"💥 Error parsing core_config.txt: {e}")

if  AUDIO_API_KEY == '':
    AUDIO_API_KEY = CORE_API_KEY
if  OPENROUTER_API_KEY == '':
    OPENROUTER_API_KEY = CORE_API_KEY
