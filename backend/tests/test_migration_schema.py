"""T18 验收：纯 Alembic 建库必须得到完整 schema，不依赖运行时 ALTER 兜底。

`app/main.py` 的 `_ensure_demo_columns` 会在启动时补列，但它受
`ALLOW_SCHEMA_AUTOFIX` 开关控制（生产环境默认关闭）。若某个列只存在于
`_DEMO_COLUMN_DEFS` 而没有对应迁移，生产用纯 Alembic 建库就会缺列并在运行期报错。

本测试在一个全新的临时 SQLite 库上跑完整迁移链，然后断言
`_DEMO_COLUMN_DEFS` 中的每一列都已存在。新增兜底列却忘记写迁移时，此测试会失败。
"""

from __future__ import annotations

import sqlite3
import subprocess
import sys
from pathlib import Path

import pytest

BACKEND_DIR = Path(__file__).resolve().parent.parent


def _run_migrations(db_path: Path) -> subprocess.CompletedProcess[str]:
    env = {
        **__import__("os").environ,
        "DATABASE_URL": f"sqlite+aiosqlite:///{db_path.as_posix()}",
    }
    return subprocess.run(
        [sys.executable, "-m", "alembic", "upgrade", "head"],
        cwd=BACKEND_DIR,
        env=env,
        capture_output=True,
        text=True,
        timeout=300,
    )


def test_alembic_only_schema_has_all_runtime_patched_columns(tmp_path: Path) -> None:
    from app.main import _DEMO_COLUMN_DEFS

    db_path = tmp_path / "migration_check.db"
    result = _run_migrations(db_path)
    assert result.returncode == 0, f"alembic upgrade head 失败:\n{result.stdout}\n{result.stderr}"
    assert db_path.exists(), "迁移未生成数据库文件"

    conn = sqlite3.connect(db_path)
    try:
        tables = {r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        missing: list[str] = []
        for table, column, _ddl in _DEMO_COLUMN_DEFS:
            if table not in tables:
                # 表本身不由迁移创建（纯演示表）时跳过，避免误报
                continue
            columns = {r[1] for r in conn.execute(f"PRAGMA table_info({table})")}
            if column not in columns:
                missing.append(f"{table}.{column}")
    finally:
        conn.close()

    assert not missing, (
        "以下列只靠运行时 ALTER 兜底、缺少 Alembic 迁移，"
        f"生产纯 Alembic 建库会缺列：{missing}"
    )


def test_migration_chain_has_single_head() -> None:
    """迁移链必须只有一个 head，避免分叉导致部分环境漏跑迁移。"""
    result = subprocess.run(
        [sys.executable, "-m", "alembic", "heads"],
        cwd=BACKEND_DIR,
        capture_output=True,
        text=True,
        timeout=120,
    )
    assert result.returncode == 0, f"alembic heads 失败:\n{result.stderr}"
    heads = [ln for ln in result.stdout.splitlines() if "(head)" in ln]
    assert len(heads) == 1, f"迁移链存在多个 head，需要 merge：{heads}"
