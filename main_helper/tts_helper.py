"""
TTS Helper模块
负责处理TTS语音合成，支持自定义音色（阿里云CosyVoice）和默认音色（各core_api的原生TTS）
"""
import numpy as np
from librosa import resample
import time
import asyncio
import json
import base64
import logging
import websockets
from enum import Enum
from multiprocessing import Queue as MPQueue, Process
import threading

logger = logging.getLogger(__name__)

def qwen_realtime_tts_worker(request_queue, response_queue, audio_api_key, voice_id):
    """
    Qwen实时TTS worker（用于默认音色）
    使用阿里云的实时TTS API（qwen3-tts-flash-2025-09-18）
    
    Args:
        request_queue: 多进程请求队列，接收(speech_id, text)元组
        response_queue: 多进程响应队列，发送音频数据
        audio_api_key: API密钥
        voice_id: 音色ID，默认使用"cherry"
    """
    import asyncio
    
    # 使用默认音色 "cherry"
    if not voice_id:
        voice_id = "cherry"
    
    async def async_worker():
        """异步TTS worker主循环"""
        tts_url = "wss://dashscope.aliyuncs.com/api-ws/v1/realtime?model=qwen3-tts-flash-realtime-2025-09-18"
        ws = None
        current_speech_id = None
        receive_task = None
        session_ready = asyncio.Event()
        
        try:
            # 连接WebSocket
            headers = {"Authorization": f"Bearer {audio_api_key}"}
            
            # 配置会话消息模板（在重连时复用）
            # 使用 SERVER_COMMIT 模式：多次 append 文本，最后手动 commit 触发合成
            # 这样可以累积文本，避免"一个字一个字往外蹦"的问题
            config_message = {
                "type": "session.update",
                "event_id": f"event_{int(time.time() * 1000)}",
                "session": {
                    "mode": "server_commit",
                    "voice": voice_id,
                    "response_format": "pcm",
                    "sample_rate": 24000,
                    "channels": 1,
                    "bit_depth": 16
                }
            }
            
            ws = await websockets.connect(tts_url, additional_headers=headers)
            logger.info("✅ WebSocket 连接已建立")
            
            # 等待并处理初始消息
            async def wait_for_session_ready():
                """等待会话创建确认"""
                try:
                    async for message in ws:
                        event = json.loads(message)
                        event_type = event.get("type")
                        logger.info(f"📩 收到服务器消息: {event_type}")
                        
                        # Qwen TTS API 返回 session.updated 而不是 session.created
                        if event_type in ["session.created", "session.updated"]:
                            logger.info("✅ TTS会话已创建/更新，准备就绪")
                            session_ready.set()
                            break
                        elif event_type == "error":
                            logger.error(f"❌ 服务器错误: {event}")
                            break
                except Exception as e:
                    logger.error(f"等待会话就绪时出错: {e}")
            
            # 发送配置
            logger.info(f"📤 发送会话配置")
            await ws.send(json.dumps(config_message))
            
            # 等待会话就绪（超时5秒）
            try:
                await asyncio.wait_for(wait_for_session_ready(), timeout=5.0)
            except asyncio.TimeoutError:
                logger.error("❌ 等待会话就绪超时")
                return
            
            if not session_ready.is_set():
                logger.error("❌ 会话未能正确初始化")
                return
            
            # 初始接收任务（会在每次新 speech_id 时重新创建）
            async def receive_messages_initial():
                """初始接收任务"""
                try:
                    logger.info(f"🎧 (初始) 开始接收TTS消息...")
                    async for message in ws:
                        event = json.loads(message)
                        event_type = event.get("type")
                        logger.info(f"📩 (初始) 收到TTS消息: {event_type}")
                        
                        if event_type == "error":
                            logger.error(f"❌ TTS错误: {event}")
                        elif event_type == "response.audio.delta":
                            try:
                                audio_bytes = base64.b64decode(event.get("delta", ""))
                                audio_array = np.frombuffer(audio_bytes, dtype=np.int16)
                                resampled = np.repeat(audio_array, 2)
                                response_queue.put(resampled.tobytes())
                                logger.info(f"🔊 (初始) 已发送音频数据到响应队列，长度: {len(resampled.tobytes())} bytes")
                            except Exception as e:
                                logger.error(f"❌ 处理音频数据时出错: {e}")
                        elif event_type == "response.audio.done":
                            logger.info(f"✅ (初始) TTS音频生成完成")
                        elif event_type == "response.done":
                            logger.info(f"✅ (初始) TTS响应完成")
                    logger.info(f"ℹ️ (初始) TTS消息接收循环结束")
                except websockets.exceptions.ConnectionClosed:
                    logger.warning(f"⚠️ (初始) WebSocket连接已关闭")
                except Exception as e:
                    logger.error(f"❌ (初始) 消息接收出错: {e}")
                    import traceback
                    traceback.print_exc()
            
            receive_task = asyncio.create_task(receive_messages_initial())
            logger.info(f"✅ 初始接收任务已创建")
            
            # 主循环：处理请求队列
            loop = asyncio.get_running_loop()
            while True:
                # 非阻塞检查队列
                try:
                    sid, tts_text = await loop.run_in_executor(None, request_queue.get)
                except Exception:
                    break
                
                # 记录收到的TTS请求
                logger.info(f"🎤 收到TTS请求 - speech_id: {sid}, 文本长度: {len(tts_text) if tts_text else 0}, 文本: '{tts_text[:50] if tts_text else ''}'")
                
                if sid is None:
                    # 提交缓冲区完成当前合成（仅当之前有文本时）
                    if ws and session_ready.is_set() and current_speech_id is not None:
                        try:
                            await ws.send(json.dumps({
                                "type": "input_text_buffer.commit",
                                "event_id": f"event_{int(time.time() * 1000)}_interrupt_commit"
                            }))
                            logger.info(f"✅ 已提交缓冲区，等待音频回传")
                        except Exception as e:
                            logger.error(f"❌ 提交缓冲区失败: {e}")
                    elif current_speech_id is None:
                        logger.info(f"ℹ️ 缓冲区为空，无需提交")
                    continue
                
                # 新的语音ID，重新建立连接（类似 speech_synthesis_worker 的逻辑）
                # 直接关闭旧连接，打断旧语音
                if current_speech_id != sid:
                    logger.info(f"🔄 新的 speech_id，直接关闭旧连接并建立新连接")
                    current_speech_id = sid
                    if ws:
                        try:
                            await ws.close()
                        except:
                            pass
                    if receive_task and not receive_task.done():
                        receive_task.cancel()
                        try:
                            await receive_task
                        except asyncio.CancelledError:
                            pass
                    
                    # 建立新连接
                    try:
                        ws = await websockets.connect(tts_url, additional_headers=headers)
                        logger.info("✅ 新 WebSocket 连接已建立")
                        
                        # 配置会话
                        logger.info(f"📤 发送新会话配置")
                        await ws.send(json.dumps(config_message))
                        
                        # 等待 session.created
                        session_ready.clear()
                        logger.info(f"⏳ 等待 session.created 事件...")
                        
                        async def wait_ready():
                            try:
                                async for message in ws:
                                    event = json.loads(message)
                                    event_type = event.get("type")
                                    logger.info(f"📩 等待期间收到消息: {event_type}")
                                    # Qwen TTS API 返回 session.updated 而不是 session.created
                                    if event_type in ["session.created", "session.updated"]:
                                        logger.info("✅ 新 TTS 会话已创建/更新")
                                        session_ready.set()
                                        break
                                    elif event_type == "error":
                                        logger.error(f"❌ 等待期间收到错误: {event}")
                                        break
                            except Exception as e:
                                logger.error(f"❌ wait_ready 异常: {e}")
                                import traceback
                                traceback.print_exc()
                        
                        try:
                            await asyncio.wait_for(wait_ready(), timeout=2.0)
                            if session_ready.is_set():
                                logger.info("✅ 会话就绪确认")
                            else:
                                logger.warning("⚠️ 超时后会话仍未就绪")
                        except asyncio.TimeoutError:
                            logger.warning("⚠️ 新会话创建超时（2秒）")
                        
                        # 启动新的接收任务
                        async def receive_messages():
                            try:
                                logger.info(f"🎧 开始接收TTS消息...")
                                async for message in ws:
                                    event = json.loads(message)
                                    event_type = event.get("type")
                                    logger.info(f"📩 收到TTS消息: {event_type}")
                                    
                                    if event_type == "error":
                                        logger.error(f"❌ TTS错误: {event}")
                                    elif event_type == "response.audio.delta":
                                        try:
                                            audio_bytes = base64.b64decode(event.get("delta", ""))
                                            audio_array = np.frombuffer(audio_bytes, dtype=np.int16)
                                            resampled = np.repeat(audio_array, 2)
                                            response_queue.put(resampled.tobytes())
                                            logger.info(f"🔊 已发送音频数据到响应队列，长度: {len(resampled.tobytes())} bytes")
                                        except Exception as e:
                                            logger.error(f"❌ 处理音频数据时出错: {e}")
                                    elif event_type == "response.audio.done":
                                        logger.info(f"✅ TTS音频生成完成")
                                    elif event_type == "response.done":
                                        logger.info(f"✅ TTS响应完成")
                                logger.info(f"ℹ️ TTS消息接收循环结束")
                            except websockets.exceptions.ConnectionClosed:
                                logger.warning(f"⚠️ WebSocket连接已关闭")
                            except Exception as e:
                                logger.error(f"❌ 消息接收出错: {e}")
                                import traceback
                                traceback.print_exc()
                        
                        receive_task = asyncio.create_task(receive_messages())
                        logger.info(f"✅ 新的接收任务已创建")
                        
                    except Exception as e:
                        logger.error(f"重新建立连接失败: {e}")
                        import traceback
                        traceback.print_exc()
                        continue
                
                # 检查文本有效性
                if not tts_text or not tts_text.strip():
                    logger.warning(f"⚠️ 空文本，跳过发送")
                    continue
                
                if not ws:
                    logger.error("❌ WebSocket连接未建立，跳过发送")
                    continue
                
                if not session_ready.is_set():
                    logger.warning(f"⚠️ 会话未就绪，跳过发送文本")
                    continue
                
                # 追加文本到缓冲区（不立即提交，等待响应完成时的终止信号再 commit）
                try:
                    await ws.send(json.dumps({
                        "type": "input_text_buffer.append",
                        "event_id": f"event_{int(time.time() * 1000)}",
                        "text": tts_text
                    }))
                    logger.info(f"✅ 文本已追加到缓冲区（等待响应完成后提交）")
                except Exception as e:
                    logger.error(f"❌ 发送TTS文本失败: {e}")
                    import traceback
                    traceback.print_exc()
                    # 不退出，继续处理下一个请求
        
        except Exception as e:
            logger.error(f"Qwen实时TTS Worker错误: {e}")
            import traceback
            traceback.print_exc()
        finally:
            # 清理资源
            if receive_task and not receive_task.done():
                receive_task.cancel()
                try:
                    await receive_task
                except asyncio.CancelledError:
                    pass
            
            if ws:
                try:
                    await ws.close()
                except Exception:
                    pass
    
    # 运行异步worker
    try:
        asyncio.run(async_worker())
    except Exception as e:
        logger.error(f"Qwen实时TTS Worker启动失败: {e}")
        import traceback
        traceback.print_exc()


def cosyvoice_vc_tts_worker(request_queue, response_queue, audio_api_key, voice_id):
    """
    TTS多进程worker函数，用于阿里云CosyVoice TTS
    
    Args:
        request_queue: 多进程请求队列，接收(speech_id, text)元组
        response_queue: 多进程响应队列，发送音频数据
        audio_api_key: API密钥
        voice_id: 音色ID
    """
    import dashscope
    from dashscope.audio.tts_v2 import ResultCallback, SpeechSynthesizer, AudioFormat
    
    dashscope.api_key = audio_api_key
    
    class Callback(ResultCallback):
        def __init__(self, response_queue):
            self.response_queue = response_queue
            self.cache = np.zeros(0).astype(np.float32)
            
        def on_open(self): 
            pass
            
        def on_complete(self): 
            if len(self.cache) > 0:
                data = (resample(self.cache, orig_sr=24000, target_sr=48000) * 32768.).clip(-32768, 32767).astype(np.int16).tobytes()
                self.response_queue.put(data)
                self.cache = np.zeros(0).astype(np.float32)
                
        def on_error(self, message: str): 
            print(f"TTS Error: {message}")
            
        def on_close(self): 
            pass
            
        def on_event(self, message): 
            pass
            
        def on_data(self, data: bytes) -> None:
            audio = np.frombuffer(data, dtype=np.int16).astype(np.float32) / 32768.0
            self.cache = np.concatenate([self.cache, audio])
            if len(self.cache) >= 8000:
                data = self.cache[:8000]
                data = (resample(data, orig_sr=24000, target_sr=48000) * 32768.).clip(-32768, 32767).astype(np.int16).tobytes()
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

        if sid is None:
            # 停止当前合成
            if synthesizer is not None:
                try:
                    synthesizer.streaming_complete()
                except Exception:
                    synthesizer = None
            continue
            
        if current_speech_id is None or current_speech_id != sid or synthesizer is None:
            current_speech_id = sid
            try:
                if synthesizer is not None:
                    try:
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
                
        if tts_text is None or not tts_text.strip():
            time.sleep(0.01)
            logger.warning(f"⚠️ 跳过空TTS请求 - speech_id: {sid}, text_repr: {repr(tts_text)[:100]}")
            continue
            
        # 处理表情等逻辑
        try:
            synthesizer.streaming_call(tts_text)
        except Exception as e:
            print("TTS Error: ", e)
            synthesizer = None
            current_speech_id = None
            continue


def get_tts_worker(core_api_type='qwen', has_custom_voice=False):
    """
    根据 core_api 类型和是否有自定义音色，返回对应的 TTS worker 函数
    
    Args:
        core_api_type: core API 类型 ('qwen', 'glm', 'openai', 'step' 等)
        has_custom_voice: 是否有自定义音色 (voice_id)
    
    Returns:
        对应的 TTS worker 函数
    """
    # 如果有自定义音色，使用 CosyVoice（仅阿里云支持）
    if has_custom_voice:
        return cosyvoice_vc_tts_worker
    
    # 没有自定义音色时，使用与 core_api 匹配的默认 TTS
    if core_api_type == 'qwen':
        return qwen_realtime_tts_worker
    # 未来可以添加其他 core_api 的默认 TTS
    # elif core_api_type == 'glm':
    #     return glm_default_tts_worker
    # elif core_api_type == 'openai':
    #     return openai_default_tts_worker
    # elif core_api_type == 'step':
    #     return step_default_tts_worker
    else:
        logger.warning(f"未知的 core_api 类型: {core_api_type}，使用 qwen 默认 TTS")
        return qwen_realtime_tts_worker

