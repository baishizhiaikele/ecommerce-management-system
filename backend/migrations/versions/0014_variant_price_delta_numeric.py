"""T16 收尾：SKU 差价 product_variants.price_delta Float -> Numeric(12,2)。

price_delta 参与订单金额计算（unit_price = product.price + variant.price_delta），
属于资金链路字段，需与其余金额列一样使用 Numeric(12,2) 精确到分，
避免 Float 累计舍入误差造成对账差异。

使用 batch_alter_table 以兼容 SQLite（生产 PostgreSQL 同样安全）。
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect

revision = "0014_variant_price_delta_numeric"
down_revision = "0013_money_numeric"
branch_labels = None
depends_on = None

_TABLE = "product_variants"
_COLUMN = "price_delta"


def _has_column(conn, table: str, column: str) -> bool:
    insp = inspect(conn)
    if table not in insp.get_table_names():
        return False
    return column in [c["name"] for c in insp.get_columns(table)]


def upgrade() -> None:
    bind = op.get_bind()
    if not _has_column(bind, _TABLE, _COLUMN):
        return
    with op.batch_alter_table(_TABLE) as batch:
        batch.alter_column(
            _COLUMN,
            type_=sa.Numeric(12, 2),
            existing_type=sa.Float(),
            existing_nullable=True,
        )


def downgrade() -> None:
    bind = op.get_bind()
    if not _has_column(bind, _TABLE, _COLUMN):
        return
    with op.batch_alter_table(_TABLE) as batch:
        batch.alter_column(
            _COLUMN,
            type_=sa.Float(),
            existing_type=sa.Numeric(12, 2),
            existing_nullable=True,
        )
