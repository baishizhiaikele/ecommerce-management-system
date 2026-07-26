"""shipping templates + orders.freight

Revision ID: 0004
Revises: 0003
"""

from alembic import op
import sqlalchemy as sa

from app.db.base import Base

import app.models  # noqa: F401


revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing = set(inspector.get_table_names())
    if "shipping_templates" not in existing:
        Base.metadata.create_all(
            bind, tables=[Base.metadata.tables["shipping_templates"]]
        )

    cols = {c["name"] for c in inspector.get_columns("orders")}
    if "freight" not in cols:
        op.add_column(
            "orders",
            sa.Column("freight", sa.Numeric(12, 2), nullable=False, server_default="0"),
        )


def downgrade() -> None:
    bind = op.get_bind()
    if "shipping_templates" in Base.metadata.tables:
        Base.metadata.drop_all(
            bind, tables=[Base.metadata.tables["shipping_templates"]]
        )
    inspector = sa.inspect(bind)
    cols = {c["name"] for c in inspector.get_columns("orders")}
    with op.batch_alter_table("orders") as batch_op:
        if "freight" in cols:
            batch_op.drop_column("freight")
