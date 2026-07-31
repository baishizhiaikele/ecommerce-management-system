"""P2 体验增强：商品 AR 试穿字段。

Revision ID: 0012_product_ar
Revises: 0011_note_affiliate
"""
import sqlalchemy as sa
from sqlalchemy import inspect

revision = "0012_product_ar"
down_revision = "0011_note_affiliate"
branch_labels = None
depends_on = None

_COLUMNS = [
    ("products", "ar_enabled", sa.Integer, sa.Column("ar_enabled", sa.Integer, nullable=False, server_default="0")),
    ("products", "ar_overlay_url", sa.String(512), sa.Column("ar_overlay_url", sa.String(512), nullable=True)),
]


def _has_column(conn, table: str, column: str) -> bool:
    return column in [c["name"] for c in inspect(conn).get_columns(table)]


def upgrade() -> None:
    bind = op.get_bind()
    for table, column, _col in _COLUMNS:
        if not _has_column(bind, table, column):
            with op.batch_alter_table(table) as batch:
                batch.add_column(_col)


def downgrade() -> None:
    bind = op.get_bind()
    for table, column, _col in _COLUMNS:
        if _has_column(bind, table, column):
            with op.batch_alter_table(table) as batch:
                batch.drop_column(column)
