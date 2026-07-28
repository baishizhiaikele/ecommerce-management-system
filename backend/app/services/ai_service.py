import hashlib
import logging

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)


class AIService:
    """LLM 调用封装：有 API key 时调用 OpenAI 兼容接口，否则返回确定性 mock。"""

    async def generate_product_copy(self, name: str, category: str, note: str) -> dict:
        if not settings.AI_API_KEY:
            return self._mock_copy(name, category, note)
        prompt = (
            f"你是一名资深电商运营。请为以下商品生成上架文案。\n"
            f"商品名：{name}\n品类：{category}\n卖家备注：{note}\n"
            "请严格以 JSON 返回：{{\"title\": 吸睛标题, \"sales_copy\": 卖点详情(120字内), "
            "\"price_suggestion\": 建议定价(数字)}}"
        )
        try:
            text = await self._chat(prompt, temperature=0.8)
            parsed = self._parse_json(text)
            if parsed:
                if "copy" in parsed and "sales_copy" not in parsed:
                    parsed["sales_copy"] = parsed.pop("copy")
                return parsed
            return self._mock_copy(name, category, note)
        except Exception:
            logger.warning("AI 文案生成调用失败，降级为本地 mock", exc_info=True)
            return self._mock_copy(name, category, note)

    async def customer_reply(self, product_ctx: str, history: list[dict], question: str) -> str:
        if not settings.AI_API_KEY:
            return self._mock_reply(question)
        msgs = [{"role": "system", "content": f"你是商品客服，仅基于以下商品信息作答：{product_ctx}。不知情的如实说不知道。"}]
        for h in history[-6:]:
            msgs.append({"role": "user" if h["role"] == "user" else "assistant", "content": h["content"]})
        msgs.append({"role": "user", "content": question})
        try:
            return await self._chat_messages(msgs, temperature=0.4)
        except Exception:
            logger.warning("AI 客服回复调用失败，降级为本地 mock", exc_info=True)
            return self._mock_reply(question)

    async def analyze_sentiment(self, text: str) -> str:
        if not settings.AI_API_KEY:
            return self._mock_sentiment(text)
        prompt = (
            f"判断用户评价的情感倾向，仅回复 positive / neutral / negative 之一。\n评价：{text}"
        )
        try:
            result = (await self._chat(prompt, temperature=0)).strip().lower()
            return result if result in ("positive", "neutral", "negative") else "neutral"
        except Exception:
            logger.warning("AI 情感分析调用失败，降级为本地 mock", exc_info=True)
            return self._mock_sentiment(text)

    async def _chat(self, prompt: str, temperature: float = 0.7) -> str:
        return await self._chat_messages([{"role": "user", "content": prompt}], temperature)

    async def _chat_messages(self, messages: list[dict], temperature: float) -> str:
        payload = {"model": settings.AI_MODEL, "messages": messages, "temperature": temperature}
        # P7：每次请求使用独立 AsyncClient（async with 自动关闭），
        # 避免模块导入时在事件循环外创建 client 导致的
        # "Event loop is closed" / DeprecationWarning，并确保连接被正确回收。
        async with httpx.AsyncClient(timeout=settings.AI_TIMEOUT_SECONDS) as client:
            resp = await client.post(
                f"{settings.AI_BASE_URL.rstrip('/')}/chat/completions",
                headers={"Authorization": f"Bearer {settings.AI_API_KEY}"},
                json=payload,
            )
            resp.raise_for_status()
            return resp.json()["choices"][0]["message"]["content"]

    def _parse_json(self, text: str) -> dict | None:
        import json
        import re

        match = re.search(r"\{.*\}", text, re.DOTALL)
        if not match:
            return None
        try:
            return json.loads(match.group(0))
        except Exception:
            return None

    def _mock_copy(self, name: str, category: str, note: str) -> dict:
        digest = int(hashlib.md5(f"{name}{category}".encode()).hexdigest(), 16)
        price = 19.9 + (digest % 180)
        return {
            "title": f"{name}｜{category}精选·限时好评",
            "sales_copy": (
                f"【{name}】来自「{category}」的用心之作。{note or '品质优选，细节见真章'}。"
                "AI 店长为你提炼卖点：轻巧好用、性价比出众，适合日常与送礼场景，买过的都说值。"
            ),
            "price_suggestion": round(price, 2),
        }

    def _mock_reply(self, question: str) -> str:
        q = question.strip()
        if any(k in q for k in ("发货", "快递", "物流")):
            return "您好，商品一般在付款后 48 小时内由商家发货，可在「我的订单」查看物流状态～"
        if any(k in q for k in ("退", "换")):
            return "支持七天无理由退换，请在下单后于订单页发起退款申请，商家会尽快处理。"
        return f"感谢您的咨询～关于「{q}」，这款商品由 AI 店长协助运营，更多细节可参考商品详情页，或留下问题我会继续帮您解答。"

    async def generate_marketing_copy(
        self, name: str, category: str, note: str, platform: str
    ) -> str:
        if not settings.AI_API_KEY:
            return self._mock_marketing(name, category, note, platform)
        prompt = (
            f"你是一名种草文案专家。为商品生成一篇适合「{platform}」平台的推广文案。\n"
            f"商品名：{name}\n品类：{category}\n卖点：{note}\n"
            "要求：口语化、有感染力、带合适的话题标签，不超过 200 字。"
        )
        try:
            return await self._chat(prompt, temperature=0.9)
        except Exception:
            logger.warning("AI 营销文案调用失败，降级为本地 mock", exc_info=True)
            return self._mock_marketing(name, category, note, platform)

    async def price_advice(
        self, name: str, category: str, note: str, market_price: float | None
    ) -> dict:
        if not settings.AI_API_KEY:
            return self._mock_price(name, category, market_price)
        prompt = (
            f"你是定价顾问。商品：{name}（{category}），卖家备注：{note}，"
            f"当前/市场参考价：{market_price}。请严格以 JSON 返回："
            '{"suggested_price": 数字, "reason": 一句话理由}'
        )
        try:
            text = await self._chat(prompt, temperature=0.3)
            parsed = self._parse_json(text)
            if parsed and "suggested_price" in parsed:
                return {
                    "suggested_price": float(parsed["suggested_price"]),
                    "reason": parsed.get("reason", ""),
                }
            return self._mock_price(name, category, market_price)
        except Exception:
            logger.warning("AI 定价建议调用失败，降级为本地 mock", exc_info=True)
            return self._mock_price(name, category, market_price)

    async def needs_human(self, message: str) -> bool:
        """判断买家问题是否需要转人工客服。"""
        if not settings.AI_API_KEY:
            return self._mock_needs_human(message)
        prompt = (
            "判断以下客服问题是否需要转接人工，仅回复 yes 或 no。\n"
            "需要转人工的情况：要求真人/电话、投诉举报、具体订单退款纠纷、隐私信息。\n"
            f"问题：{message}"
        )
        try:
            result = (await self._chat(prompt, temperature=0)).strip().lower()
            return result.startswith("yes")
        except Exception:
            logger.warning("AI 转人工判断调用失败，降级为本地 mock", exc_info=True)
            return self._mock_needs_human(message)

    def _mock_sentiment(self, text: str) -> str:
        neg = ("差", "烂", "坑", "骗", "假", "投诉", "垃圾", "退货", "失望", "慢")
        pos = ("好", "棒", "赞", "喜欢", "满意", "不错", "推荐", "快")
        if any(k in text for k in neg):
            return "negative"
        if any(k in text for k in pos):
            return "positive"
        return "neutral"

    def _mock_marketing(self, name: str, category: str, note: str, platform: str) -> str:
        note = note or "品质优选，细节见真章"
        if platform == "小红书":
            return (
                f"✨挖到宝了！最近入手的「{name}」真的绝绝子～\n"
                f"来自{category}的用心好物，{note}日常通勤/居家都能打，"
                "性价比拉满，姐妹们冲就完事了！\n#好物分享 #" + category + " #种草日记"
            )
        if platform == "朋友圈":
            return (
                f"最近在用的「{name}」真心不错（{category}）。{note}"
                "好东西忍不住安利给朋友圈的朋友们，需要的私我～"
            )
        # 抖音
        return (
            f"家人们谁懂啊！这款「{name}」也太香了吧！\n"
            f"{category}里的黑马，{note}点击下方小黄车，手慢无！"
        )

    def _mock_price(self, name: str, category: str, market_price: float | None) -> dict:
        base = market_price or 39.9
        digest = int(hashlib.md5(f"{name}{category}".encode()).hexdigest(), 16)
        suggested = round(base * (0.92 + (digest % 16) / 100), 2)
        return {
            "suggested_price": suggested,
            "reason": f"参考同类「{category}」商品价格与转化空间，建议定价 {suggested} 元以平衡销量与利润。",
        }

    def _mock_needs_human(self, message: str) -> bool:
        keys = ("人工", "客服", "电话", "投诉", "举报", "退款", "纠纷", "订单号", "隐私")
        return any(k in message for k in keys)

    async def generate_text(self, prompt: str, *, temperature: float = 0.6) -> str | None:
        """自由文本生成；无 API key 或调用失败时返回 None（调用方自行兜底）。"""
        if not settings.AI_API_KEY:
            return None
        try:
            return (await self._chat(prompt, temperature=temperature)).strip()
        except Exception:
            logger.warning("AI 自由文本生成调用失败，降级为 None", exc_info=True)
            return None


ai_service = AIService()
