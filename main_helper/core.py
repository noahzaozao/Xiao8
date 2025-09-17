"""
本文件是主逻辑文件，负责管理整个对话流程。当选择不使用TTS时，将会通过OpenAI兼容接口使用Omni模型的原生语音输出。
当选择使用TTS时，将会通过额外的TTS API去合成语音。注意，TTS API的输出是流式输出、且需要与用户输入进行交互，实现打断逻辑。
TTS部分使用了两个队列，原本只需要一个，但是阿里的TTS API回调函数只支持同步函数，所以增加了一个response queue来异步向前端发送音频数据。
"""
import asyncio
import json
import traceback
import struct  # For packing audio data
import threading
import re
import requests
import logging
from datetime import datetime
from websockets import exceptions as web_exceptions
from fastapi import WebSocket, WebSocketDisconnect
from utils.frontend_utils import contains_chinese, replace_blank, replace_corner_mark, remove_bracket, spell_out_number, \
    is_only_punctuation, split_paragraph
from utils.audio import make_wav_header
from main_helper.omni_realtime_client import OmniRealtimeClient
import inflect
import base64
from io import BytesIO
from PIL import Image
from config import get_character_data, CORE_URL, CORE_MODEL, EMOTION_MODEL, CORE_API_KEY, MEMORY_SERVER_PORT, AUDIO_API_KEY
from multiprocessing import Process, Queue as MPQueue
from uuid import uuid4
import numpy as np
from librosa import resample
import httpx 

# Setup logger for this module
logger = logging.getLogger(__name__)



# --- 一个带有定期上下文压缩+在线热切换的语音会话管理器 ---
class LLMSessionManager:
    def __init__(self, sync_message_queue, lanlan_name, lanlan_prompt):
        self.websocket = None
        self.sync_message_queue = sync_message_queue
        self.session = None
        self.last_time = None
        self.is_active = False
        self.active_session_is_idle = False
        self.current_expression = None
        self.tts_request_queue = MPQueue() # TTS request (多进程队列)
        self.tts_response_queue = MPQueue() # TTS response (多进程队列)
        self.tts_process = None  # TTS子进程
        self.lock = asyncio.Lock()  # 使用异步锁替代同步锁
        self.current_speech_id = None
        self.inflect_parser = inflect.engine()
        self.emoji_pattern = re.compile(r'[^\w\u4e00-\u9fff\s>][^\w\u4e00-\u9fff\s]{2,}[^\w\u4e00-\u9fff\s<]', flags=re.UNICODE)
        self.emoji_pattern2 = re.compile("["
        u"\U0001F600-\U0001F64F"  # emoticons
        u"\U0001F300-\U0001F5FF"  # symbols & pictographs
        u"\U0001F680-\U0001F6FF"  # transport & map symbols
        u"\U0001F1E0-\U0001F1FF"  # flags (iOS)
                           "]+", flags=re.UNICODE)
        self.emotion_pattern = re.compile('<(.*?)>')

        self.lanlan_prompt = lanlan_prompt
        self.lanlan_name = lanlan_name
        # 获取角色相关配置
        (
            self.master_name,
            self.her_name,
            self.master_basic_config,
            self.lanlan_basic_config,
            self.name_mapping,
            self.lanlan_prompt_map,
            self.semantic_store,
            self.time_store,
            self.setting_store,
            self.recent_log
        ) = get_character_data()
        # 获取API相关配置
        self.model = CORE_MODEL
        self.core_url = CORE_URL
        self.core_api_key = CORE_API_KEY
        self.memory_server_port = MEMORY_SERVER_PORT
        self.audio_api_key = AUDIO_API_KEY
        self.voice_id = self.lanlan_basic_config[self.lanlan_name].get('voice_id', '')
        self.use_tts = False if not self.voice_id else True
        self.generation_config = {}  # Qwen暂时不用
        self.message_cache_for_new_session = []
        self.is_preparing_new_session = False
        self.summary_triggered_time = None
        self.initial_cache_snapshot_len = 0
        self.pending_session_warmed_up_event = None
        self.pending_session_final_prime_complete_event = None
        self.session_start_time = None
        self.pending_connector = None
        self.pending_session = None
        self.is_hot_swap_imminent = False
        self.tts_handler_task = None
        # 热切换相关变量
        self.background_preparation_task = None
        self.final_swap_task = None
        self.receive_task = None
        self.message_handler_task = None
        # 任务完成后的额外回复队列（将在下一次切换时统一汇报）
        self.pending_extra_replies = []
        # 由前端控制的Agent相关开关
        self.agent_flags = {
            'agent_enabled': False,
            'computer_use_enabled': False,
            'mcp_enabled': False,
        }

        # 注册回调
        self.session = OmniRealtimeClient(
            base_url=self.core_url,
            api_key=self.core_api_key,
            model=self.model,
            voice="Chelsie",
            on_text_delta=self.handle_text_data,
            on_audio_delta=self.handle_audio_data,
            on_interrupt=self.handle_interrupt,
            on_input_transcript=self.handle_input_transcript,
            on_output_transcript=self.handle_output_transcript,
            on_connection_error=self.handle_connection_error,
            on_response_done=self.handle_response_complete
        )

    async def handle_interrupt(self):
        if self.use_tts:
            self.tts_request_queue.put((None, None))
        await self.send_user_activity()

    async def handle_text_data(self, text: str, is_first_chunk: bool = False):
        """Qwen文本回调：可用于前端显示、语音合成"""
        if self.use_tts:
            self.tts_request_queue.put((self.current_speech_id, text))
            await self.send_lanlan_response(text, is_first_chunk)
        else:
            pass
            # logger.info(f"\nAssistant: {text}")

    async def handle_response_complete(self):
        """Qwen完成回调：用于处理Core API的响应完成事件，包含TTS和热切换逻辑"""
        if self.use_tts:
            print("Response complete")
            self.tts_request_queue.put((None, None))
        self.sync_message_queue.put({'type': 'system', 'data': 'turn end'})
        
        # 直接向前端发送turn end消息
        try:
            if self.websocket and hasattr(self.websocket, 'client_state') and self.websocket.client_state == self.websocket.client_state.CONNECTED:
                await self.websocket.send_json({'type': 'system', 'data': 'turn end'})
        except Exception as e:
            logger.error(f"💥 WS Send Turn End Error: {e}")

        # 如果有挂起的额外提示：触发热切换准备并安排renew，会在最终swap时统一植入提示
        try:
            if getattr(self, 'pending_extra_replies', None) and len(self.pending_extra_replies) > 0 \
               and not self.is_preparing_new_session and not self.is_hot_swap_imminent:
                await self._trigger_immediate_preparation_for_extra()
        except Exception as e:
            logger.error(f"💥 Extra reply preparation error: {e}")
        
        # 如果正在热切换过程中，跳过所有热切换逻辑
        if self.is_hot_swap_imminent:
            return
            
        if hasattr(self, 'is_preparing_new_session') and not self.is_preparing_new_session:
            if self.session_start_time and \
                        (datetime.now() - self.session_start_time).total_seconds() >= 40:
                logger.info("Main Listener: Uptime threshold met. Marking for new session preparation.")
                self.is_preparing_new_session = True  # Mark that we are in prep mode
                self.summary_triggered_time = datetime.now()
                self.message_cache_for_new_session = []  # Reset cache for this new cycle
                self.initial_cache_snapshot_len = 0  # Reset snapshot marker
                self.sync_message_queue.put({'type': 'system', 'data': 'renew session'}) 

        # If prep mode is active, summary time has passed, and a turn just completed in OLD session:
        # AND background task for initial warmup isn't already running
        if self.is_preparing_new_session and \
                self.summary_triggered_time and \
                (datetime.now() - self.summary_triggered_time).total_seconds() >= 10 and \
                (not self.background_preparation_task or self.background_preparation_task.done()) and \
                not (
                        self.pending_session_warmed_up_event and self.pending_session_warmed_up_event.is_set()):  # Don't restart if already warmed up
            logger.info("Main Listener: Conditions met to start BACKGROUND PREPARATION of pending session.")
            self.pending_session_warmed_up_event = asyncio.Event()  # Create event for this prep cycle
            self.background_preparation_task = asyncio.create_task(self._background_prepare_pending_session())

        # Stage 2: Trigger FINAL SWAP if pending session is warmed up AND this old session just completed a turn
        elif self.pending_session_warmed_up_event and \
                self.pending_session_warmed_up_event.is_set() and \
                not self.is_hot_swap_imminent and \
                (not self.final_swap_task or self.final_swap_task.done()):
            logger.info(
                "Main Listener: OLD session completed a turn & PENDING session is warmed up. Triggering FINAL SWAP sequence.")
            self.is_hot_swap_imminent = True  # Prevent re-triggering

            # The main cache self.message_cache_for_new_session is now "spent" for transfer purposes
            # It will be fully cleared after a successful swap by _reset_preparation_state.
            self.pending_session_final_prime_complete_event = asyncio.Event()
            self.final_swap_task = asyncio.create_task(
                self._perform_final_swap_sequence()
            )
            # The old session listener's current turn is done.
            # The final_swap_task will now manage the actual switch.
            # This listener will be cancelled by the final_swap_task.


    async def handle_audio_data(self, audio_data: bytes):
        """Qwen音频回调：推送音频到WebSocket前端"""
        if not self.use_tts:
            if self.websocket and hasattr(self.websocket, 'client_state') and self.websocket.client_state == self.websocket.client_state.CONNECTED:
                # 这里假设audio_data为PCM16字节流，直接推送
                audio = np.frombuffer(audio_data, dtype=np.int16)
                audio = (resample(audio.astype(np.float32) / 32768.0, orig_sr=24000, target_sr=48000)*32767.).clip(-32768, 32767).astype(np.int16)

                await self.send_speech(audio.tobytes())
                # 你可以根据需要加上格式、isNewMessage等标记
                # await self.websocket.send_json({"type": "cozy_audio", "format": "blob", "isNewMessage": True})
            else:
                pass  # websocket未连接时忽略

    async def handle_input_transcript(self, transcript: str):
        """Qwen输入转录回调：同步转录文本到消息队列和缓存"""
        # 推送到同步消息队列
        self.sync_message_queue.put({"type": "user", "data": {"input_type": "transcript", "data": transcript.strip()}})
        # 缓存到session cache
        if hasattr(self, 'is_preparing_new_session') and self.is_preparing_new_session:
            if not hasattr(self, 'message_cache_for_new_session'):
                self.message_cache_for_new_session = []
            if len(self.message_cache_for_new_session) == 0 or self.message_cache_for_new_session[-1]['role'] == self.lanlan_name:
                self.message_cache_for_new_session.append({"role": self.master_name, "text": transcript.strip()})
            elif self.message_cache_for_new_session[-1]['role'] == self.master_name:
                self.message_cache_for_new_session[-1]['text'] += transcript.strip()
        # 可选：推送用户活动
        async with self.lock:
            self.current_speech_id = str(uuid4())

    async def handle_output_transcript(self, text: str, is_first_chunk: bool = False):
        if self.use_tts:
            self.tts_request_queue.put((self.current_speech_id, text))
        await self.send_lanlan_response(text, is_first_chunk)

    async def send_lanlan_response(self, text: str, is_first_chunk: bool = False):
        """Qwen输出转录回调：可用于前端显示/缓存/同步。"""
        try:
            if self.websocket and hasattr(self.websocket, 'client_state') and self.websocket.client_state == self.websocket.client_state.CONNECTED:
                text = self.emotion_pattern.sub('', text)
                message = {
                    "type": "gemini_response",
                    "text": text,
                    "isNewMessage": is_first_chunk  # 标记是否是新消息的第一个chunk
                }
                await self.websocket.send_json(message)
                self.sync_message_queue.put({"type": "json", "data": message})
                if hasattr(self, 'is_preparing_new_session') and self.is_preparing_new_session:
                    if not hasattr(self, 'message_cache_for_new_session'):
                        self.message_cache_for_new_session = []
                    if len(self.message_cache_for_new_session) == 0 or self.message_cache_for_new_session[-1]['role']==self.master_name:
                        self.message_cache_for_new_session.append(
                            {"role": self.lanlan_name, "text": text})
                    elif self.message_cache_for_new_session[-1]['role'] == self.lanlan_name:
                        self.message_cache_for_new_session[-1]['text'] += text

        except WebSocketDisconnect:
            logger.info("Frontend disconnected.")
        except Exception as e:
            logger.error(f"💥 WS Send Lanlan Response Error: {e}")
        
    async def handle_connection_error(self, message=None):
        if message:
            if '欠费' in message:
                await self.send_status("💥 智谱API触发欠费bug。请考虑充值1元。")
            elif 'standing' in message:
                await self.send_status("💥 阿里API已欠费。")
            else:
                await self.send_status(message)
        logger.info("💥 Session closed by API Server.")
        await self.disconnected_by_server()

    def _reset_preparation_state(self, clear_main_cache=False, from_final_swap=False):
        """[热切换相关] Helper to reset flags and pending components related to new session prep."""
        self.is_preparing_new_session = False
        self.summary_triggered_time = None
        self.initial_cache_snapshot_len = 0
        if self.background_preparation_task and not self.background_preparation_task.done():  # If bg prep was running
            self.background_preparation_task.cancel()
        if self.final_swap_task and not self.final_swap_task.done() and not from_final_swap:  # If final swap was running
            self.final_swap_task.cancel()
        self.background_preparation_task = None
        self.final_swap_task = None
        self.pending_session_warmed_up_event = None
        self.pending_session_final_prime_complete_event = None

        if clear_main_cache:
            self.message_cache_for_new_session = []

    async def _cleanup_pending_session_resources(self):
        """[热切换相关] Safely cleans up ONLY PENDING connector and session if they exist AND are not the current main session."""
        # Stop any listener specifically for the pending session (if different from main listener structure)
        # The _listen_for_pending_session_response tasks are short-lived and managed by their callers.
        if self.pending_session:
            await self.pending_session.close()
        self.pending_session = None  # Managed by connector's __aexit__

    def _init_renew_status(self):
        self._reset_preparation_state(True)
        self.session_start_time = None  # 记录当前 session 开始时间
        self.pending_session = None  # Managed by connector's __aexit__
        self.is_hot_swap_imminent = False

    def normalize_text(self, text): # 对文本进行基本预处理
        text = text.strip()
        text = text.replace("\n", "")
        if contains_chinese(text):
            text = replace_blank(text)
            text = replace_corner_mark(text)
            text = text.replace(".", "。")
            text = text.replace(" - ", "，")
            text = remove_bracket(text)
            text = re.sub(r'[，、]+$', '。', text)
        else:
            text = remove_bracket(text)
            text = spell_out_number(text, self.inflect_parser)
        text = self.emoji_pattern2.sub('', text)
        text = self.emoji_pattern.sub('', text)
        if is_only_punctuation(text) and text not in ['<', '>']:
            return ""
        return text

    async def start_session(self, websocket: WebSocket, new=False):
        self.websocket = websocket
        async with self.lock:
            if self.is_active:
                return

        # new session时重置部分状态
        if self.use_tts:
            # 启动TTS子进程
            if self.tts_process is None or not self.tts_process.is_alive():
                self.tts_process = Process(
                    target=speech_synthesis_worker,
                    args=(self.tts_request_queue, self.tts_response_queue, self.audio_api_key, self.voice_id)
                )
                self.tts_process.daemon = True
                self.tts_process.start()
            if self.tts_handler_task is None or not self.tts_handler_task.done():
                self.tts_handler_task = asyncio.create_task(self.tts_response_handler())

        if new:
            self.message_cache_for_new_session = []
            self.last_time = None
            self.is_preparing_new_session = False
            self.summary_triggered_time = None
            self.initial_cache_snapshot_len = 0

        try:
            # 获取初始 prompt
            initial_prompt = ("你是一个角色扮演大师，并且精通电脑操作。请按要求扮演以下角色（self.lanlan_name），并在对方请求时、回答“我试试”并尝试操纵电脑。" if self._is_agent_enabled() else "你是一个角色扮演大师。请按要求扮演以下角色（self.lanlan_name）。") + self.lanlan_prompt
            initial_prompt += requests.get(f"http://localhost:{self.memory_server_port}/new_dialog/{self.lanlan_name}").text
            try:
                print("[LLM Prompt][core.initial]", initial_prompt)
            except Exception:
                pass

            # 标记 session 激活
            if self.session:
                await self.session.connect(initial_prompt, native_audio = not self.use_tts)
                async with self.lock:
                    self.is_active = True
                # await self.session.create_response("SYSTEM_MESSAGE | " + initial_prompt)
                # await self.session.create_response("SYSTEM_MESSAGE | 当前时间：" + str(
                #             datetime.now().strftime(
                #                 "%Y-%m-%d %H:%M")) + f'。 现在请{self.lanlan_name}准备，即将开始用语音与{MASTER_NAME}继续对话。\n')
                self.session_start_time = datetime.now()
                
                # 启动消息处理任务
                self.message_handler_task = asyncio.create_task(self.session.handle_messages())
            else:
                raise Exception("Session not initialized")
            
        except Exception as e:
            error_message = f"Error starting session: {e}"
            logger.error(f"💥 {error_message}")
            traceback.print_exc()
            await self.send_status(error_message)
            if 'actively refused it' in str(e):
                await self.send_status("💥 记忆服务器已崩溃。请检查API Key是否正确。")
            elif '401' in str(e):
                await self.send_status("💥 API Key被服务器拒绝。请检查API Key是否与所选模型匹配。")
            await self.cleanup()

    async def send_user_activity(self):
        try:
            if self.websocket and hasattr(self.websocket, 'client_state') and self.websocket.client_state == self.websocket.client_state.CONNECTED:
                message = {
                    "type": "user_activity"
                }
                await self.websocket.send_json(message)
        except WebSocketDisconnect:
            pass
        except Exception as e:
            logger.error(f"💥 WS Send User Activity Error: {e}")

    def _convert_cache_to_str(self, cache):
        """[热切换相关] 将cache转换为字符串"""
        res = ""
        for i in cache:
            res += f"{i['role']} | {i['text']}\n"
        return res

    def _is_agent_enabled(self):
        return self.agent_flags['agent_enabled'] and (self.agent_flags['computer_use_enabled'] or self.agent_flags['mcp_enabled'])

    async def _background_prepare_pending_session(self):
        """[热切换相关] 后台预热pending session"""

        # 2. Create PENDING session components (as before, store in self.pending_connector, self.pending_session)
        try:
            # 创建新的pending session
            self.pending_session = OmniRealtimeClient(
                base_url=self.core_url,
                api_key=self.core_api_key,
                model=self.model,
                voice="Chelsie",
                on_text_delta=self.handle_text_data,
                on_audio_delta=self.handle_audio_data,
                on_interrupt=self.handle_interrupt,
                on_input_transcript=self.handle_input_transcript,
                on_output_transcript=self.handle_output_transcript,
                on_connection_error=self.handle_connection_error,
                on_response_done=self.handle_response_complete
            )
            
            initial_prompt = ("你是一个角色扮演大师，并且精通电脑操作。请按要求扮演以下角色（self.lanlan_name），在对方请求时、回答“我试试”并尝试操纵电脑。" if self._is_agent_enabled() else "你是一个角色扮演大师。请按要求扮演以下角色（self.lanlan_name）。") + self.lanlan_prompt
            self.initial_cache_snapshot_len = len(self.message_cache_for_new_session)
            async with httpx.AsyncClient() as client:
                resp = await client.get(f"http://localhost:{self.memory_server_port}/new_dialog/{self.lanlan_name}")
                initial_prompt += resp.text + self._convert_cache_to_str(self.message_cache_for_new_session)
            try:
                print("[LLM Prompt][core.pending_initial]", initial_prompt)
            except Exception:
                pass
            await self.pending_session.connect(initial_prompt, native_audio = not self.use_tts)

            # 4. Start temporary listener for PENDING session's *first* ignored response
            #    and wait for it to complete.
            if self.pending_session_warmed_up_event:
                self.pending_session_warmed_up_event.set() 

        except asyncio.CancelledError:
            logger.error("💥 BG Prep Stage 1: Task cancelled.")
            await self._cleanup_pending_session_resources()
            # Do not set warmed_up_event here if cancelled.
        except Exception as e:
            logger.error(f"💥 BG Prep Stage 1: Error: {e}")
            traceback.print_exc()
            await self._cleanup_pending_session_resources()
            # Do not set warmed_up_event on error.
        finally:
            # Ensure this task variable is cleared so it's known to be done
            if self.background_preparation_task and self.background_preparation_task.done():
                self.background_preparation_task = None

    async def _trigger_immediate_preparation_for_extra(self):
        """当需要注入额外提示时，如果当前未进入准备流程，立即开始准备并安排renew逻辑。"""
        try:
            if not self.is_preparing_new_session:
                logger.info("Extra Reply: Triggering preparation due to pending extra reply.")
                self.is_preparing_new_session = True
                self.summary_triggered_time = datetime.now()
                self.message_cache_for_new_session = []
                self.initial_cache_snapshot_len = 0
                # 立即启动后台预热，不等待10秒
                self.pending_session_warmed_up_event = asyncio.Event()
                if not self.background_preparation_task or self.background_preparation_task.done():
                    self.background_preparation_task = asyncio.create_task(self._background_prepare_pending_session())
        except Exception as e:
            logger.error(f"💥 Extra Reply: preparation trigger error: {e}")

    # 供主服务调用，更新Agent模式相关开关
    def update_agent_flags(self, flags: dict):
        try:
            for k in ['agent_enabled', 'computer_use_enabled', 'mcp_enabled']:
                if k in flags and isinstance(flags[k], bool):
                    self.agent_flags[k] = flags[k]
        except Exception:
            pass

    async def _perform_final_swap_sequence(self):
        """[热切换相关] 执行最终的swap序列"""
        logger.info("Final Swap Sequence: Starting...")
        if not self.pending_session:
            logger.error("💥 Final Swap Sequence: Pending session not found. Aborting swap.")
            self._reset_preparation_state(clear_main_cache=False)  # Reset flags, keep cache for next attempt
            self.is_hot_swap_imminent = False
            return

        try:
            incremental_cache = self.message_cache_for_new_session[self.initial_cache_snapshot_len:]
            # 1. Send incremental cache (or a heartbeat) to PENDING session for its *second* ignored response
            if incremental_cache:
                final_prime_text = f"SYSTEM_MESSAGE | " + self._convert_cache_to_str(incremental_cache)
            else:  # Ensure session cycles a turn even if no incremental cache
                logger.error(f"💥 Unexpected: No incremental cache found. {len(self.message_cache_for_new_session)}, {self.initial_cache_snapshot_len}")
                final_prime_text = f"SYSTEM_MESSAGE | 系统自动报时，当前时间： " + str(datetime.now().strftime("%Y-%m-%d %H:%M"))

            # 若存在需要植入的额外提示，则指示模型忽略上一条消息，并在下一次响应中统一向用户补充这些提示
            if self.pending_extra_replies and len(self.pending_extra_replies) > 0:
                try:
                    items = "\n".join([f"- {txt}" for txt in self.pending_extra_replies if isinstance(txt, str) and txt.strip()])
                except Exception:
                    items = ""
                final_prime_text += (
                    "\n[注入指令] 请忽略上一次用户的最后一条输入，不要继续该轮对话。"
                    " 在你的下一次响应中，用简洁自然的一段话汇报和解释你先前执行的任务的结果，简要说明你做了什么：\n"
                    + items +
                    "\n完成上述汇报后，恢复正常的对话节奏。"
                )
                # 清空队列，避免重复注入
                self.pending_extra_replies.clear()
                await self.pending_session.create_response(final_prime_text, skipped=False)
            else:
                final_prime_text += f"=======以上为前情概要。现在请{self.lanlan_name}准备，即将开始用语音与{self.master_name}继续对话。\n"
                await self.pending_session.create_response(final_prime_text, skipped=True)

            # 2. Start temporary listener for PENDING session's *second* ignored response
            if self.pending_session_final_prime_complete_event:
                self.pending_session_final_prime_complete_event.is_set()

            # --- PERFORM ACTUAL HOT SWAP ---
            logger.info("Final Swap Sequence: Starting actual session swap...")
            old_main_session = self.session
            old_main_message_handler_task = self.message_handler_task
            
            # 先停止旧session的消息处理任务
            if old_main_message_handler_task and not old_main_message_handler_task.done():
                logger.info("Final Swap Sequence: Cancelling old message handler task...")
                old_main_message_handler_task.cancel()
                try:
                    await asyncio.wait_for(old_main_message_handler_task, timeout=2.0)
                except asyncio.TimeoutError:
                    logger.warning("Final Swap Sequence: Warning: Old message handler task cancellation timeout.")
                except asyncio.CancelledError:
                    pass
                except Exception as e:
                    logger.error(f"💥 Final Swap Sequence: Error cancelling old message handler: {e}")
            
            # 执行session切换
            logger.info("Final Swap Sequence: Swapping sessions...")
            self.session = self.pending_session
            self.session_start_time = datetime.now()

            # Start the main listener for the NEWLY PROMOTED self.session
            if self.session and hasattr(self.session, 'handle_messages'):
                self.message_handler_task = asyncio.create_task(self.session.handle_messages())

            # 关闭旧session
            if old_main_session:
                logger.info("Final Swap Sequence: Closing old session...")
                try:
                    await old_main_session.close()
                    logger.info("Final Swap Sequence: Old session closed successfully.")
                except Exception as e:
                    logger.error(f"💥 Final Swap Sequence: Error closing old session: {e}")

        
            # Reset all preparation states and clear the *main* cache now that it's fully transferred
            self.pending_session = None
            self._reset_preparation_state(
                clear_main_cache=True, from_final_swap=True)  # This will clear pending_*, is_preparing_new_session, etc. and self.message_cache_for_new_session
            logger.info("Final Swap Sequence: Hot swap completed successfully.")

        except asyncio.CancelledError:
            logger.info("Final Swap Sequence: Task cancelled.")
            # If cancelled mid-swap, state could be inconsistent. Prioritize cleaning pending.
            await self._cleanup_pending_session_resources()
            self._reset_preparation_state(clear_main_cache=False)  # Don't clear cache if swap didn't complete
            # The old main session listener might have been cancelled, needs robust restart if still active
            if self.is_active and self.session and hasattr(self.session, 'handle_messages') and (not self.message_handler_task or self.message_handler_task.done()):
                logger.info(
                    "Final Swap Sequence: Task cancelled, ensuring main listener is running for potentially old session.")
                self.message_handler_task = asyncio.create_task(self.session.handle_messages())

        except Exception as e:
            logger.error(f"💥 Final Swap Sequence: Error: {e}")
            traceback.print_exc()
            await self.send_status(f"内部更新切换失败: {e}.")
            await self._cleanup_pending_session_resources()
            self._reset_preparation_state(clear_main_cache=False)
            if self.is_active and self.session and hasattr(self.session, 'handle_messages') and (not self.message_handler_task or self.message_handler_task.done()):
                self.message_handler_task = asyncio.create_task(self.session.handle_messages())
        finally:
            self.is_hot_swap_imminent = False  # Always reset this flag
            if self.final_swap_task and self.final_swap_task.done():
                self.final_swap_task = None
            logger.info("Final Swap Sequence: Routine finished.")

    async def system_timer(self):  #定期向Lanlan发送心跳，允许Lanlan主动向用户搭话。
        '''这个模块在开源版中没有实际用途，因为开源版不支持主动搭话。原因是在实际测试中，搭话效果不佳。'''
        while True:
            if self.session and self.active_session_is_idle:
                if self.last_time != str(datetime.now().strftime("%Y-%m-%d %H:%M")):
                    self.last_time = str(datetime.now().strftime("%Y-%m-%d %H:%M"))
                    try:
                        await self.session.create_response("SYSTEM_MESSAGE | 当前时间：" + self.last_time + "。")
                    except web_exceptions.ConnectionClosedOK:
                        break
                    except web_exceptions.ConnectionClosedError as e:
                        logger.error(f"💥 System timer: Error sending data to session: {e}")
                        await self.disconnected_by_server()
                    except Exception as e:
                        error_message = f"System timer: Error sending data to session: {e}"
                        logger.error(f"💥 {error_message}")
                        traceback.print_exc()
                        await self.send_status(error_message)
            await asyncio.sleep(5)

    async def disconnected_by_server(self):
        await self.send_status(f"{self.lanlan_name}失联了，即将重启！")
        self.sync_message_queue.put({'type': 'system', 'data': 'API server disconnected'})
        await self.cleanup()

    async def stream_data(self, message: dict):  # 向Core API发送Media数据
        if not self.is_active or not self.session:
            return
            
        # 额外检查session是否有效
        if not hasattr(self.session, 'ws') or not self.session.ws:
            logger.error("💥 Stream: Session websocket not available")
            return
            
        data = message.get("data")
        input_type = message.get("input_type")
        try:
            if input_type == 'audio':
                try:
                    if isinstance(data, list):
                        audio_bytes = struct.pack(f'<{len(data)}h', *data)
                        await self.session.stream_audio(audio_bytes)
                    else:
                        logger.error(f"💥 Stream: Invalid audio data type: {type(data)}")
                        return

                except struct.error as se:
                    logger.error(f"💥 Stream: Struct packing error (audio): {se}")
                    return
                except web_exceptions.ConnectionClosedOK:
                    return
                except Exception as e:
                    logger.error(f"💥 Stream: Error processing audio data: {e}")
                    traceback.print_exc()
                    return

            elif input_type in ['screen', 'camera']:
                try:
                    if isinstance(data, str) and data.startswith('data:image/jpeg;base64,'):
                        img_data = data.split(',')[1]
                        img_bytes = base64.b64decode(img_data)
                        # Resize to 480p (height=480, keep aspect ratio)
                        image = Image.open(BytesIO(img_bytes))
                        w, h = image.size
                        new_h = 480
                        new_w = int(w * (new_h / h))
                        image = image.resize((new_w, new_h), Image.Resampling.LANCZOS)
                        buffer = BytesIO()
                        image.save(buffer, format='JPEG')
                        buffer.seek(0)
                        resized_bytes = buffer.read()
                        resized_b64 = base64.b64encode(resized_bytes).decode('utf-8')
                        await self.session.stream_image(resized_b64)
                    else:
                        logger.error(f"💥 Stream: Invalid screen data format.")
                        return
                except ValueError as ve:
                    logger.error(f"💥 Stream: Base64 decoding error (screen): {ve}")
                    return
                except Exception as e:
                    logger.error(f"💥 Stream: Error processing screen data: {e}")
                    return

        except web_exceptions.ConnectionClosedError as e:
            logger.error(f"💥 Stream: Error sending data to session: {e}")
            if '1011' in str(e):
                print(f"💥 备注：检测到1011错误。该错误表示API服务器异常。请首先检查自己的麦克风是否有声音。")
            if '1007' in str(e):
                print(f"💥 备注：检测到1007错误。该错误大概率是欠费导致。")
            await self.disconnected_by_server()
            return
        except Exception as e:
            error_message = f"Stream: Error sending data to session: {e}"
            logger.error(f"💥 {error_message}")
            traceback.print_exc()
            await self.send_status(error_message)

    async def end_session(self, by_server=False):  # 与Core API断开连接
        self._init_renew_status()

        async with self.lock:
            if not self.is_active:
                return

        logger.info("End Session: Starting cleanup...")
        self.sync_message_queue.put({'type': 'system', 'data': 'session end'})
        async with self.lock:
            self.is_active = False

        if self.message_handler_task:
            self.message_handler_task.cancel()
            try:
                await asyncio.wait_for(self.message_handler_task, timeout=3.0)
            except asyncio.CancelledError:
                pass
            except asyncio.TimeoutError:
                logger.warning("End Session: Warning: Listener task cancellation timeout.")
            except Exception as e:
                logger.error(f"💥 End Session: Error during listener task cancellation: {e}")
            self.message_handler_task = None

        if self.session:
            try:
                logger.info("End Session: Closing connection...")
                await self.session.close()
                logger.info("End Session: Qwen connection closed.")
            except Exception as e:
                logger.error(f"💥 End Session: Error during cleanup: {e}")
                traceback.print_exc()
        # 关闭TTS子进程
        if self.use_tts and self.tts_process and self.tts_process.is_alive():
            self.tts_request_queue.put((None, None))  # 通知子进程退出
            self.tts_process.terminate()
            self.tts_process.join()
            self.tts_process = None
        if self.use_tts and self.tts_handler_task and not self.tts_handler_task.done():
            self.tts_handler_task.cancel()
            self.tts_handler_task = None

        self.last_time = None
        await self.send_expressions()
        if not by_server:
            await self.send_status(f"{self.lanlan_name}已离开。")
            logger.info("End Session: Resources cleaned up.")

    async def cleanup(self):
        await self.end_session(by_server=True)

    async def send_status(self, message: str): # 向前端发送status message
        try:
            if self.websocket and hasattr(self.websocket, 'client_state') and self.websocket.client_state == self.websocket.client_state.CONNECTED:
                data = json.dumps({"type": "status", "message": message})
                await self.websocket.send_text(data)

                # 同步到同步服务器
                self.sync_message_queue.put({'type': 'json', 'data': {"type": "status", "message": message}})
        except WebSocketDisconnect:
            pass
        except Exception as e:
            logger.error(f"💥 WS Send Status Error: {e}")

    async def send_expressions(self, prompt=""):
        '''这个函数在直播版本中有用，用于控制Live2D模型的表情动作。但是在开源版本目前没有实际用途。'''
        try:
            expression_map = {}
            if self.websocket and hasattr(self.websocket, 'client_state') and self.websocket.client_state == self.websocket.client_state.CONNECTED:
                if prompt in expression_map:
                    if self.current_expression:
                        await self.websocket.send_json({
                            "type": "expression",
                            "message": '-',
                        })
                    await self.websocket.send_json({
                        "type": "expression",
                        "message": expression_map[prompt] + '+',
                    })
                    self.current_expression = expression_map[prompt]
                else:
                    if self.current_expression:
                        await self.websocket.send_json({
                            "type": "expression",
                            "message": '-',
                        })

                if prompt in expression_map:
                    self.sync_message_queue.put({"type": "json",
                                                 "data": {
                        "type": "expression",
                        "message": expression_map[prompt] + '+',
                    }})
                else:
                    if self.current_expression:
                        self.sync_message_queue.put({"type": "json",
                         "data": {
                             "type": "expression",
                             "message": '-',
                         }})
                        self.current_expression = None

        except WebSocketDisconnect:
            pass
        except Exception as e:
            logger.error(f"💥 WS Send Response Error: {e}")


    async def send_speech(self, tts_audio):
        try:
            if self.websocket and hasattr(self.websocket, 'client_state') and self.websocket.client_state == self.websocket.client_state.CONNECTED:
                await self.websocket.send_bytes(tts_audio)

                # 同步到同步服务器
                self.sync_message_queue.put({"type": "binary", "data": tts_audio})
        except WebSocketDisconnect:
            pass
        except Exception as e:
            logger.error(f"💥 WS Send Response Error: {e}")

    async def tts_response_handler(self):
        while True:
            while not self.tts_response_queue.empty():
                data = self.tts_response_queue.get_nowait()
                await self.send_speech(data)
            await asyncio.sleep(0.01)

# TTS多进程worker函数，供主进程Process(target=...)调用

def speech_synthesis_worker(request_queue, response_queue, audio_api_key, voice_id):
    import dashscope
    from dashscope.audio.tts_v2 import ResultCallback, SpeechSynthesizer, AudioFormat
    import numpy as np
    from librosa import resample
    import re
    import time
    dashscope.api_key = audio_api_key
    class Callback(ResultCallback):
        def __init__(self, response_queue):
            self.response_queue = response_queue
            self.cache = np.zeros(0).astype(np.float32)
        def on_open(self): pass
        def on_complete(self): 
            if len(self.cache)>0:
                data = (resample(self.cache, orig_sr=24000, target_sr=48000)*32768.).clip(-32768, 32767).astype(np.int16).tobytes()
                self.response_queue.put(data)
                self.cache = np.zeros(0).astype(np.float32)
        def on_error(self, message: str): print(f"TTS Error: {message}")
        def on_close(self): pass
        def on_event(self, message): pass
        def on_data(self, data: bytes) -> None:
            audio = np.frombuffer(data, dtype=np.int16).astype(np.float32) / 32768.0
            self.cache = np.concatenate([self.cache, audio])
            if len(self.cache)>=8000:
                data = self.cache[:8000]
                data = (resample(data, orig_sr=24000, target_sr=48000)*32768.).clip(-32768, 32767).astype(np.int16).tobytes()
                self.response_queue.put(data)
                self.cache = self.cache[8000:]
            
            
    callback = Callback(response_queue)
    current_speech_id = None
    synthesizer = None
    while True:
        # 非阻塞检查队列，优先处理打断
        if request_queue.empty():
            time.sleep(0.01)
            continue

        sid, tts_text = request_queue.get()
        if sid is None and synthesizer is not None:
            # 合成完毕
            try:
                current_speech_id = None
                synthesizer.streaming_complete()
            except Exception:
                synthesizer = None
            continue
        if current_speech_id is None or current_speech_id != sid or synthesizer is None:
            current_speech_id = sid
            try:
                if synthesizer is not None:
                    try:
                        synthesizer.streaming_complete()
                        synthesizer.close()
                    except Exception:
                        pass
                synthesizer = SpeechSynthesizer(
                    model="cosyvoice-v2",
                    voice=voice_id,
                    speech_rate=1.1,
                    format=AudioFormat.PCM_24000HZ_MONO_16BIT,
                    callback=callback,
                )
            except Exception as e:
                print("TTS Error: ", e)
                synthesizer = None
                current_speech_id = None
                continue
        if not tts_text:
            time.sleep(0.01)
            continue
        # 处理表情等逻辑
        try:
            synthesizer.streaming_call(tts_text)
        except Exception as e:
            print("TTS Error: ", e)
            synthesizer = None
            current_speech_id = None
            continue

