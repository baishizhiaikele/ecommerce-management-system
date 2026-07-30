import uuid

from sqlalchemy import Column, ForeignKey, Integer, Numeric, String, UniqueConstraint

from app.db.base import Base


class CartItem(Base):
    __tablename__ = "cart_items"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String(36), ForeignKey("users.id"), nullable=False)
    product_id = Column(String(36), ForeignKey("products.id"), nullable=False)
    variant_id = Column(String(36), ForeignKey("product_variants.id"), nullable=True)
    quantity = Column(Integer, nullable=False, default=1)
    price = Column(Numeric(12, 2), nullable=True)
    is_flash = Column(Integer, default=0, nullable=False, server_default="0")

    __table_args__ = (
        UniqueConstraint("user_id", "product_id", "variant_id", name="uq_cart_user_product"),
    )
