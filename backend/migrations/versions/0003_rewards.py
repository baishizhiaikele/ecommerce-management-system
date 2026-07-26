"""rewards (积分商城) + 用户资料字段 (avatar/description)

Revision ID: 0003
Revises: 0002
"""

from alembic import op
import sqlalchemy as sa

from app.db.base import Base

import app.models  # noqa: F401


revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing = set(inspector.get_table_names())
    new_tables = [t for t in ("redemption_items", "redemption_records") if t not in existing]
    if new_tables:
        Base.metadata.create_all(
            bind, tables=[Base.metadata.tables[t] for t in new_tables]
        )

    cols = {c["name"] for c in inspector.get_columns("users")}
    if "avatar" not in cols:
        op.add_column("users", sa.Column("avatar", sa.String(512), nullable=True))
    if "description" not in cols:
        op.add_column("users", sa.Column("description", sa.Text(), nullable=True))


def downgrade() -> None:
    bind = op.get_bind()
    for t in ("redemption_items", "redemption_records"):
        if t in Base.metadata.tables:
            Base.metadata.drop_all(bind, tables=[Base.metadata.tables[t]])
    inspector = sa.inspect(bind)
    cols = {c["name"] for c in inspector.get_columns("users")}
    with op.batch_alter_table("users") as batch_op:
        if "avatar" in cols:
            batch_op.drop_column("avatar")
        if "description" in cols:
            batch_op.drop_column("description")
