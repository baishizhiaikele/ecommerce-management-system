from app.db.session import SessionLocal
from app.events import bus
from app.models.notification import Notification, NotificationType
from app.models.order import Order
from app.models.product import Product
from app.models.points import PointAction
from app.models.review import Review, Sentiment
from app.models.user import User
from app.services.ai_service import ai_service
from app.services.audit_service import record
from app.services.favorite_service import list_user_ids_by_product
from app.services.member_service import award_growth
from app.services.notification_service import notify
from app.services.payment_service import refund_payment
from app.services.points_service import POINTS_PER_YUAN, add_points


async def _on_review_created(review_id: str) -> None:
    async with SessionLocal() as s:
        review = await s.get(Review, review_id)
        if not review:
            return
        label = await ai_service.analyze_sentiment(review.content)
        review.sentiment = Sentiment(label)
        await record(s, None, "review.sentiment", "review", review.id, label)
        # 差评预警：通知商家
        if label == "negative":
            product = await s.get(Product, review.product_id)
            if product:
                await notify(
                    s,
                    product.merchant_id,
                    NotificationType.REVIEW_ALERT,
                    "收到差评预警",
                    f"商品「{product.name}」出现差评，请及时关注并处理。",
                    review.id,
                )
        await s.commit()


async def _on_product_out_of_stock(product_id: str) -> None:
    async with SessionLocal() as s:
        product = await s.get(Product, product_id)
        name = product.name if product else product_id
        await record(s, None, "product.out_of_stock", "product", product_id, f"商品「{name}」已售罄")
        await s.commit()


async def _on_order_completed(order_id: str, buyer_id: str) -> None:
    async with SessionLocal() as s:
        order = await s.get(Order, order_id)
        if not order:
            return
        earned = int(float(order.total_amount) * POINTS_PER_YUAN)
        if earned > 0:
            await add_points(s, buyer_id, PointAction.ORDER_COMPLETE, earned, f"订单 {order.order_no} 完成奖励")
        # 分销：若买家由推广人邀请，结算佣金
        from app.services.affiliate_service import grant_commission

        await grant_commission(s, order)
        # 成长值：按实付金额累计，自动重算会员等级
        await award_growth(s, buyer_id, int(float(order.total_amount)))
        await notify(
            s,
            buyer_id,
            NotificationType.POINTS,
            "订单已完成",
            f"订单 {order.order_no} 交易完成，获得 {earned} 积分，期待您的评价～",
            order.id,
        )
        await s.commit()


async def _on_order_refunded(order_id: str, buyer_id: str) -> None:
    async with SessionLocal() as s:
        order = await s.get(Order, order_id)
        if not order:
            return
        # 原路退款：标记对应支付流水为 REFUNDED（资金沿原网关退回）
        await refund_payment(s, order)
        # 分销：退款冲正佣金
        from app.services.affiliate_service import reverse_commission

        await reverse_commission(s, order_id)
        await s.commit()
        refund_amt = float(order.refund_amount or order.total_amount or 0)
        revert = int(refund_amt * POINTS_PER_YUAN)
        if revert > 0:
            await add_points(s, buyer_id, PointAction.REFUND, -revert, f"订单 {order.order_no} 退款回收积分")
        await notify(
            s,
            buyer_id,
            NotificationType.ORDER,
            "退款已处理",
            f"订单 {order.order_no} 的退款已完成。",
            order.id,
        )
        await s.commit()


async def _on_coupon_claimed(user_id: str, coupon_id: str) -> None:
    async with SessionLocal() as s:
        await notify(
            s,
            user_id,
            NotificationType.COUPON,
            "优惠券到账",
            "您领取的优惠券已存入「我的卡券」，结算时可用。",
            coupon_id,
        )
        await s.commit()


async def _on_product_price_changed(product_id: str, old_price: float, new_price: float) -> None:
    async with SessionLocal() as s:
        product = await s.get(Product, product_id)
        if not product:
            return
        user_ids = await list_user_ids_by_product(s, product_id)
        for uid in user_ids:
            await notify(
                s,
                uid,
                NotificationType.PRICE_DROP,
                "降价提醒",
                f"您收藏的商品「{product.name}」降价啦：¥{old_price:.2f} → ¥{new_price:.2f}",
                product.id,
            )
        await s.commit()


def register_handlers() -> None:
    bus.subscribe("review.created", _on_review_created)
    bus.subscribe("product.out_of_stock", _on_product_out_of_stock)
    bus.subscribe("order.completed", _on_order_completed)
    bus.subscribe("order.refunded", _on_order_refunded)
    bus.subscribe("coupon.claimed", _on_coupon_claimed)
    bus.subscribe("product.price_changed", _on_product_price_changed)
