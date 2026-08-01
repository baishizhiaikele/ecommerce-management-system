"""T15 并发下单压测：验证库存扣减的并发正确性（超卖检测）与下单吞吐。

关注两件事：
  1) 正确性（最重要）：N 个并发买家抢购库存为 S 的商品，成功下单数必须 == min(N, S)，
     且商品剩余库存必须 == max(0, S - N)。任何超卖都判定失败。
  2) 性能：统计 checkout 接口的成功率、QPS 与 P50/P95/P99 延迟。

买家账号与访问令牌直接在数据库侧准备并本地签发 JWT，绕过 /auth/register 的
5/minute 限流（该限流是有意的安全策略，压测不应关闭它）。

用法：
    # 1. 起后端（建议 docker compose up -d 使用 PostgreSQL + Redis）
    # 2. 运行压测（脚本从 backend 目录导入 app 包）
    cd backend
    python scripts/loadtest_checkout.py --concurrency 50 --stock 20

参数：
    --base          后端 API 根地址，默认 http://127.0.0.1:8000/api
    --concurrency   并发买家数量
    --stock         压测商品的目标库存
    --keep          压测后保留临时买家与订单（默认清理买家的购物车残留）

注意：脚本会写入数据库（创建临时买家、改写目标商品库存），
      仅可在本地/演示环境运行，不要对生产库执行。
"""

from __future__ import annotations

import argparse
import asyncio
import os
import statistics
import sys
import time
import uuid
from pathlib import Path

import httpx

# 允许以 `python scripts/loadtest_checkout.py` 从 backend 目录直接运行
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import select, update  # noqa: E402

from app.core.security import create_access_token, hash_password  # noqa: E402
from app.db.session import SessionLocal  # noqa: E402
from app.models.product import Product, ProductStatus  # noqa: E402
from app.models.user import Role, User  # noqa: E402


class LoadTestError(RuntimeError):
    """压测前置条件不满足（无法继续）。"""


async def prepare_buyers(count: int, run_id: str) -> list[str]:
    """在库内批量创建临时买家，返回可直接使用的 access token 列表。"""
    tokens: list[str] = []
    # 所有临时账号共用同一个密码哈希，避免 N 次 bcrypt 拖慢准备阶段
    shared_hash = hash_password("Loadtest#123")
    async with SessionLocal() as db:
        for i in range(count):
            username = f"load_{run_id}_{i}"
            user = User(
                username=username,
                email=f"{username}@loadtest.local",
                hashed_password=shared_hash,
                role=Role.BUYER,
            )
            db.add(user)
            await db.flush()
            tokens.append(create_access_token(user.id, user.role.value))
        await db.commit()
    return tokens


async def pick_product_and_reset_stock(stock: int) -> tuple[str, str, int]:
    """选一个上架商品并把库存重置为 stock，返回 (id, name, 实际库存)。"""
    async with SessionLocal() as db:
        product = await db.scalar(
            select(Product).where(Product.status == ProductStatus.ACTIVE).limit(1)
        )
        if product is None:
            raise LoadTestError("没有可购买的上架商品，请先执行演示数据种子（SEED_DEMO=true）")
        pid, pname = product.id, product.name
        await db.execute(update(Product).where(Product.id == pid).values(stock=stock))
        await db.commit()
    return pid, pname, stock


async def read_stock(product_id: str) -> int:
    async with SessionLocal() as db:
        product = await db.get(Product, product_id)
        return int(product.stock or 0) if product else 0


async def cleanup_buyers(run_id: str) -> int:
    """删除本轮创建的临时买家（订单/购物车由级联或残留数据保留，便于排查）。"""
    async with SessionLocal() as db:
        users = (
            await db.scalars(select(User).where(User.username.like(f"load_{run_id}_%")))
        ).all()
        for user in users:
            await db.delete(user)
        await db.commit()
        return len(users)


async def one_buyer_checkout(
    client: httpx.AsyncClient, token: str, product_id: str, barrier: asyncio.Barrier
) -> tuple[bool, float, str]:
    """单个买家：加购 -> 栅栏同步 -> 同时发起 checkout。返回 (是否成功, 耗时秒, 备注)。"""
    headers = {"Authorization": f"Bearer {token}"}
    try:
        add = await client.post(
            "/cart/items", json={"product_id": product_id, "quantity": 1}, headers=headers
        )
    except httpx.HTTPError as exc:
        return False, 0.0, f"加购异常 {type(exc).__name__}"
    if add.status_code not in (200, 201):
        return False, 0.0, f"加购失败 HTTP {add.status_code}"

    # 栅栏保证所有买家几乎同一时刻发起下单，最大化并发冲突
    await barrier.wait()

    started = time.perf_counter()
    try:
        resp = await client.post(
            "/orders/checkout", json={"address": "压测地址 1 号"}, headers=headers
        )
    except httpx.HTTPError as exc:
        return False, time.perf_counter() - started, f"下单异常 {type(exc).__name__}"
    elapsed = time.perf_counter() - started

    if resp.status_code in (200, 201):
        return True, elapsed, "ok"
    # 库存不足属于预期内的正确拒绝
    return False, elapsed, f"HTTP {resp.status_code} {resp.text[:80]}"


def percentile(values: list[float], pct: float) -> float:
    if not values:
        return 0.0
    ordered = sorted(values)
    idx = min(len(ordered) - 1, int(round(pct / 100 * (len(ordered) - 1))))
    return ordered[idx]


async def run(args: argparse.Namespace) -> int:
    run_id = uuid.uuid4().hex[:6]

    product_id, product_name, stock_before = await pick_product_and_reset_stock(args.stock)
    print(f"目标商品 : {product_name} ({product_id})")
    print(f"压测前库存: {stock_before}，并发买家: {args.concurrency}")

    print("准备临时买家账号 ...")
    tokens = await prepare_buyers(args.concurrency, run_id)

    limits = httpx.Limits(
        max_connections=args.concurrency + 10, max_keepalive_connections=args.concurrency + 10
    )
    async with httpx.AsyncClient(base_url=args.base, timeout=60, limits=limits) as client:
        try:
            probe = await client.get("/products")
            probe.raise_for_status()
        except httpx.HTTPError as exc:
            raise LoadTestError(f"后端不可达（{args.base}）：{exc}") from exc

        barrier = asyncio.Barrier(args.concurrency)
        wall_start = time.perf_counter()
        results = await asyncio.gather(
            *[one_buyer_checkout(client, t, product_id, barrier) for t in tokens]
        )
        wall_elapsed = time.perf_counter() - wall_start

    succeeded = [r for r in results if r[0]]
    failed = [r for r in results if not r[0]]
    latencies = [r[1] for r in results if r[1] > 0]
    stock_after = await read_stock(product_id)

    expected_success = min(args.concurrency, stock_before)
    expected_stock = max(0, stock_before - args.concurrency)

    print("\n===== 结果 =====")
    print(f"总耗时       : {wall_elapsed:.3f}s")
    print(f"成功下单     : {len(succeeded)}  (期望 {expected_success})")
    print(f"被拒绝       : {len(failed)}")
    print(f"剩余库存     : {stock_after}  (期望 {expected_stock})")
    if latencies:
        print(f"QPS          : {len(latencies) / wall_elapsed:.1f}")
        print(f"平均延迟     : {statistics.mean(latencies) * 1000:.1f} ms")
        print(
            "P50/P95/P99  : "
            f"{percentile(latencies, 50) * 1000:.1f} / "
            f"{percentile(latencies, 95) * 1000:.1f} / "
            f"{percentile(latencies, 99) * 1000:.1f} ms"
        )

    if failed:
        reasons: dict[str, int] = {}
        for _, _, note in failed:
            reasons[note] = reasons.get(note, 0) + 1
        print("\n失败原因分布:")
        for note, count in sorted(reasons.items(), key=lambda kv: -kv[1])[:5]:
            print(f"  {count:>4}  {note}")

    if not args.keep:
        removed = await cleanup_buyers(run_id)
        print(f"\n已清理临时买家: {removed}")

    oversold = len(succeeded) > expected_success or stock_after < expected_stock
    print("\n===== 判定 =====")
    if oversold:
        print("❌ 检测到超卖：并发库存扣减存在竞态，需要行级锁（SELECT ... FOR UPDATE）或乐观锁重试。")
        return 1
    print("✅ 无超卖：并发下单库存扣减正确。")
    return 0


def main() -> None:
    parser = argparse.ArgumentParser(description="并发下单压测（超卖检测 + 延迟统计）")
    parser.add_argument("--base", default=os.getenv("LOADTEST_BASE", "http://127.0.0.1:8000/api"))
    parser.add_argument("--concurrency", type=int, default=50)
    parser.add_argument("--stock", type=int, default=20)
    parser.add_argument("--keep", action="store_true", help="保留临时买家账号")
    args = parser.parse_args()

    try:
        sys.exit(asyncio.run(run(args)))
    except LoadTestError as exc:
        print(f"前置条件不满足: {exc}")
        sys.exit(2)


if __name__ == "__main__":
    main()
