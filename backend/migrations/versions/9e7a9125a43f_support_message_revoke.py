"""support message revoke columns

Revision ID: 9e7a9125a43f
Revises: 0008
"""
from alembic import op
import sqlalchemy as sa


revision: str = "9e7a9125a43f"
down_revision: str = "0008"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    cols = {c["name"] for c in inspector.get_columns("support_messages")}
    with op.batch_alter_table("support_messages", schema=None) as batch_op:
        if "is_revoked" not in cols:
            batch_op.add_column(
                sa.Column("is_revoked", sa.Boolean(), server_default="0", nullable=False)
            )
        if "revoked_at" not in cols:
            batch_op.add_column(
                sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True)
            )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    cols = {c["name"] for c in inspector.get_columns("support_messages")}
    with op.batch_alter_table("support_messages", schema=None) as batch_op:
        if "revoked_at" in cols:
            batch_op.drop_column("revoked_at")
        if "is_revoked" in cols:
            batch_op.drop_column("is_revoked")
