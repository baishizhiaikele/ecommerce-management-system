import pytest


@pytest.mark.asyncio
async def test_admin_dashboard_has_rfm(client, admin_headers):
    r = await client.get("/api/admin/dashboard/analytics", headers=admin_headers)
    assert r.status_code == 200, r.text
    body = r.json()
    assert "rfm" in body
    assert "repurchase_rate" in body
    assert "buyers" in body
    assert isinstance(body["rfm"], list)
    if body["rfm"]:
        seg = body["rfm"][0]
        assert "segment" in seg and "customers" in seg


@pytest.mark.asyncio
async def test_merchant_dashboard_has_rfm(client, merchant_headers):
    r = await client.get("/api/merchant/dashboard/analytics", headers=merchant_headers)
    assert r.status_code == 200, r.text
    data = r.json()
    assert "rfm" in data
    assert "repurchase_rate" in data
    assert "sales_trend" in data
    assert "top_products" in data


@pytest.mark.asyncio
async def test_metrics_endpoint(client):
    r = await client.get("/metrics")
    assert r.status_code == 200
    assert "http_requests_total" in r.text
