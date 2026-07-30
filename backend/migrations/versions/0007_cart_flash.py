"""cart_items.is_flash column (mark flash-sale cart items)

Revision ID: 0007
Revises: 0006
"""

from alembic import op
import sqlalchemy as sa


revision = "0007"
down_revision = "0006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    cols = {c["name"] for c in inspector.get_columns("cart_items")}
    if "is_flash" not in cols:
        op.add_column(
            "cart_items",
            sa.Column("is_flash", sa.Integer(), nullable=False, server_default="0"),
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    cols = {c["name"] for c in inspector.get_columns("cart_items")}
    if "is_flash" in cols:
        op.drop_column("cart_items", "is_flash")
