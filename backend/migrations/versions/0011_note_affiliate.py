"""P3-G 种草商业化闭环：笔记与订单挂载分销推广码。

Revision ID: 0011_note_affiliate
Revises: 0010_note_review
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect

revision = "0011_note_affiliate"
down_revision = "0010_note_review"
branch_labels = None
depends_on = None

_COLUMNS = [
    ("shopping_notes", "affiliate_code", sa.String(12), sa.Column("affiliate_code", sa.String(12), nullable=True)),
    ("orders", "affiliate_code", sa.String(12), sa.Column("affiliate_code", sa.String(12), nullable=True)),
]


def _has_column(conn, table: str, column: str) -> bool:
    return column in [c["name"] for c in inspect(conn).get_columns(table)]


def upgrade() -> None:
    bind = op.get_bind()
    for table, column, _type, col in _COLUMNS:
        if not _has_column(bind, table, column):
            with op.batch_alter_table(table) as batch:
                batch.add_column(col)


def downgrade() -> None:
    bind = op.get_bind()
    for table, column, _type, _col in _COLUMNS:
        if _has_column(bind, table, column):
            with op.batch_alter_table(table) as batch:
                batch.drop_column(column)
