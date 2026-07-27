"""payments table (sandbox gateway, idempotent webhook + refund)

Revision ID: 0006
Revises: 0005
"""

from alembic import op
import sqlalchemy as sa

from app.db.base import Base

import app.models  # noqa: F401


revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing = set(inspector.get_table_names())
    if "payments" not in existing:
        Base.metadata.create_all(bind, tables=[Base.metadata.tables["payments"]])


def downgrade() -> None:
    bind = op.get_bind()
    if "payments" in Base.metadata.tables:
        Base.metadata.drop_all(bind, tables=[Base.metadata.tables["payments"]])
