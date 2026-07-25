from app.db.session import SessionLocal
from app.events import bus
from app.models.product import Product
from app.models.review import Review, Sentiment
from app.services.ai_service import ai_service
from app.services.audit_service import record


async def _on_review_created(review_id: str) -> None:
    async with SessionLocal() as s:
        review = await s.get(Review, review_id)
        if not review:
            return
        label = await ai_service.analyze_sentiment(review.content)
        review.sentiment = Sentiment(label)
        await record(s, None, "review.sentiment", "review", review.id, label)
        await s.commit()


async def _on_product_out_of_stock(product_id: str) -> None:
    async with SessionLocal() as s:
        product = await s.get(Product, product_id)
        name = product.name if product else product_id
        await record(s, None, "product.out_of_stock", "product", product_id, f"商品「{name}」已售罄")
        await s.commit()


def register_handlers() -> None:
    bus.subscribe("review.created", _on_review_created)
    bus.subscribe("product.out_of_stock", _on_product_out_of_stock)
