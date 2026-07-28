"""子账号（商家员工）业务服务。"""
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.security import hash_password
from app.models.staff import PERMISSION_LABELS, STAFF_PERMISSIONS, SubAccount
from app.models.user import Role, User


def _validate_perms(permissions: list[str]) -> list[str]:
    valid = [p for p in permissions if p in STAFF_PERMISSIONS]
    # 去重保序
    seen = set()
    out = []
    for p in valid:
        if p not in seen:
            seen.add(p)
            out.append(p)
    return out


async def create_subaccount(
    db: AsyncSession,
    owner: User,
    username: str,
    password: str,
    permissions: list[str],
) -> SubAccount:
    if not username or len(username) < 3:
        raise ValueError("子账号用户名至少 3 个字符")
    if not password or len(password) < 6:
        raise ValueError("子账号密码至少 6 个字符")

    exists = await db.scalar(select(User).where(User.username == username))
    if exists:
        raise ValueError("该用户名已被占用")

    staff = User(
        username=username,
        email=f"{username}@staff.local",
        hashed_password=hash_password(password),
        role=Role.MERCHANT,
    )
    db.add(staff)
    await db.flush()

    sub = SubAccount(
        owner_id=owner.id,
        staff_user_id=staff.id,
        permissions=",".join(_validate_perms(permissions)),
        is_active=True,
    )
    db.add(sub)
    await db.commit()
    await db.refresh(sub)
    return sub


async def list_for_owner(db: AsyncSession, owner_id: str) -> list[SubAccount]:
    rows = await db.scalars(
        select(SubAccount)
        .options(selectinload(SubAccount.staff))
        .where(SubAccount.owner_id == owner_id)
        .order_by(SubAccount.created_at.desc())
    )
    return list(rows)


async def get_one(db: AsyncSession, owner_id: str, sub_id: str) -> SubAccount | None:
    return await db.scalar(
        select(SubAccount).where(
            SubAccount.id == sub_id, SubAccount.owner_id == owner_id
        )
    )


async def update_subaccount(
    db: AsyncSession,
    sub: SubAccount,
    permissions: list[str] | None = None,
    is_active: bool | None = None,
) -> SubAccount:
    if permissions is not None:
        sub.permissions = ",".join(_validate_perms(permissions))
    if is_active is not None:
        sub.is_active = is_active
    await db.commit()
    await db.refresh(sub)
    return sub


async def delete_subaccount(db: AsyncSession, sub: SubAccount) -> None:
    # 同时禁用对应的员工登录用户，避免孤儿账号
    staff = await db.get(User, sub.staff_user_id)
    if staff:
        staff.is_active = False
    await db.delete(sub)
    await db.commit()


async def resolve_owner(db: AsyncSession, staff_user_id: str) -> tuple[str, list[str]] | None:
    """根据登录用户解析其归属商家与权限列表；非子账号返回 None。"""
    sub = await db.scalar(
        select(SubAccount).where(
            SubAccount.staff_user_id == staff_user_id, SubAccount.is_active == True  # noqa: E712
        )
    )
    if not sub:
        return None
    perms = sub.permissions.split(",") if sub.permissions else []
    return sub.owner_id, perms


def permission_label(key: str) -> str:
    return PERMISSION_LABELS.get(key, key)
