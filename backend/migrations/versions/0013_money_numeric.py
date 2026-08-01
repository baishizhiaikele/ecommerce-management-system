"""T16 资金正确性：金额字段 Float -> Numeric(12,2)。

涉及表/列：
  - affiliate_commission: order_amount, commission, amount
  - invoices: amount
  - shipping_templates: base_fee, free_amount

Numeric(12,2) 可精确表示到分，避免 Float 累计舍入误差导致的资金对账差异。
使用 batch_alter_table 以兼容 SQLite（生产 PostgreSQL 同样安全）。
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect

revision = "0013_money_numeric"
down_revision = "0012_product_ar"
branch_labels = None
depends_on = None

_COLUMNS = [
    ("affiliate_commissions", "order_amount", sa.Numeric(12, 2), False),
    ("affiliate_commissions", "commission", sa.Numeric(12, 2), False),
    ("affiliate_withdrawals", "amount", sa.Numeric(12, 2), False),
    ("invoices", "amount", sa.Numeric(12, 2), False),
    ("shipping_templates", "base_fee", sa.Numeric(12, 2), False),
    ("shipping_templates", "free_amount", sa.Numeric(12, 2), False),
]


def _has_column(conn, table: str, column: str) -> bool:
    return column in [c["name"] for c in inspect(conn).get_columns(table)]


def upgrade() -> None:
    bind = op.get_bind()
    for table, column, col_type, nullable in _COLUMNS:
        if not _has_column(bind, table, column):
            continue
        with op.batch_alter_table(table) as batch:
            batch.alter_column(
                column,
                type_=col_type,
                existing_type=sa.Float(),
                existing_nullable=nullable,
            )


def downgrade() -> None:
    bind = op.get_bind()
    for table, column, col_type, nullable in _COLUMNS:
        if not _has_column(bind, table, column):
            continue
        with op.batch_alter_table(table) as batch:
            batch.alter_column(
                column,
                type_=sa.Float(),
                existing_type=col_type,
                existing_nullable=nullable,
            )
