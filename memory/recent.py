from datetime import datetime
from config import get_character_data, SUMMARY_MODEL, OPENROUTER_API_KEY, OPENROUTER_URL
from langchain_openai import ChatOpenAI
from langchain_core.messages import SystemMessage, messages_to_dict, messages_from_dict, HumanMessage, AIMessage
import json
import os

from config.api import CORRECTION_MODEL
from config.prompts_sys import recent_history_manager_prompt, detailed_recent_history_manager_prompt, further_summarize_prompt, history_review_prompt

class CompressedRecentHistoryManager:
    def __init__(self, max_history_length=10):
        # 通过get_character_data获取相关变量
        _, _, _, _, name_mapping, _, _, _, _, recent_log = get_character_data()
        # 修复API key类型问题
        api_key = OPENROUTER_API_KEY if OPENROUTER_API_KEY and OPENROUTER_API_KEY != '' else None
        self.llm = ChatOpenAI(model=SUMMARY_MODEL, base_url=OPENROUTER_URL, api_key=api_key, temperature=0.3)
        self.review_llm = ChatOpenAI(model=CORRECTION_MODEL, base_url=OPENROUTER_URL, api_key=api_key, temperature=0.1)
        self.max_history_length = max_history_length
        self.log_file_path = recent_log
        self.name_mapping = name_mapping
        self.user_histories = {}
        for ln in self.log_file_path:
            if os.path.exists(self.log_file_path[ln]):
                with open(self.log_file_path[ln], encoding='utf-8') as f:
                    self.user_histories[ln] = messages_from_dict(json.load(f))
            else:
                self.user_histories[ln] = []


    def update_history(self, new_messages, lanlan_name, detailed=False):
        if os.path.exists(self.log_file_path[lanlan_name]):
            with open(self.log_file_path[lanlan_name], encoding='utf-8') as f:
                self.user_histories[lanlan_name] = messages_from_dict(json.load(f))

        try:
            self.user_histories[lanlan_name].extend(new_messages)

            if len(self.user_histories[lanlan_name]) > self.max_history_length:
                # 压缩旧消息
                to_compress = self.user_histories[lanlan_name][:-self.max_history_length+1]
                compressed = [self.compress_history(to_compress, lanlan_name, detailed)[0]]

                # 只保留最近的max_history_length条消息
                self.user_histories[lanlan_name] = compressed + self.user_histories[lanlan_name][-self.max_history_length+1:]
        except Exception as e:
            print("Error when updating history: ", e)
            import traceback
            traceback.print_exc()

        with open(self.log_file_path[lanlan_name], "w", encoding='utf-8') as f:
            json.dump(messages_to_dict(self.user_histories[lanlan_name]), f, indent=2, ensure_ascii=False)


    # detailed: 保留尽可能多的细节
    def compress_history(self, messages, lanlan_name, detailed=False):
        name_mapping = self.name_mapping.copy()
        name_mapping['ai'] = lanlan_name
        lines = []
        for msg in messages:
            role = name_mapping.get(getattr(msg, 'type', ''), getattr(msg, 'type', ''))
            content = getattr(msg, 'content', '')
            if isinstance(content, str):
                line = f"{role} | {content}"
            else:
                parts = []
                try:
                    for item in content:
                        if isinstance(item, dict):
                            parts.append(item.get('text', f"|{item.get('type', '')}|"))
                        else:
                            parts.append(str(item))
                except Exception:
                    parts = [str(content)]
                joined = "\n".join(parts)
                line = f"{role} | {joined}"
            lines.append(line)
        messages_text = "\n".join(lines)
        if not detailed:
            prompt = recent_history_manager_prompt % messages_text
        else:
            prompt = detailed_recent_history_manager_prompt % messages_text

        retries = 0
        while retries < 3:
            try:
                # 尝试将响应内容解析为JSON
                print("[LLM Prompt][recent.compress]", prompt)
                response_content = self.llm.invoke(prompt).content
                # 修复类型问题：确保response_content是字符串
                if isinstance(response_content, list):
                    response_content = str(response_content)
                if response_content.startswith("```"):
                    response_content = response_content.replace('```json','').replace('```', '')
                summary_json = json.loads(response_content)
                # 从JSON字典中提取对话摘要，假设摘要存储在名为'key'的键下
                if '对话摘要' in summary_json:
                    print(f"💗摘要结果：{summary_json['对话摘要']}")
                    summary = summary_json['对话摘要']
                    if len(summary) > 500:
                        summary = self.further_compress(summary)
                        if summary is None:
                            continue
                    # Listen. Here, summary_json['对话摘要'] is not supposed to be anything else than str, but Qwen is shit.
                    return SystemMessage(content=f"先前对话的备忘录: {summary}"), str(summary_json['对话摘要'])
                else:
                    print('💥 摘要failed: ', response_content)
                    retries += 1
            except Exception as e:
                print('摘要模型失败：', e)
                # 如果解析失败，重试
                retries += 1
        # 如果所有重试都失败，返回None
        return SystemMessage(content=f"先前对话的备忘录: 无。"), ""

    def further_compress(self, initial_summary):
        retries = 0
        while retries < 3:
            try:
                # 尝试将响应内容解析为JSON
                _prompt = further_summarize_prompt % initial_summary
                print("[LLM Prompt][recent.further]", _prompt)
                response_content = self.llm.invoke(_prompt).content
                # 修复类型问题：确保response_content是字符串
                if isinstance(response_content, list):
                    response_content = str(response_content)
                if response_content.startswith("```"):
                    response_content = response_content.replace('```json', '').replace('```', '')
                summary_json = json.loads(response_content)
                # 从JSON字典中提取对话摘要，假设摘要存储在名为'key'的键下
                if '对话摘要' in summary_json:
                    print(f"💗第二轮摘要结果：{summary_json['对话摘要']}")
                    return summary_json['对话摘要']
                else:
                    print('💥 第二轮摘要failed: ', response_content)
                    retries += 1
            except Exception as e:
                print('摘要模型失败：', e)
                retries += 1
        return None

    def get_recent_history(self, lanlan_name):
        if os.path.exists(self.log_file_path[lanlan_name]):
            with open(self.log_file_path[lanlan_name], encoding='utf-8') as f:
                self.user_histories[lanlan_name] = messages_from_dict(json.load(f))
        return self.user_histories[lanlan_name]

    def review_history(self, lanlan_name):
        """
        审阅历史记录，寻找并修正矛盾、冗余、逻辑混乱或复读的部分
        """
        # 检查配置文件中是否禁用自动审阅
        try:
            config_path = os.path.join(os.path.dirname(__file__), '..', 'config', 'core_config.json')
            if os.path.exists(config_path):
                with open(config_path, 'r', encoding='utf-8') as f:
                    config_data = json.load(f)
                    if 'recent_memory_auto_review' in config_data and not config_data['recent_memory_auto_review']:
                        print(f"💡 {lanlan_name} 的自动记忆审阅已禁用，跳过审阅")
                        return False
        except Exception as e:
            print(f"⚠️ 读取配置文件失败：{e}，继续执行审阅")
        
        # 获取当前历史记录
        
        current_history = self.get_recent_history(lanlan_name)
        
        if not current_history:
            print(f"💡 {lanlan_name} 的历史记录为空，无需审阅")
            return False
        
        # 将消息转换为可读的文本格式
        name_mapping = self.name_mapping.copy()
        name_mapping['ai'] = lanlan_name
        
        history_text = ""
        for msg in current_history:
            if hasattr(msg, 'type') and msg.type in name_mapping:
                role = name_mapping[msg.type]
            else:
                role = "unknown"
            
            if hasattr(msg, 'content'):
                if isinstance(msg.content, str):
                    content = msg.content
                elif isinstance(msg.content, list):
                    content = "\n".join([str(i) if isinstance(i, str) else i.get("text", str(i)) for i in msg.content])
                else:
                    content = str(msg.content)
            else:
                content = str(msg)
            
            history_text += f"{role}: {content}\n\n"
        
        try:
            # 使用LLM审阅历史记录
            prompt = history_review_prompt % (self.name_mapping['human'], name_mapping['ai'], history_text, self.name_mapping['human'], name_mapping['ai'])
            print("[LLM Prompt][recent.review]", prompt)
            response_content = self.llm.invoke(prompt).content
            
            # 确保response_content是字符串
            if isinstance(response_content, list):
                response_content = str(response_content)
            
            # 清理响应内容
            if response_content.startswith("```"):
                response_content = response_content.replace('```json', '').replace('```', '')
            
            # 解析JSON响应
            review_result = json.loads(response_content)
            
            if '修正说明' in review_result and '修正后的对话' in review_result:
                print(f"💡 记忆审阅结果：{review_result['修正说明']}")
                
                # 将修正后的对话转换回消息格式
                corrected_messages = []
                for msg_data in review_result['修正后的对话']:
                    role = msg_data.get('role', 'user')
                    content = msg_data.get('content', '')
                    
                    if role in ['user', 'human', name_mapping['human']]:
                        corrected_messages.append(HumanMessage(content=content))
                    elif role in ['ai', 'assistant', name_mapping['ai']]:
                        corrected_messages.append(AIMessage(content=content))
                    elif role in ['system', 'system_message', name_mapping['system']]:
                        corrected_messages.append(SystemMessage(content=content))
                    else:
                        # 默认作为用户消息处理
                        corrected_messages.append(HumanMessage(content=content))
                
                # 更新历史记录
                self.user_histories[lanlan_name] = corrected_messages
                
                # 保存到文件
                with open(self.log_file_path[lanlan_name], "w", encoding='utf-8') as f:
                    json.dump(messages_to_dict(corrected_messages), f, indent=2, ensure_ascii=False)
                
                print(f"✅ {lanlan_name} 的记忆已修正并保存")
                return True
            else:
                print(f"❌ 审阅响应格式错误：{response_content}")
                return False
                
        except Exception as e:
            print(f"❌ 历史记录审阅失败：{e}")
            import traceback
            traceback.print_exc()
            return False

    def clear_history(self, lanlan_name):
        """
        清除用户的聊天历史
        """
        self.user_histories[lanlan_name] = []
