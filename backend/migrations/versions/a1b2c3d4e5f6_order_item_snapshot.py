"""order item name/image snapshot columns

Revision ID: a1b2c3d4e5f6
Revises: 9e7a9125a43f
"""
from alembic import op
import sqlalchemy as sa


revision: str = "a1b2c3d4e5f6"
down_revision: str = "9e7a9125a43f"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    cols = {c["name"] for c in inspector.get_columns("order_items")}
    with op.batch_alter_table("order_items", schema=None) as batch_op:
        if "name" not in cols:
            batch_op.add_column(
                sa.Column("name", sa.String(length=200), nullable=True)
            )
        if "image_url" not in cols:
            batch_op.add_column(
                sa.Column("image_url", sa.String(length=500), nullable=True)
            )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    cols = {c["name"] for c in inspector.get_columns("order_items")}
    with op.batch_alter_table("order_items", schema=None) as batch_op:
        if "image_url" in cols:
            batch_op.drop_column("image_url")
        if "name" in cols:
            batch_op.drop_column("name")
