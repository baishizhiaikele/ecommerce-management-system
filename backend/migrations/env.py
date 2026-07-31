"""Alembic 环境配置（异步引擎支持）。

- 数据库 URL 取自应用配置 `app.core.config.settings`，与运行时使用同一连接串，
  因此开发（SQLite）与生产（PostgreSQL+asyncpg）共用同一套迁移。
- 启用 `render_as_batch=True`，使后续在 SQLite 上的 ALTER（增删列/改列）可安全执行。
"""
import asyncio
from logging.config import fileConfig

from alembic import context
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy.pool import NullPool

from app.core.config import settings
from app.db.base import Base

# 必须导入，确保全部模型注册到 Base.metadata（迁移元数据来源）
import app.models  # noqa: F401

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    """离线模式：仅生成 SQL，不连接数据库。"""
    url = settings.async_database_url
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        render_as_batch=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection) -> None:
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        compare_type=True,
        render_as_batch=True,
    )
    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations() -> None:
    connectable = create_async_engine(settings.async_database_url, poolclass=NullPool)
    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)
    await connectable.dispose()


def run_migrations_online() -> None:
    """在线模式：连接数据库并执行迁移。

    SQLite 场景下 alembic 本身是同步工具，若复用 aiosqlite 异步引擎并通过
    run_sync 把同步逻辑派发到线程执行，极易在事件循环/工作线程间死锁——表现为
    startup 永久阻塞在 alembic 准备阶段且无任何报错（数据库连接因此长期持锁）。
    故 SQLite 改用同步引擎直接执行，彻底规避死锁；PostgreSQL 等仍走异步路径。
    """
    url = settings.async_database_url
    if url.startswith("sqlite"):
        from sqlalchemy import create_engine

        sync_url = url.replace("sqlite+aiosqlite", "sqlite")
        connectable = create_engine(sync_url, poolclass=NullPool)
        with connectable.connect() as connection:
            do_run_migrations(connection)
        connectable.dispose()
    else:
        asyncio.run(run_async_migrations())


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
