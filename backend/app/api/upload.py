import asyncio
import os
import uuid

from fastapi import APIRouter, Depends, File, HTTPException, status, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.upload import UploadOut

router = APIRouter(prefix="/upload", tags=["upload"])

UPLOAD_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "uploads")
ALLOWED_CONTENT_TYPES = {"image/jpeg", "image/png", "image/gif", "image/webp"}
ALLOWED_EXT = {"jpg", "jpeg", "png", "gif", "webp"}
# 常见图片格式的魔数（文件头），用于校验真实文件类型（P7）
_MAGIC_BYTES = {
    b"\xff\xd8\xff": "jpg",
    b"\x89PNG\r\n\x1a\n": "png",
    b"GIF87a": "gif",
    b"GIF89a": "gif",
}
MAX_SIZE = 5 * 1024 * 1024  # 5MB

# 视频上传（工单附件支持视频）
VIDEO_CONTENT_TYPES = {
    "video/mp4",
    "video/webm",
    "video/quicktime",
    "video/x-msvideo",
    "video/x-matroska",
}
VIDEO_EXT = {"mp4", "webm", "mov", "avi", "mkv"}
MAX_VIDEO_SIZE = 50 * 1024 * 1024  # 50MB

os.makedirs(UPLOAD_DIR, exist_ok=True)


def _validate_magic(data: bytes) -> str | None:
    """根据文件头魔数识别真实类型，规避仅靠扩展名/Content-Type 的伪造（P7）。"""
    if data.startswith(b"RIFF") and data[8:12] == b"WEBP":
        return "webp"
    for magic, ext in _MAGIC_BYTES.items():
        if data.startswith(magic):
            return ext
    return None


def _write_file(path: str, data: bytes) -> None:
    with open(path, "wb") as f:
        f.write(data)


def _optimize(path: str, ext: str) -> None:
    """上传后无损/有损压缩（P1-13）。缺乏 Pillow 或动图(gif)时跳过，安全降级。"""
    if ext in ("gif",):
        return
    try:
        from PIL import Image
    except Exception:
        return
    try:
        with Image.open(path) as im:
            if ext in ("jpg", "jpeg"):
                im.convert("RGB").save(path, "JPEG", quality=82, optimize=True)
            elif ext == "png":
                im.save(path, "PNG", optimize=True)
            elif ext == "webp":
                im.save(path, "WEBP", quality=82)
    except Exception:
        return


@router.post("/image", response_model=UploadOut)
async def upload_image(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> UploadOut:
    content_type = (file.content_type or "").lower()
    if content_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="仅支持 jpg/png/gif/webp 图片",
        )
    data = await file.read()
    if len(data) > MAX_SIZE:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="图片大小不能超过 5MB")

    # P7：校验真实文件类型（魔数），防止上传伪装成图片的可执行文件
    real_ext = _validate_magic(data)
    if real_ext is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="文件内容并非合法图片",
        )
    ext = real_ext if real_ext in ALLOWED_EXT else "jpg"

    filename = f"{uuid.uuid4().hex}.{ext}"
    save_path = os.path.join(UPLOAD_DIR, filename)
    # P4：文件写入放到线程池，避免阻塞事件循环
    await asyncio.to_thread(_write_file, save_path, data)
    # P1-13：写入后压缩（同样放到线程池，避免阻塞）
    await asyncio.to_thread(_optimize, save_path, ext)
    return UploadOut(url=f"/uploads/{filename}", filename=filename)


def _validate_video_magic(data: bytes) -> str | None:
    """根据文件头魔数识别真实视频类型，规避仅靠扩展名/Content-Type 的伪造（P7）。"""
    # MP4 / MOV：偏移 4 处为 "ftyp"
    if len(data) > 12 and data[4:8] == b"ftyp":
        return "mov" if data[8:12] == b"qt  " else "mp4"
    # WebM / MKV：EBML 头
    if data.startswith(b"\x1a\x45\xdf\xa3"):
        return "webm"
    # AVI：RIFF....AVI
    if data.startswith(b"RIFF") and len(data) > 12 and data[8:12] == b"AVI ":
        return "avi"
    return None


@router.post("/video", response_model=UploadOut)
async def upload_video(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> UploadOut:
    content_type = (file.content_type or "").lower()
    if content_type not in VIDEO_CONTENT_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="仅支持 mp4/webm/mov/avi/mkv 视频",
        )
    data = await file.read()
    if len(data) > MAX_VIDEO_SIZE:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="视频大小不能超过 50MB")

    # P7：校验真实文件类型（魔数），防止上传伪装成视频的可执行文件
    real_ext = _validate_video_magic(data)
    if real_ext is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="文件内容并非合法视频",
        )
    ext = real_ext if real_ext in VIDEO_EXT else "mp4"

    filename = f"{uuid.uuid4().hex}.{ext}"
    save_path = os.path.join(UPLOAD_DIR, filename)
    # P4：文件写入放到线程池，避免阻塞事件循环
    await asyncio.to_thread(_write_file, save_path, data)
    return UploadOut(url=f"/uploads/{filename}", filename=filename)
