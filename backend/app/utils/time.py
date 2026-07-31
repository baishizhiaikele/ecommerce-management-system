"""时间序列化工具。

前端（dayjs / new Date / 本项目 formatDateTime）普遍把「不带时区后缀」的时间字符串
当作「本地时间」解析。而数据库里存储的日期时间实际是 UTC（服务端 now() 使用
timezone.utc）。两者不一致会导致非 UTC 时区的浏览器显示的时间偏移数小时。

因此对外输出的 datetime 必须带 UTC 标记（.+00:00 / Z），让所有客户端统一按 UTC 解析，
再由客户端按本地时区展示。
"""
from datetime import datetime, timezone
from typing import Optional


def iso_utc(dt: Optional[datetime]) -> Optional[str]:
    """把 datetime 序列化为带 UTC 时区标记的 ISO 字符串。

    - None 直接返回 None
    - 已是 tz-aware：原样 isoformat（UTC 下为 +00:00）
    - naive（库里按 UTC 存储）：补上 UTC 再 isoformat
    """
    if dt is None:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.isoformat()
