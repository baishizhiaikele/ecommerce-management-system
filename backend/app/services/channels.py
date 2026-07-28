"""外发通知渠道：邮件（SMTP）/ 短信（HTTP 网关）。

设计原则：
- 未配置对应渠道时**降级为本地日志**，绝不抛错或阻塞业务主流程。
- 配置后真实投递，便于演示从「站内信」升级为「可触达用户的邮件/短信」。
"""
import asyncio
import logging
import smtplib
from email.mime.text import MIMEText
from email.utils import formataddr

import httpx
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings

logger = logging.getLogger("app.channels")


async def send_email(to: str, subject: str, body: str) -> bool:
    """发送文本邮件：配置 SMTP 时真实发送，否则记日志降级。返回是否投递成功。"""
    if not (settings.SMTP_HOST and settings.SMTP_USER and settings.SMTP_PASSWORD):
        logger.info("[email:skip] to=%s subject=%s", to, subject)
        return False
    from_email = settings.SMTP_FROM or settings.SMTP_USER
    msg = MIMEText(body, "plain", "utf-8")
    msg["From"] = formataddr(("AI 全托管小店", from_email))
    msg["To"] = to
    msg["Subject"] = subject

    def _send() -> None:
        with smtplib.SMTP_SSL(settings.SMTP_HOST, settings.SMTP_PORT) as s:
            s.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
            s.sendmail(from_email, [to], msg.as_string())

    try:
        loop = asyncio.get_running_loop()
        await loop.run_in_executor(None, _send)
        return True
    except Exception as exc:  # noqa: BLE001
        logger.warning("[email:fail] to=%s err=%s", to, exc)
        return False


async def send_sms(to: str, body: str) -> bool:
    """发送短信：配置短信网关时真实调用，否则记日志降级。"""
    if not (settings.SMS_API_KEY and settings.SMS_BASE_URL):
        logger.info("[sms:skip] to=%s body=%s", to, body)
        return False
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(
                settings.SMS_BASE_URL,
                json={"to": to, "content": body, "apikey": settings.SMS_API_KEY},
            )
            return resp.status_code < 300
    except Exception as exc:  # noqa: BLE001
        logger.warning("[sms:fail] to=%s err=%s", to, exc)
        return False


# 需要外发邮件的重要通知类型（与 notify 联动）
_IMPORTANT_FOR_EMAIL = {"order", "refund", "system", "live", "coupon"}


async def dispatch_outbound(db: AsyncSession, *, user_id: str, ntype: str, title: str, content: str) -> None:
    """对重要通知，若用户邮箱存在且渠道已配置，则外发邮件（失败仅记日志）。"""
    if ntype not in _IMPORTANT_FOR_EMAIL:
        return
    if not settings.SMTP_HOST:
        return
    from app.models.user import User

    user = await db.get(User, user_id)
    if not user or not getattr(user, "email", None):
        return
    await send_email(user.email, title, content)
