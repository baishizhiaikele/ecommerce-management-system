"""demo columns 补偿迁移（接管 _ensure_demo_columns 的 37 个列）。

早期版本为兼容既有旧库，在 app.main 的 `_ensure_demo_columns()` 中以运行时
"兜底"方式补齐列。本迁移把这些 DDL 演进正式纳入 Alembic 版本链，使 schema
演进可追溯、后续 `alembic revision --autogenerate` 能正确比对，不再重复生成。

SQLite 的 ADD COLUMN 不支持 IF NOT EXISTS，故用 inspect 检查列是否存在后增量补齐
（幂等）。`_DEMO_ENUM_UPDATES` 的数据修正（status 枚举 name 规范化）一并纳入。
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

revision = "0009_demo_columns"
down_revision = "a1b2c3d4e5f6"
branch_labels = None
depends_on = None


# 与 _ensure_demo_columns 中的 _DEMO_COLUMN_DEFS 保持一致
_COLUMN_DEFS = [
    ("users", "is_verified", sa.Boolean(), "0"),
    ("users", "registered_at", sa.DateTime(), "CURRENT_TIMESTAMP"),
    ("users", "inviter_id", sa.Integer(), None),
    ("users", "points", sa.Integer(), "0"),
    ("users", "level", sa.Integer(), "1"),
    ("users", "total_spent", sa.Numeric(12, 2), "0"),
    ("users", "affiliate_code", sa.String(32), None),
    ("users", "avatar_url", sa.String(255), None),
    ("users", "bio", sa.Text(), None),
    ("users", "notification_enabled", sa.Boolean(), "1"),
    ("users", "last_active_at", sa.DateTime(), None),
    ("orders", "coupon_id", sa.Integer(), None),
    ("orders", "discount_amount", sa.Numeric(12, 2), "0"),
    ("orders", "points_used", sa.Integer(), "0"),
    ("orders", "points_discount", sa.Numeric(12, 2), "0"),
    ("orders", "receiver_name", sa.String(64), None),
    ("orders", "receiver_phone", sa.String(32), None),
    ("orders", "receiver_contact", sa.String(64), None),
    ("orders", "points_earned", sa.Integer(), "0"),
    ("orders", "settlement_status", sa.String(16), "'pending'"),
    ("payments", "gateway_payment_id", sa.String(128), None),
    ("payments", "paid_at", sa.DateTime(), None),
    ("payments", "refunded_at", sa.DateTime(), None),
    ("products", "cost_price", sa.Numeric(12, 2), "0"),
    ("products", "stock_warning", sa.Integer(), "10"),
    ("products", "specs", sa.Text(), "'{}'"),
    ("products", "tags", sa.Text(), "'[]'"),
    ("products", "rating", sa.Numeric(3, 2), "0"),
    ("products", "sales", sa.Integer(), "0"),
    ("products", "detail", sa.Text(), "''"),
    ("products", "banner", sa.String(255), None),
    ("cart_items", "selected", sa.Boolean(), "1"),
    ("cart_items", "flash_sale_id", sa.Integer(), None),
    ("live_rooms", "product_ids", sa.Text(), "'[]'"),
    ("live_rooms", "viewer_count", sa.Integer(), "0"),
    ("group_buys", "required_size", sa.Integer(), "2"),
    ("bargains", "current_price", sa.Numeric(12, 2), None),
]


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    existing = {tbl: {c["name"] for c in inspector.get_columns(tbl)}
                for tbl in inspector.get_table_names()}

    for table, col, col_type, default in _COLUMN_DEFS:
        if table in existing and col in existing[table]:
            continue
        op.add_column(table, sa.Column(col, col_type))
        if default is not None:
            op.execute(f"UPDATE {table} SET {col} = {default} WHERE {col} IS NULL")
        existing.setdefault(table, set()).add(col)

    # 枚举 status 规范化：旧库可能以 value("active") 存储，统一为 SAEnum name("ACTIVE")
    op.execute("UPDATE products SET status = 'ACTIVE' WHERE status = 'active'")
    op.execute("UPDATE orders SET status = 'PENDING_PAYMENT' WHERE status = 'pending_payment'")
    op.execute("UPDATE orders SET status = 'PAID' WHERE status = 'paid'")
    op.execute("UPDATE orders SET status = 'SHIPPED' WHERE status = 'shipped'")
    op.execute("UPDATE orders SET status = 'COMPLETED' WHERE status = 'completed'")
    op.execute("UPDATE orders SET status = 'CANCELLED' WHERE status = 'cancelled'")
    op.execute("UPDATE orders SET status = 'REFUNDING' WHERE status = 'refunding'")
    op.execute("UPDATE orders SET status = 'REFUNDED' WHERE status = 'refunded'")
    op.execute("UPDATE orders SET status = 'CLOSED' WHERE status = 'closed'")


def downgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    existing = {tbl: {c["name"] for c in inspector.get_columns(tbl)}
                for tbl in inspector.get_table_names()}

    # 仅删除本次迁移新增的列（按定义逆序）
    for table, col, _type, _default in reversed(_COLUMN_DEFS):
        if table in existing and col in existing[table]:
            op.drop_column(table, col)
