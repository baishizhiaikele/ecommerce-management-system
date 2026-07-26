"""content modules: banners, promotions, addresses + product images/specs

Revision ID: 0002
Revises: 0001
"""

from alembic import op
import sqlalchemy as sa

from app.db.base import Base

import app.models  # noqa: F401


revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing = set(inspector.get_table_names())
    new_tables = [t for t in ("banners", "promotions", "addresses") if t not in existing]
    if new_tables:
        Base.metadata.create_all(
            bind, tables=[Base.metadata.tables[t] for t in new_tables]
        )

    cols = {c["name"] for c in inspector.get_columns("products")}
    if "images" not in cols:
        op.add_column("products", sa.Column("images", sa.Text(), nullable=True))
    if "specs" not in cols:
        op.add_column("products", sa.Column("specs", sa.Text(), nullable=True))


def downgrade() -> None:
    bind = op.get_bind()
    for t in ("banners", "promotions", "addresses"):
        if t in Base.metadata.tables:
            Base.metadata.drop_all(bind, tables=[Base.metadata.tables[t]])
    inspector = sa.inspect(bind)
    cols = {c["name"] for c in inspector.get_columns("products")}
    with op.batch_alter_table("products") as batch_op:
        if "images" in cols:
            batch_op.drop_column("images")
        if "specs" in cols:
            batch_op.drop_column("specs")
