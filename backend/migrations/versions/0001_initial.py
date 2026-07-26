"""initial schema

Revision ID: 0001
Revises:
Create Date: 2026-07-26 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

from app.db.base import Base

# 确保全部模型注册到 Base.metadata（建表元数据来源）
import app.models  # noqa: F401


revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    # 若核心表已存在，视为旧库已处于最新 schema，跳过建表。
    # 保持幂等：兼容开发库 / 已部署的既有数据库，避免重复建表报错。
    if inspector.has_table("users"):
        return
    Base.metadata.create_all(bind)


def downgrade() -> None:
    bind = op.get_bind()
    Base.metadata.drop_all(bind)
