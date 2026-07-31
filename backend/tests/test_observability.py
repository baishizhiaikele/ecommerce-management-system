"""可观测性告警深化（P2 工程债 / PLAN 未做项 tracing·告警看板）。

验证：
- GET /health 返回 status（ok|degraded|unavailable）、components 含 database/cache、alerts 列表。
- GET /metrics 暴露进程资源指标（process_cpu_percent / process_memory_rss_bytes /
  process_memory_percent）与业务计数器（business_*_total）。
"""
import pytest

from app.core.config import settings


@pytest.mark.asyncio
async def test_health_structure(client):
    r = await client.get(f"{settings.API_V1_PREFIX}/health")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["service"] == "ai-shop"
    assert body["status"] in ("ok", "degraded", "unavailable")
    assert "database" in body["components"]
    assert "cache" in body["components"]
    assert isinstance(body["alerts"], list)


@pytest.mark.asyncio
async def test_metrics_exposes_resource_and_business(client):
    r = await client.get("/metrics")
    assert r.status_code == 200, r.text
    text = r.text
    # 进程资源指标
    assert "process_cpu_percent" in text
    assert "process_memory_rss_bytes" in text
    assert "process_memory_percent" in text
    # 业务计数器标签存在（值可为 0）
    for name in (
        "business_orders_created_total",
        "business_payments_succeeded_total",
        "business_payments_refunded_total",
        "business_webhook_signature_failures_total",
        "business_marketing_groups_created_total",
        "business_marketing_bargains_created_total",
    ):
        assert name in text
