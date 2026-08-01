"""T18 收尾：把 _ensure_demo_columns 兜底的剩余 56 列纳入 Alembic 正式迁移。

背景：`app/main.py` 的 `_DEMO_COLUMN_DEFS` 通过运行时 ALTER 兜底补列，
而该兜底受 `ALLOW_SCHEMA_AUTOFIX` 开关控制（生产默认关闭）。
迁移 0009 只覆盖了更早的一批列，本文件覆盖其余 56 列，
使「纯 Alembic 建库 + 关闭 autofix」也能得到完整可用的 schema。

所有变更都是幂等的：列已存在则跳过；表不存在则跳过。
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect

revision = "0015_demo_columns_part2"
down_revision = "0014_variant_price_delta_numeric"
branch_labels = None
depends_on = None


# (表名, 列名, 类型, 服务端默认值) —— 与 app/main.py 的 _DEMO_COLUMN_DEFS 对应
_COLUMN_DEFS = [
    ("reviews", "reply", sa.Text(), None),
    ("reviews", "is_pinned", sa.Boolean(), "0"),
    ("reviews", "helpful_count", sa.Integer(), "0"),
    ("reviews", "report_count", sa.Integer(), "0"),
    ("reviews", "images", sa.Text(), None),
    ("reviews", "video", sa.String(512), None),
    ("reviews", "append_content", sa.Text(), None),
    ("reviews", "append_at", sa.DateTime(), None),
    ("reviews", "append_images", sa.Text(), None),
    ("reviews", "report_reason", sa.Text(), None),
    ("order_items", "variant_info", sa.Text(), None),
    ("order_items", "variant_id", sa.String(36), None),
    ("order_items", "warehouse_id", sa.String(36), None),
    ("orders", "live_room_id", sa.String(36), None),
    ("orders", "refund_amount", sa.Numeric(12, 2), "0"),
    ("orders", "refund_rejections", sa.Integer(), "0"),
    ("orders", "return_tracking_no", sa.String(60), None),
    ("orders", "return_carrier", sa.String(60), None),
    ("orders", "dispute_reason", sa.Text(), None),
    ("orders", "return_requested_at", sa.DateTime(), None),
    ("orders", "return_shipped_at", sa.DateTime(), None),
    ("orders", "return_received_at", sa.DateTime(), None),
    ("orders", "exchange_at", sa.DateTime(), None),
    ("orders", "delivery_type", sa.String(20), "'express'"),
    ("orders", "pickup_store", sa.String(200), None),
    ("orders", "pickup_code", sa.String(12), None),
    ("orders", "picked_up_at", sa.DateTime(), None),
    ("orders", "deleted_at", sa.DateTime(), None),
    ("orders", "affiliate_code", sa.String(12), None),
    ("coupons", "applicable_category", sa.String(80), None),
    ("cart_items", "variant_id", sa.String(36), None),
    ("products", "warning_threshold", sa.Integer(), "10"),
    ("products", "ar_enabled", sa.Boolean(), "0"),
    ("products", "ar_overlay_url", sa.String(512), None),
    ("payments", "escrow_status", sa.String(20), "'none'"),
    ("payments", "released_at", sa.DateTime(), None),
    ("promotions", "stock_limit", sa.Integer(), None),
    ("promotions", "stock_sold", sa.Integer(), "0"),
    ("promotions", "threshold_amount", sa.Numeric(12, 2), None),
    ("promotions", "gift_product_id", sa.String(36), None),
    ("promotions", "bundle_count", sa.Integer(), None),
    ("promotions", "bundle_price", sa.Numeric(12, 2), None),
    ("invoices", "pdf_url", sa.String(512), None),
    ("support_tickets", "order_id", sa.String(36), None),
    ("support_tickets", "priority", sa.String(20), "'normal'"),
    ("support_tickets", "category", sa.String(20), "'other'"),
    ("support_tickets", "satisfaction_rating", sa.Integer(), None),
    ("support_tickets", "satisfaction_comment", sa.Text(), None),
    ("support_tickets", "unread_for_buyer", sa.Integer(), "0"),
    ("support_tickets", "unread_for_merchant", sa.Integer(), "0"),
    ("support_messages", "is_internal", sa.Boolean(), "0"),
    ("shopping_notes", "review_status", sa.String(20), "'pending'"),
    ("shopping_notes", "reject_reason", sa.String(255), None),
    ("shopping_notes", "reviewed_at", sa.DateTime(), None),
    ("shopping_notes", "reviewed_by", sa.String(36), None),
    ("shopping_notes", "affiliate_code", sa.String(12), None),
]


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    tables = set(inspector.get_table_names())
    existing = {t: {c["name"] for c in inspector.get_columns(t)} for t in tables}

    for table, column, type_, default in _COLUMN_DEFS:
        if table not in tables or column in existing.get(table, set()):
            continue
        op.add_column(
            table,
            sa.Column(
                column,
                type_,
                nullable=True,
                server_default=sa.text(default) if default is not None else None,
            ),
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    tables = set(inspector.get_table_names())
    existing = {t: {c["name"] for c in inspector.get_columns(t)} for t in tables}

    for table, column, _type, _default in reversed(_COLUMN_DEFS):
        if table not in tables or column not in existing.get(table, set()):
            continue
        with op.batch_alter_table(table) as batch:
            batch.drop_column(column)
