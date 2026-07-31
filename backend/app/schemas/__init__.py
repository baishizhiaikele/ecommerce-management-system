"""统一导出所有 schema，与 app.models 的聚合导出风格保持一致。

采用动态扫描，避免手写类名拼写错误导致应用启动失败；
仅导出公开命名（不以 _ 开头）的 pydantic BaseModel 子类。
"""
from importlib import import_module
from pkgutil import iter_modules
from pydantic import BaseModel

import app.schemas as _pkg

__all__: list[str] = []
_seen = set()

for _modinfo in iter_modules(_pkg.__path__):
    _name = _modinfo.name
    if _name.startswith("_"):
        continue
    try:
        _mod = import_module(f"app.schemas.{_name}")
    except Exception:  # pragma: no cover - 单个 schema 模块加载失败时不影响整体
        continue
    for _attr in dir(_mod):
        if _attr.startswith("_"):
            continue
        _obj = getattr(_mod, _attr)
        if (
            isinstance(_obj, type)
            and issubclass(_obj, BaseModel)
            and _obj is not BaseModel
            and _attr not in _seen
        ):
            globals()[_attr] = _obj
            __all__.append(_attr)
            _seen.add(_attr)
