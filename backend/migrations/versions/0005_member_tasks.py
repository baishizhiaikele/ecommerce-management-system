"""member levels (users.growth_value/level) + user_tasks table

Revision ID: 0005
Revises: 0004
"""

from alembic import op
import sqlalchemy as sa

from app.db.base import Base

import app.models  # noqa: F401


revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing = set(inspector.get_table_names())
    if "user_tasks" not in existing:
        Base.metadata.create_all(
            bind, tables=[Base.metadata.tables["user_tasks"]]
        )

    cols = {c["name"] for c in inspector.get_columns("users")}
    if "growth_value" not in cols:
        op.add_column(
            "users",
            sa.Column("growth_value", sa.Integer(), nullable=False, server_default="0"),
        )
    if "level" not in cols:
        op.add_column(
            "users",
            sa.Column("level", sa.String(length=20), nullable=False, server_default="bronze"),
        )


def downgrade() -> None:
    bind = op.get_bind()
    if "user_tasks" in Base.metadata.tables:
        Base.metadata.drop_all(
            bind, tables=[Base.metadata.tables["user_tasks"]]
        )
    cols = {c["name"] for c in sa.inspect(bind).get_columns("users")}
    with op.batch_alter_table("users") as batch_op:
        if "level" in cols:
            batch_op.drop_column("level")
        if "growth_value" in cols:
            batch_op.drop_column("growth_value")
