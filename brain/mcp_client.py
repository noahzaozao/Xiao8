import asyncio
import logging
from typing import Dict, Any, List, Optional
import httpx
from cachetools import TTLCache
from config import get_core_config, MCP_ROUTER_URL

logger = logging.getLogger(__name__)


class McpRouterClient:
    """
    Lightweight MCP Router HTTP client.

    - Discovers available MCP servers from router
    - Caches list for short TTL
    - Provides simple tool invocation shim (POST /tools/{server_id}/{tool_name}) if router exposes such API later
      For now only discovery is used; tool execution will be done by LLM selection inside processor.
    """
    def __init__(self, base_url: str = None, api_key: str = None, timeout: float = 10.0):
        # 动态获取配置
        if base_url is None:
            base_url = MCP_ROUTER_URL
        if api_key is None:
            core_config = get_core_config()
            api_key = core_config.get('MCP_ROUTER_API_KEY', '')
        self.base_url = base_url.rstrip('/')
        self.api_key = api_key
        headers = {}
        if self.api_key:
            headers['Authorization'] = f'Bearer {self.api_key}'
        self.http = httpx.AsyncClient(timeout=timeout, headers=headers)
        # Cache servers listing for 10 seconds
        self._servers_cache: TTLCache[str, Any] = TTLCache(maxsize=1, ttl=10)

    async def list_servers(self) -> List[Dict[str, Any]]:
        """
        GET /v0/servers
        Returns list of MCP servers with status and meta.
        Docs: https://mcp-router.net/docs/api/list-mcp-servers
        """
        if 'servers' in self._servers_cache:
            return self._servers_cache['servers']
        url = f"{self.base_url}/v0/servers"
        try:
            resp = await self.http.get(url)
            resp.raise_for_status()
            data = resp.json()
            servers = data if isinstance(data, list) else data.get('servers', [])
            self._servers_cache['servers'] = servers
            return servers
        except Exception:
            # Router not reachable or returned error → degrade gracefully
            self._servers_cache['servers'] = []
            return []

    async def get_server_by_name(self, name_or_id: str) -> Optional[Dict[str, Any]]:
        servers = await self.list_servers()
        for s in servers:
            if s.get('identifier') == name_or_id or s.get('name') == name_or_id:
                return s
        return None

    async def call_tool(self, server_id: str, tool_name: str, arguments: Dict[str, Any] = None) -> Dict[str, Any]:
        """
        Call a specific tool on an MCP server.
        This is a placeholder implementation - actual MCP tool calling would require
        establishing a proper MCP connection to the server.
        """
        try:
            # For now, we'll simulate tool calling since we don't have direct MCP server access
            # In a real implementation, this would establish an MCP connection and call the tool
            logger.info(f"[MCP] Simulating tool call: {server_id}.{tool_name} with args: {arguments}")
            
            # Simulate different tool responses based on tool name
            if tool_name == "save_memory":
                return {
                    "success": True,
                    "result": f"Memory saved successfully: {arguments.get('content', 'No content provided')}",
                    "tool": tool_name,
                    "server": server_id
                }
            elif tool_name == "retrieve_memory":
                return {
                    "success": True,
                    "result": f"Retrieved memories: {arguments.get('query', 'No query provided')}",
                    "tool": tool_name,
                    "server": server_id
                }
            else:
                return {
                    "success": True,
                    "result": f"Tool {tool_name} executed successfully",
                    "tool": tool_name,
                    "server": server_id
                }
        except Exception as e:
            logger.error(f"[MCP] Tool call failed: {e}")
            return {
                "success": False,
                "error": str(e),
                "tool": tool_name,
                "server": server_id
            }

    async def aclose(self):
        await self.http.aclose()


class McpToolCatalog:
    """
    A simple registry that maps discovered servers to tool specs usable by LLM prompts.
    In absence of a router-side tool list endpoint, we treat each server as a capability tag.
    """
    def __init__(self, router: McpRouterClient):
        self.router = router

    async def get_capabilities(self) -> Dict[str, Dict[str, Any]]:
        servers = await self.router.list_servers()
        # Represent each server as a tool family with name/description
        tools: Dict[str, Dict[str, Any]] = {}
        for s in servers:
            sid = s.get('identifier') or s.get('name')
            tools[sid] = {
                'title': s.get('name', sid),
                'description': s.get('description', ''),
                'status': s.get('status', 'unknown'),
                'version': s.get('version', ''),
            }
        return tools


