"""数据库特定错误的可移植判定。

SQLAlchemy 本身没有统一的 ``DeadlockDetectedError`` 导出，不同数据库把死锁
归到不同的原异常下（PostgreSQL 为 ``40P01``、SQLite 为 "database is locked"）。
这里集中一个跨数据库判断，避免在业务代码里直接 ``import`` 不存在的符号。
"""
from sqlalchemy.exc import OperationalError


def is_deadlock(exc: Exception) -> bool:
    """判断异常是否为死锁（可重试的并发冲突）。"""
    if not isinstance(exc, OperationalError):
        return False
    pgcode = getattr(getattr(exc, "orig", None), "pgcode", None)
    if pgcode == "40P01":
        return True
    text = str(exc).lower()
    return (
        "deadlock" in text
        or "database is locked" in text
        or "database table is locked" in text
    )
