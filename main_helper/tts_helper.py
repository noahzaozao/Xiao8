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
import io
import wave

logger = logging.getLogger(__name__)


def step_realtime_tts_worker(request_queue, response_queue, audio_api_key, voice_id):
    """
    StepFun实时TTS worker（用于默认音色）
    使用阶跃星辰的实时TTS API（step-tts-mini）
    
    Args:
        request_queue: 多进程请求队列，接收(speech_id, text)元组
        response_queue: 多进程响应队列，发送音频数据
        audio_api_key: API密钥
        voice_id: 音色ID，默认使用"qingchunshaonv"
    """
    import asyncio
    
    # 使用默认音色 "qingchunshaonv"
    if not voice_id:
        voice_id = "qingchunshaonv"
    
    async def async_worker():
        """异步TTS worker主循环"""
        tts_url = "wss://api.stepfun.com/v1/realtime/audio?model=step-tts-mini"
        ws = None
        current_speech_id = None
        receive_task = None
        session_id = None
        session_ready = asyncio.Event()
        
        try:
            # 连接WebSocket
            headers = {"Authorization": f"Bearer {audio_api_key}"}
            
            ws = await websockets.connect(tts_url, additional_headers=headers)
            
            # 等待连接成功事件
            async def wait_for_connection():
                """等待连接成功"""
                nonlocal session_id
                try:
                    async for message in ws:
                        event = json.loads(message)
                        event_type = event.get("type")
                        
                        if event_type == "tts.connection.done":
                            session_id = event.get("data", {}).get("session_id")
                            session_ready.set()
                            break
                        elif event_type == "tts.response.error":
                            logger.error(f"TTS服务器错误: {event}")
                            break
                except Exception as e:
                    logger.error(f"等待连接时出错: {e}")
            
            # 等待连接成功
            try:
                await asyncio.wait_for(wait_for_connection(), timeout=5.0)
            except asyncio.TimeoutError:
                logger.error("等待连接超时")
                return
            
            if not session_ready.is_set() or not session_id:
                logger.error("连接未能正确建立")
                return
            
            # 发送创建会话事件
            create_event = {
                "type": "tts.create",
                "data": {
                    "session_id": session_id,
                    "voice_id": voice_id,
                    "response_format": "wav",
                    "sample_rate": 24000
                }
            }
            await ws.send(json.dumps(create_event))
            
            # 等待会话创建成功
            async def wait_for_session_ready():
                try:
                    async for message in ws:
                        event = json.loads(message)
                        event_type = event.get("type")
                        
                        if event_type == "tts.response.created":
                            break
                        elif event_type == "tts.response.error":
                            logger.error(f"创建会话错误: {event}")
                            break
                except Exception as e:
                    logger.error(f"等待会话创建时出错: {e}")
            
            try:
                await asyncio.wait_for(wait_for_session_ready(), timeout=3.0)
            except asyncio.TimeoutError:
                logger.warning("会话创建超时")
            
            # 初始接收任务
            async def receive_messages_initial():
                """初始接收任务"""
                try:
                    async for message in ws:
                        event = json.loads(message)
                        event_type = event.get("type")
                        
                        if event_type == "tts.response.error":
                            logger.error(f"TTS错误: {event}")
                        elif event_type == "tts.response.audio.delta":
                            try:
                                # StepFun 返回 BASE64 编码的完整音频（包含 wav header）
                                audio_b64 = event.get("data", {}).get("audio", "")
                                if audio_b64:
                                    audio_bytes = base64.b64decode(audio_b64)
                                    # 使用 wave 模块读取 WAV 数据
                                    with io.BytesIO(audio_bytes) as wav_io:
                                        with wave.open(wav_io, 'rb') as wav_file:
                                            # 读取音频数据
                                            pcm_data = wav_file.readframes(wav_file.getnframes())
                                    
                                    # 转换为 numpy 数组
                                    audio_array = np.frombuffer(pcm_data, dtype=np.int16)
                                    # 重采样 24000Hz -> 48000Hz
                                    resampled = np.repeat(audio_array, 48000 // 24000)
                                    response_queue.put(resampled.tobytes())
                            except Exception as e:
                                logger.error(f"处理音频数据时出错: {e}")
                except websockets.exceptions.ConnectionClosed:
                    pass
                except Exception as e:
                    logger.error(f"消息接收出错: {e}")
            
            receive_task = asyncio.create_task(receive_messages_initial())
            
            # 主循环：处理请求队列
            loop = asyncio.get_running_loop()
            while True:
                try:
                    sid, tts_text = await loop.run_in_executor(None, request_queue.get)
                except Exception:
                    break
                
                if sid is None:
                    # 提交缓冲区完成当前合成
                    if ws and session_id and current_speech_id is not None:
                        try:
                            done_event = {
                                "type": "tts.text.done",
                                "data": {"session_id": session_id}
                            }
                            await ws.send(json.dumps(done_event))
                        except Exception as e:
                            logger.error(f"完成生成失败: {e}")
                    continue
                
                # 新的语音ID，重新建立连接
                if current_speech_id != sid:
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
                        
                        # 等待连接成功
                        session_id = None
                        session_ready.clear()
                        
                        async def wait_conn():
                            nonlocal session_id
                            try:
                                async for message in ws:
                                    event = json.loads(message)
                                    if event.get("type") == "tts.connection.done":
                                        session_id = event.get("data", {}).get("session_id")
                                        session_ready.set()
                                        break
                            except Exception:
                                pass
                        
                        try:
                            await asyncio.wait_for(wait_conn(), timeout=3.0)
                        except asyncio.TimeoutError:
                            logger.warning("新连接超时")
                            continue
                        
                        if not session_id:
                            continue
                        
                        # 创建会话
                        await ws.send(json.dumps({
                            "type": "tts.create",
                            "data": {
                                "session_id": session_id,
                                "voice_id": voice_id,
                                "response_format": "wav",
                                "sample_rate": 24000
                            }
                        }))
                        
                        # 启动新的接收任务
                        async def receive_messages():
                            try:
                                async for message in ws:
                                    event = json.loads(message)
                                    event_type = event.get("type")
                                    
                                    if event_type == "tts.response.error":
                                        logger.error(f"TTS错误: {event}")
                                    elif event_type == "tts.response.audio.delta":
                                        try:
                                            audio_b64 = event.get("data", {}).get("audio", "")
                                            if audio_b64:
                                                audio_bytes = base64.b64decode(audio_b64)
                                                # 使用 wave 模块读取 WAV 数据
                                                with io.BytesIO(audio_bytes) as wav_io:
                                                    with wave.open(wav_io, 'rb') as wav_file:
                                                        # 读取音频数据
                                                        pcm_data = wav_file.readframes(wav_file.getnframes())
                                                
                                                # 转换为 numpy 数组
                                                audio_array = np.frombuffer(pcm_data, dtype=np.int16)
                                                # 重采样 24000Hz -> 48000Hz
                                                resampled = np.repeat(audio_array, 48000 // 24000)
                                                response_queue.put(resampled.tobytes())
                                        except Exception as e:
                                            logger.error(f"处理音频数据时出错: {e}")
                            except websockets.exceptions.ConnectionClosed:
                                pass
                            except Exception as e:
                                logger.error(f"消息接收出错: {e}")
                        
                        receive_task = asyncio.create_task(receive_messages())
                        
                    except Exception as e:
                        logger.error(f"重新建立连接失败: {e}")
                        continue
                
                # 检查文本有效性
                if not tts_text or not tts_text.strip():
                    continue
                
                if not ws or not session_id:
                    continue
                
                # 发送文本
                try:
                    text_event = {
                        "type": "tts.text.delta",
                        "data": {
                            "session_id": session_id,
                            "text": tts_text
                        }
                    }
                    await ws.send(json.dumps(text_event))
                except Exception as e:
                    logger.error(f"发送TTS文本失败: {e}")
        
        except Exception as e:
            logger.error(f"StepFun实时TTS Worker错误: {e}")
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
        logger.error(f"StepFun实时TTS Worker启动失败: {e}")


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
            
            # 等待并处理初始消息
            async def wait_for_session_ready():
                """等待会话创建确认"""
                try:
                    async for message in ws:
                        event = json.loads(message)
                        event_type = event.get("type")
                        
                        # Qwen TTS API 返回 session.updated 而不是 session.created
                        if event_type in ["session.created", "session.updated"]:
                            session_ready.set()
                            break
                        elif event_type == "error":
                            logger.error(f"TTS服务器错误: {event}")
                            break
                except Exception as e:
                    logger.error(f"等待会话就绪时出错: {e}")
            
            # 发送配置
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
                    async for message in ws:
                        event = json.loads(message)
                        event_type = event.get("type")
                        
                        if event_type == "error":
                            logger.error(f"TTS错误: {event}")
                        elif event_type == "response.audio.delta":
                            try:
                                audio_bytes = base64.b64decode(event.get("delta", ""))
                                audio_array = np.frombuffer(audio_bytes, dtype=np.int16)
                                resampled = np.repeat(audio_array, 2)
                                response_queue.put(resampled.tobytes())
                            except Exception as e:
                                logger.error(f"处理音频数据时出错: {e}")
                except websockets.exceptions.ConnectionClosed:
                    pass
                except Exception as e:
                    logger.error(f"消息接收出错: {e}")
            
            receive_task = asyncio.create_task(receive_messages_initial())
            
            # 主循环：处理请求队列
            loop = asyncio.get_running_loop()
            while True:
                # 非阻塞检查队列
                try:
                    sid, tts_text = await loop.run_in_executor(None, request_queue.get)
                except Exception:
                    break
                
                if sid is None:
                    # 提交缓冲区完成当前合成（仅当之前有文本时）
                    if ws and session_ready.is_set() and current_speech_id is not None:
                        try:
                            await ws.send(json.dumps({
                                "type": "input_text_buffer.commit",
                                "event_id": f"event_{int(time.time() * 1000)}_interrupt_commit"
                            }))
                        except Exception as e:
                            logger.error(f"提交缓冲区失败: {e}")
                    continue
                
                # 新的语音ID，重新建立连接（类似 speech_synthesis_worker 的逻辑）
                # 直接关闭旧连接，打断旧语音
                if current_speech_id != sid:
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
                        await ws.send(json.dumps(config_message))
                        
                        # 等待 session.created
                        session_ready.clear()
                        
                        async def wait_ready():
                            try:
                                async for message in ws:
                                    event = json.loads(message)
                                    event_type = event.get("type")
                                    # Qwen TTS API 返回 session.updated 而不是 session.created
                                    if event_type in ["session.created", "session.updated"]:
                                        session_ready.set()
                                        break
                                    elif event_type == "error":
                                        logger.error(f"等待期间收到错误: {event}")
                                        break
                            except Exception as e:
                                logger.error(f"wait_ready 异常: {e}")
                        
                        try:
                            await asyncio.wait_for(wait_ready(), timeout=2.0)
                        except asyncio.TimeoutError:
                            logger.warning("新会话创建超时")
                        
                        # 启动新的接收任务
                        async def receive_messages():
                            try:
                                async for message in ws:
                                    event = json.loads(message)
                                    event_type = event.get("type")
                                    
                                    if event_type == "error":
                                        logger.error(f"TTS错误: {event}")
                                    elif event_type == "response.audio.delta":
                                        try:
                                            audio_bytes = base64.b64decode(event.get("delta", ""))
                                            audio_array = np.frombuffer(audio_bytes, dtype=np.int16)
                                            resampled = np.repeat(audio_array, 2)
                                            response_queue.put(resampled.tobytes())
                                        except Exception as e:
                                            logger.error(f"处理音频数据时出错: {e}")
                            except websockets.exceptions.ConnectionClosed:
                                pass
                            except Exception as e:
                                logger.error(f"消息接收出错: {e}")
                        
                        receive_task = asyncio.create_task(receive_messages())
                        
                    except Exception as e:
                        logger.error(f"重新建立连接失败: {e}")
                        continue
                
                # 检查文本有效性
                if not tts_text or not tts_text.strip():
                    continue
                
                if not ws or not session_ready.is_set():
                    continue
                
                # 追加文本到缓冲区（不立即提交，等待响应完成时的终止信号再 commit）
                try:
                    await ws.send(json.dumps({
                        "type": "input_text_buffer.append",
                        "event_id": f"event_{int(time.time() * 1000)}",
                        "text": tts_text
                    }))
                except Exception as e:
                    logger.error(f"发送TTS文本失败: {e}")
        
        except Exception as e:
            logger.error(f"Qwen实时TTS Worker错误: {e}")
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
        core_api_type: core API 类型 ('qwen', 'step' 等)
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
    elif core_api_type == 'step':
        return step_realtime_tts_worker
    else:
        logger.warning(f"未知的 core_api 类型: {core_api_type}，使用 qwen 默认 TTS")
        return qwen_realtime_tts_worker

