"""P2#12：文件存储抽象层。

将「文件写到哪里」与业务逻辑解耦：当前默认本地磁盘（LocalStorage），
容器化/多实例部署或对象存储场景可新增 S3Storage/OSSStorage 实现并切换，
无需改动 upload.py 等调用方。本地图床路径由 settings.IMAGE_BED_DIR 控制。
"""
from __future__ import annotations

import abc
import asyncio
import os

from app.core.config import settings


class StorageBackend(abc.ABC):
    """存储后端统一接口：保存二进制文件，返回可被静态服务/外链访问的相对 URL。"""

    @abc.abstractmethod
    async def save(self, data: bytes, filename: str) -> str:
        """保存文件，返回访问 URL（如 /uploads/xxx.jpg）。"""

    @abc.abstractmethod
    def resolve_path(self, filename: str) -> str:
        """由文件名解析本地磁盘绝对路径（供 StaticFiles 挂载目录使用）。"""


class LocalStorage(StorageBackend):
    """本地磁盘存储。目录由 settings.IMAGE_BED_DIR 指定，应用启动时创建。"""

    def __init__(self, base_dir: str) -> None:
        self.base_dir = base_dir
        os.makedirs(self.base_dir, exist_ok=True)

    async def save(self, data: bytes, filename: str) -> str:
        path = os.path.join(self.base_dir, filename)
        # 写入放到线程池，避免阻塞事件循环
        await asyncio.to_thread(self._write, path, data)
        return f"/uploads/{filename}"

    def resolve_path(self, filename: str) -> str:
        return os.path.join(self.base_dir, filename)

    @staticmethod
    def _write(path: str, data: bytes) -> None:
        with open(path, "wb") as f:
            f.write(data)


def get_storage() -> StorageBackend:
    """工厂方法：按配置返回存储后端。

    当前仅本地实现；接入 S3/OSS 时在此根据 settings.STORAGE_BACKEND 分流，
    例如：
        if settings.STORAGE_BACKEND == "s3":
            return S3Storage(...)
        return LocalStorage(os.path.join(settings.BASE_DIR, "uploads"))
    """
    # 与 upload.py 的 UPLOAD_DIR 保持一致，确保 /uploads 静态目录与存储路径对齐
    return LocalStorage(os.path.join(settings.BASE_DIR, "uploads"))


# 模块级单例，供 upload.py 等直接调用
storage: StorageBackend = get_storage()
