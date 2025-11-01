"""
Web scraper for fetching trending content from Bilibili and Weibo
"""
import asyncio
import httpx
import random
from typing import Dict, List, Any
import logging

logger = logging.getLogger(__name__)

# User-Agent池，随机选择以避免被识别
USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15',
]

def get_random_user_agent() -> str:
    """随机获取一个User-Agent"""
    return random.choice(USER_AGENTS)


async def fetch_bilibili_trending(limit: int = 10) -> Dict[str, Any]:
    """
    获取B站热门视频
    使用B站的综合热门API
    """
    try:
        url = "https://api.bilibili.com/x/web-interface/popular"
        params = {
            "ps": limit,  # 每页数量
            "pn": 1       # 页码
        }
        
        # 添加完整的headers来模拟浏览器请求
        headers = {
            'User-Agent': get_random_user_agent(),
            'Referer': 'https://www.bilibili.com',
            'Origin': 'https://www.bilibili.com',
            'Accept': 'application/json, text/plain, */*',
            'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
            'Accept-Encoding': 'gzip, deflate, br',
            'Connection': 'keep-alive',
            'Sec-Ch-Ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
            'Sec-Ch-Ua-Mobile': '?0',
            'Sec-Ch-Ua-Platform': '"Windows"',
            'Sec-Fetch-Dest': 'empty',
            'Sec-Fetch-Mode': 'cors',
            'Sec-Fetch-Site': 'same-site',
            'DNT': '1',
        }
        
        # 添加随机延迟，避免请求过快
        await asyncio.sleep(random.uniform(0.1, 0.5))
        
        async with httpx.AsyncClient(timeout=10.0, follow_redirects=True) as client:
            response = await client.get(url, params=params, headers=headers)
            response.raise_for_status()
            data = response.json()
            
            if data.get('code') == 0:
                videos = []
                for item in data.get('data', {}).get('list', [])[:limit]:
                    videos.append({
                        'title': item.get('title', ''),
                        'desc': item.get('desc', ''),
                        'author': item.get('owner', {}).get('name', ''),
                        'view': item.get('stat', {}).get('view', 0),
                        'like': item.get('stat', {}).get('like', 0),
                        'bvid': item.get('bvid', '')
                    })
                
                return {
                    'success': True,
                    'videos': videos
                }
            else:
                logger.error(f"B站API返回错误: {data.get('message', '未知错误')}")
                return {
                    'success': False,
                    'error': data.get('message', '未知错误')
                }
                
    except httpx.TimeoutException:
        logger.error("获取B站热门视频超时")
        return {
            'success': False,
            'error': '请求超时'
        }
    except Exception as e:
        logger.error(f"获取B站热门视频失败: {e}")
        return {
            'success': False,
            'error': str(e)
        }


async def fetch_weibo_trending(limit: int = 10) -> Dict[str, Any]:
    """
    获取微博热搜
    使用微博热搜榜API
    """
    try:
        # 微博热搜榜API（公开接口）
        url = "https://weibo.com/ajax/side/hotSearch"
        
        headers = {
            'User-Agent': get_random_user_agent(),
            'Referer': 'https://weibo.com',
            'Accept': 'application/json, text/plain, */*',
            'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
            'Accept-Encoding': 'gzip, deflate, br',
            'Connection': 'keep-alive',
            'DNT': '1',
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache',
        }
        
        # 添加随机延迟，避免请求过快
        await asyncio.sleep(random.uniform(0.1, 0.5))
        
        async with httpx.AsyncClient(timeout=10.0, follow_redirects=True) as client:
            response = await client.get(url, headers=headers)
            response.raise_for_status()
            data = response.json()
            
            if data.get('ok') == 1:
                trending_list = []
                realtime_list = data.get('data', {}).get('realtime', [])
                
                for item in realtime_list[:limit]:
                    # 跳过广告
                    if item.get('is_ad'):
                        continue
                    
                    trending_list.append({
                        'word': item.get('word', ''),
                        'raw_hot': item.get('raw_hot', 0),
                        'note': item.get('note', ''),
                        'rank': item.get('rank', 0)
                    })
                
                return {
                    'success': True,
                    'trending': trending_list[:limit]
                }
            else:
                logger.error(f"微博API返回错误")
                return {
                    'success': False,
                    'error': '微博API返回错误'
                }
                
    except httpx.TimeoutException:
        logger.error("获取微博热搜超时")
        return {
            'success': False,
            'error': '请求超时'
        }
    except Exception as e:
        logger.error(f"获取微博热搜失败: {e}")
        return {
            'success': False,
            'error': str(e)
        }


async def fetch_trending_content(bilibili_limit: int = 10, weibo_limit: int = 10) -> Dict[str, Any]:
    """
    并发获取B站和微博的热门内容
    
    Args:
        bilibili_limit: B站视频数量限制
        weibo_limit: 微博热搜数量限制
    
    Returns:
        包含成功状态、B站视频和微博热搜的字典
    """
    try:
        # 并发请求
        bilibili_task = fetch_bilibili_trending(bilibili_limit)
        weibo_task = fetch_weibo_trending(weibo_limit)
        
        bilibili_result, weibo_result = await asyncio.gather(
            bilibili_task, 
            weibo_task,
            return_exceptions=True
        )
        
        # 处理异常情况
        if isinstance(bilibili_result, Exception):
            logger.error(f"B站爬取异常: {bilibili_result}")
            bilibili_result = {'success': False, 'error': str(bilibili_result)}
        
        if isinstance(weibo_result, Exception):
            logger.error(f"微博爬取异常: {weibo_result}")
            weibo_result = {'success': False, 'error': str(weibo_result)}
        
        # 检查是否至少有一个成功
        if not bilibili_result.get('success') and not weibo_result.get('success'):
            return {
                'success': False,
                'error': '无法获取任何热门内容',
                'bilibili': bilibili_result,
                'weibo': weibo_result
            }
        
        return {
            'success': True,
            'bilibili': bilibili_result,
            'weibo': weibo_result
        }
        
    except Exception as e:
        logger.error(f"获取热门内容失败: {e}")
        return {
            'success': False,
            'error': str(e)
        }


def format_trending_content(trending_content: Dict[str, Any]) -> str:
    """
    格式化热门内容为可读的字符串
    
    Args:
        trending_content: fetch_trending_content返回的结果
    
    Returns:
        格式化后的字符串
    """
    output_lines = []
    
    # 格式化B站内容
    bilibili_data = trending_content.get('bilibili', {})
    if bilibili_data.get('success'):
        output_lines.append("【B站热门视频】")
        videos = bilibili_data.get('videos', [])
        
        for i, video in enumerate(videos[:5], 1):  # 只取前5个
            title = video.get('title', '')
            author = video.get('author', '')
            view = video.get('view', 0)
            like = video.get('like', 0)
            
            # 格式化播放量和点赞数
            view_str = f"{view//10000}万" if view >= 10000 else str(view)
            like_str = f"{like//10000}万" if like >= 10000 else str(like)
            
            output_lines.append(f"{i}. {title}")
            output_lines.append(f"   UP主: {author} | 播放: {view_str} | 点赞: {like_str}")
        
        output_lines.append("")  # 空行
    
    # 格式化微博内容
    weibo_data = trending_content.get('weibo', {})
    if weibo_data.get('success'):
        output_lines.append("【微博热搜】")
        trending_list = weibo_data.get('trending', [])
        
        for i, item in enumerate(trending_list[:5], 1):  # 只取前5个
            word = item.get('word', '')
            hot = item.get('raw_hot', 0)
            note = item.get('note', '')
            
            # 格式化热度
            hot_str = f"{hot//10000}万" if hot >= 10000 else str(hot)
            
            line = f"{i}. {word} (热度: {hot_str})"
            if note:
                line += f" [{note}]"
            output_lines.append(line)
    
    if not output_lines:
        return "暂时无法获取热门内容"
    
    return "\n".join(output_lines)


# 测试用的主函数
async def main():
    """测试函数"""
    print("正在获取热门内容...")
    content = await fetch_trending_content(bilibili_limit=5, weibo_limit=5)
    
    if content['success']:
        formatted = format_trending_content(content)
        print("\n" + "="*50)
        print(formatted)
        print("="*50)
    else:
        print(f"获取失败: {content.get('error')}")


if __name__ == "__main__":
    asyncio.run(main())

