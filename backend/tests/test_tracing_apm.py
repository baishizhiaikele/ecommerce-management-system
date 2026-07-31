"""可观测性接外部 APM：未启用/缺依赖时完全降级，不阻断启动与请求。"""
import pytest

from app.core import tracing
from app.core.config import settings


def test_tracing_disabled_by_default_is_noop():
    # 默认 OTEL_ENABLED=False -> 不初始化、get_tracer 返回 None、导出 no-op
    assert settings.OTEL_ENABLED is False
    tracing._initialized = False
    tracing._tracer = None
    assert tracing.get_tracer() is None
    assert tracing.export_metrics_otlp() is False


def test_apm_config_present():
    # 配置项存在且类型正确，便于生产通过环境变量开启
    assert isinstance(settings.OTEL_ENABLED, bool)
    assert isinstance(settings.OTEL_SERVICE_NAME, str)
    assert settings.OTEL_EXPORTER_OTLP_ENDPOINT == "" or isinstance(
        settings.OTEL_EXPORTER_OTLP_ENDPOINT, str
    )


@pytest.mark.asyncio(loop_scope="session")
async def test_metrics_exposes_latency_histogram(client):
    # 触发若干请求后 /metrics 应含延迟直方图桶（指标端点在根路径 /metrics）
    await client.get("/api/v1/health")
    metrics = await client.get("/metrics")
    assert metrics.status_code == 200
    body = metrics.text
    assert "http_request_latency_bucket" in body
    assert "http_request_latency_count" in body
