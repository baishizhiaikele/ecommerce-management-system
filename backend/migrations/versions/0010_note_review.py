"""种草笔记审核闭环（P3-G 深化）：shopping_notes 增加审核状态字段。

- review_status（pending/approved/rejected）
- reject_reason
- reviewed_at
- reviewed_by（FK -> users，缺失时 SET NULL）

SQLite 的 ADD COLUMN 不支持 IF NOT EXISTS，用 inspect 检查列是否存在后增量补齐（幂等）。
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

revision = "0010_note_review"
down_revision = "0009_demo_columns"
branch_labels = None
depends_on = None


_COLUMN_DEFS = [
    ("shopping_notes", "review_status", sa.String(20), "pending"),
    ("shopping_notes", "reject_reason", sa.String(255), None),
    ("shopping_notes", "reviewed_at", sa.DateTime(), None),
    ("shopping_notes", "reviewed_by", sa.String(36), None),
]


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    existing = {tbl: {c["name"] for c in inspector.get_columns(tbl)}
                for tbl in inspector.get_table_names()}
    for table, col, col_type, default in _COLUMN_DEFS:
        if table in existing and col in existing[table]:
            continue
        op.add_column(table, sa.Column(col, col_type, nullable=True))
        if default is not None:
            op.execute(f"UPDATE {table} SET {col} = '{default}' WHERE {col} IS NULL")
        existing.setdefault(table, set()).add(col)
    # 已存在的历史笔记（无审核状态）归并为 approved，直接进入公开流
    op.execute("UPDATE shopping_notes SET review_status = 'approved' WHERE review_status IS NULL")


def downgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    existing = {tbl: {c["name"] for c in inspector.get_columns(tbl)}
                for tbl in inspector.get_table_names()}
    for table, col, _type, _default in reversed(_COLUMN_DEFS):
        if table in existing and col in existing[table]:
            op.drop_column(table, col)
