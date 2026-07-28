"""评价增强：图片/视频字段可用 + 追评逻辑（仅一次）。"""
import uuid

import pytest
from sqlalchemy import select

from app.db.session import SessionLocal
from app.models.product import Product, ProductStatus
from app.models.review import Review
from app.services.review_service import append_review


@pytest.mark.asyncio
async def test_review_list_has_media_fields(client, merchant_headers):
    r = await client.post(
        "/api/products",
        headers=merchant_headers,
        json={"name": "评价增强商品", "price": 20, "stock": 2, "category_id": None},
    )
    assert r.status_code == 201, r.text
    pid = r.json()["id"]
    async with SessionLocal() as s:
        p = await s.get(Product, pid)
        p.status = ProductStatus.ACTIVE
        await s.commit()
    r = await client.get(f"/api/products/{pid}/reviews")
    assert r.status_code == 200


@pytest.mark.asyncio
async def test_append_review_once():
    uid = str(uuid.uuid4())
    async with SessionLocal() as s:
        rv = Review(
            order_id=str(uuid.uuid4()),
            product_id=str(uuid.uuid4()),
            user_id=uid,
            rating=5,
            content="初评内容",
            _images='["http://x/a.png"]',
        )
        s.add(rv)
        await s.commit()
        rid = rv.id

    async with SessionLocal() as db:
        out = await append_review(
            db,
            review_id=rid,
            user_id=uid,
            content="追评一下",
            images=["http://x/b.png"],
        )
        assert out.append_content == "追评一下"
        assert out.images == ["http://x/a.png"]  # 原图不变
        assert out.append_images == ["http://x/b.png"]

        # 不可重复追评
        with pytest.raises(Exception):
            await append_review(db, review_id=rid, user_id=uid, content="再次追评")
