import hashlib
import httpx

from app.core.config import settings


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
            return self._mock_sentiment(text)

    async def _chat(self, prompt: str, temperature: float = 0.7) -> str:
        return await self._chat_messages([{"role": "user", "content": prompt}], temperature)

    async def _chat_messages(self, messages: list[dict], temperature: float) -> str:
        payload = {"model": settings.AI_MODEL, "messages": messages, "temperature": temperature}
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

    def _mock_sentiment(self, text: str) -> str:
        neg = ("差", "烂", "坑", "骗", "假", "投诉", "垃圾", "退货", "失望", "慢")
        pos = ("好", "棒", "赞", "喜欢", "满意", "不错", "推荐", "快")
        if any(k in text for k in neg):
            return "negative"
        if any(k in text for k in pos):
            return "positive"
        return "neutral"


ai_service = AIService()
