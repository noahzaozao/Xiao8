# -- coding: utf-8 --

import asyncio
import json
import time
import logging
from typing import Optional, Callable, Dict, Any, Awaitable
from langchain_openai import ChatOpenAI
from langchain_core.messages import SystemMessage, HumanMessage, AIMessage

# Setup logger for this module
logger = logging.getLogger(__name__)

class OmniOfflineClient:
    """
    A client for text-based chat that mimics the interface of OmniRealtimeClient.
    
    This class provides a compatible interface with OmniRealtimeClient but uses
    langchain's ChatOpenAI with OpenAI-compatible API instead of realtime WebSocket,
    suitable for text-only conversations.
    
    Attributes:
        base_url (str):
            The base URL for the OpenAI-compatible API (e.g., OPENROUTER_URL).
        api_key (str):
            The API key for authentication.
        model (str):
            Model to use for chat.
        llm (ChatOpenAI):
            Langchain ChatOpenAI client for streaming text generation.
        on_text_delta (Callable[[str, bool], Awaitable[None]]):
            Callback for text delta events.
        on_input_transcript (Callable[[str], Awaitable[None]]):
            Callback for input transcript events (user messages).
        on_output_transcript (Callable[[str, bool], Awaitable[None]]):
            Callback for output transcript events (assistant messages).
        on_connection_error (Callable[[str], Awaitable[None]]):
            Callback for connection errors.
        on_response_done (Callable[[], Awaitable[None]]):
            Callback when a response is complete.
    """
    def __init__(
        self,
        base_url: str,
        api_key: str,
        model: str = "",
        voice: str = "",  # Unused for text mode but kept for compatibility
        turn_detection_mode = None,  # Unused for text mode
        on_text_delta: Optional[Callable[[str, bool], Awaitable[None]]] = None,
        on_audio_delta: Optional[Callable[[bytes], Awaitable[None]]] = None,  # Unused
        on_interrupt: Optional[Callable[[], Awaitable[None]]] = None,  # Unused
        on_input_transcript: Optional[Callable[[str], Awaitable[None]]] = None,
        on_output_transcript: Optional[Callable[[str, bool], Awaitable[None]]] = None,
        on_connection_error: Optional[Callable[[str], Awaitable[None]]] = None,
        on_response_done: Optional[Callable[[], Awaitable[None]]] = None,
        extra_event_handlers: Optional[Dict[str, Callable[[Dict[str, Any]], Awaitable[None]]]] = None
    ):
        # Use base_url directly without conversion
        self.base_url = base_url
        self.api_key = api_key if api_key and api_key != '' else None
        self.model = model
        self.on_text_delta = on_text_delta
        self.on_input_transcript = on_input_transcript
        self.on_output_transcript = on_output_transcript
        self.handle_connection_error = on_connection_error
        self.on_response_done = on_response_done
        
        # Initialize langchain ChatOpenAI client
        self.llm = ChatOpenAI(
            model=self.model,
            base_url=self.base_url,
            api_key=self.api_key,
            temperature=0.8,
            streaming=True
        )
        
        # State management
        self._is_responding = False
        self._conversation_history = []
        self._instructions = ""
        self._stream_task = None
        
    async def connect(self, instructions: str, native_audio=False) -> None:
        """Initialize the client with system instructions."""
        self._instructions = instructions
        # Add system message to conversation history using langchain format
        self._conversation_history = [
            SystemMessage(content=instructions)
        ]
        logger.info("OmniOfflineClient initialized with instructions")
    
    async def send_event(self, event) -> None:
        """Compatibility method - not used in text mode"""
        pass
    
    async def update_session(self, config: Dict[str, Any]) -> None:
        """Compatibility method - update instructions if provided"""
        if "instructions" in config:
            self._instructions = config["instructions"]
            # Update system message using langchain format
            if self._conversation_history and isinstance(self._conversation_history[0], SystemMessage):
                self._conversation_history[0] = SystemMessage(content=self._instructions)
    
    async def stream_text(self, text: str) -> None:
        """
        Send a text message to the API and stream the response.
        This is the main method for text-based interaction.
        Uses langchain ChatOpenAI for streaming.
        """
        if not text or not text.strip():
            return
        
        # Add user message to history
        user_message = HumanMessage(content=text.strip())
        self._conversation_history.append(user_message)
        
        # Callback for user input
        if self.on_input_transcript:
            await self.on_input_transcript(text.strip())
        
        try:
            self._is_responding = True
            
            assistant_message = ""
            is_first_chunk = True
            
            # Stream response using langchain
            async for chunk in self.llm.astream(self._conversation_history):
                if not self._is_responding:
                    # Interrupted
                    break
                    
                content = chunk.content if hasattr(chunk, 'content') else str(chunk)
                
                # 只处理非空内容，从源头过滤空文本
                if content and content.strip():
                    assistant_message += content
                    
                    # 文本模式只调用 on_text_delta，不调用 on_output_transcript
                    # 这与 OmniRealtimeClient 的行为一致：
                    # - 文本响应使用 on_text_delta
                    # - 语音转录使用 on_output_transcript
                    if self.on_text_delta:
                        await self.on_text_delta(content, is_first_chunk)
                    
                    is_first_chunk = False
                elif content and not content.strip():
                    # 记录被过滤的空内容（仅包含空白字符）
                    logger.debug(f"OmniOfflineClient: 过滤空白内容 - content_repr: {repr(content)[:100]}")
            
            # Add assistant response to history
            if assistant_message:
                self._conversation_history.append(AIMessage(content=assistant_message))
                    
        except Exception as e:
            error_msg = f"Error in text streaming: {str(e)}"
            logger.error(error_msg)
            if self.handle_connection_error:
                await self.handle_connection_error(error_msg)
        finally:
            self._is_responding = False
            
            # Call response done callback
            if self.on_response_done:
                await self.on_response_done()
    
    async def stream_audio(self, audio_chunk: bytes) -> None:
        """Compatibility method - not used in text mode"""
        pass
    
    async def stream_image(self, image_b64: str) -> None:
        """Compatibility method - not used in text mode"""
        pass
    
    async def create_response(self, instructions: str, skipped: bool = False) -> None:
        """
        Process a system message or instruction.
        For compatibility with OmniRealtimeClient interface.
        """
        # Extract actual instruction if it starts with "SYSTEM_MESSAGE | "
        if instructions.startswith("SYSTEM_MESSAGE | "):
            instructions = instructions[17:]  # Remove prefix
        
        # Add as system message using langchain format
        if instructions.strip():
            self._conversation_history.append(SystemMessage(content=instructions))
    
    async def cancel_response(self) -> None:
        """Cancel the current response if possible"""
        self._is_responding = False
        # Stop processing new chunks by setting flag
    
    async def handle_interruption(self):
        """Handle user interruption - cancel current response"""
        if not self._is_responding:
            return
        
        logger.info("Handling text mode interruption")
        await self.cancel_response()
    
    async def handle_messages(self) -> None:
        """
        Compatibility method for OmniRealtimeClient interface.
        In text mode, this is a no-op as we don't have a persistent connection.
        """
        # Keep this task alive to match the interface
        try:
            while True:
                await asyncio.sleep(1)
        except asyncio.CancelledError:
            logger.info("Text mode message handler cancelled")
    
    async def close(self) -> None:
        """Close the client and cleanup resources."""
        self._is_responding = False
        self._conversation_history = []
        logger.info("OmniOfflineClient closed")

