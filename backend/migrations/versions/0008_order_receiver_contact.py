"""orders.receiver / orders.contact columns (structured shipping info)

Revision ID: 0008
Revises: 0007
"""

from alembic import op
import sqlalchemy as sa


revision = "0008"
down_revision = "0007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    cols = {c["name"] for c in inspector.get_columns("orders")}
    if "receiver" not in cols:
        op.add_column("orders", sa.Column("receiver", sa.String(60), nullable=True))
    if "contact" not in cols:
        op.add_column("orders", sa.Column("contact", sa.String(40), nullable=True))


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    cols = {c["name"] for c in inspector.get_columns("orders")}
    if "contact" in cols:
        op.drop_column("orders", "contact")
    if "receiver" in cols:
        op.drop_column("orders", "receiver")
