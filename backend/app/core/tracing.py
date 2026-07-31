"""可选 OpenTelemetry 链路追踪（可观测性接外部 APM，P2 收尾）。

设计原则（与项目其它外部依赖一致：零密钥/零依赖降级）：
- 仅当 settings.OTEL_ENABLED=True 且运行环境安装好 opentelemetry 依赖时，才真正初始化
  tracer 并向 OTEL_EXPORTER_OTLP_ENDPOINT（如 Jaeger/Collector，OTLP gRPC 4317）上报。
- 依赖缺失或开关关闭时，本模块完全降级为 no-op，不引入任何第三方 import 副作用，
  保证本地开发与 CI 测试无需安装 opentelemetry 即可运行。
- 业务代码通过 get_tracer() 获取 tracer；未启用时返回 None，调用方自行跳过即可。
"""
from __future__ import annotations

import logging

from starlette.middleware.base import BaseHTTPMiddleware

from app.core.config import settings

logger = logging.getLogger(__name__)

_tracer = None
_initialized = False


def _try_init() -> bool:
    """惰性初始化 OTel。成功返回 True；缺依赖/未启用返回 False。"""
    global _tracer, _initialized
    if _initialized:
        return _tracer is not None
    _initialized = True
    if not settings.OTEL_ENABLED:
        return False
    endpoint = settings.OTEL_EXPORTER_OTLP_ENDPOINT
    if not endpoint:
        logger.warning("OTEL_ENABLED=true 但未配置 OTEL_EXPORTER_OTLP_ENDPOINT，跳过 tracing 初始化")
        return False
    try:
        from opentelemetry import trace
        from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter
        from opentelemetry.sdk.resources import Resource
        from opentelemetry.sdk.trace import TracerProvider
        from opentelemetry.sdk.trace.export import BatchSpanProcessor
        from opentelemetry.semconv.resource import ResourceAttributes

        headers = {}
        if settings.OTEL_EXPORTER_OTLP_HEADERS:
            for kv in settings.OTEL_EXPORTER_OTLP_HEADERS.split(","):
                if "=" in kv:
                    k, v = kv.split("=", 1)
                    headers[k.strip()] = v.strip()

        resource = Resource.create(
            {ResourceAttributes.SERVICE_NAME: settings.OTEL_SERVICE_NAME}
        )
        provider = TracerProvider(resource=resource, sampler=_build_sampler())
        provider.add_span_processor(
            BatchSpanProcessor(OTLPSpanExporter(endpoint=endpoint, headers=headers or None))
        )
        trace.set_tracer_provider(provider)
        _tracer = trace.get_tracer(settings.OTEL_SERVICE_NAME)
        logger.info("OpenTelemetry tracing 已启用，上报至 %s", endpoint)
        return True
    except Exception as e:  # 依赖未装等
        logger.warning("OpenTelemetry 初始化失败，tracing 降级为 no-op：%s", e)
        return False


def _build_sampler():
    try:
        from opentelemetry.sdk.trace.sampling import TraceIdRatioBased

        return TraceIdRatioBased(settings.OTEL_TRACES_SAMPLER_ARG)
    except Exception:
        return None  # 使用默认全采


def _otel_headers() -> dict:
    headers = {}
    if settings.OTEL_EXPORTER_OTLP_HEADERS:
        for kv in settings.OTEL_EXPORTER_OTLP_HEADERS.split(","):
            if "=" in kv:
                k, v = kv.split("=", 1)
                headers[k.strip()] = v.strip()
    return headers


def get_tracer():
    """返回 tracer；未启用时返回 None。"""
    if _try_init():
        return _tracer
    return None


def export_metrics_otlp() -> bool:
    """把进程内 /metrics 快照以 OTLP 指标形式推送到 APM（如 Prometheus/Collector）。

    仅当 OTEL_ENABLED 且依赖齐全时生效；否则返回 False（无副作用，不抛异常）。
    当前把业务计数器与关键资源指标转为 OTLP 数值指标，便于在 Grafana 等面板统一观测。
    """
    if not settings.OTEL_ENABLED:
        return False
    endpoint = settings.OTEL_EXPORTER_OTLP_ENDPOINT
    if not endpoint:
        return False
    try:
        from opentelemetry import metrics
        from opentelemetry.exporter.otlp.proto.grpc.metric_exporter import OTLPMetricExporter
        from opentelemetry.sdk.metrics import MeterProvider
        from opentelemetry.sdk.metrics.export import PeriodicExportingMetricReader

        from app.core import metrics as local_metrics

        reader = PeriodicExportingMetricReader(
            OTLPMetricExporter(endpoint=endpoint, headers=_otel_headers() or None)
        )
        provider = MeterProvider(metric_readers=[reader])
        metrics.set_meter_provider(provider)
        meter = metrics.get_meter(settings.OTEL_SERVICE_NAME)

        snap = local_metrics._metrics  # 读取内部快照
        for name in local_metrics._BUSINESS_COUNTERS:
            meter.create_counter(f"business_{name}_total").add(
                int(snap["business"].get(name, 0))
            )
        res = snap["resource"]
        meter.create_up_down_counter("process_cpu_percent").add(int(res["cpu_percent"]))
        meter.create_up_down_counter("process_memory_rss_bytes").add(int(res["memory_rss_bytes"]))
        return True
    except Exception as e:
        logger.warning("OTLP 指标导出失败（降级忽略）：%s", e)
        return False


class TracingMiddleware(BaseHTTPMiddleware):
    """为每个请求创建一个 span（方法 + 路径模板 + 状态码），便于 APM 下钻。"""

    async def dispatch(self, request, call_next):
        tracer = get_tracer()
        if tracer is None:
            return await call_next(request)
        route = request.url.path
        try:
            route = request.app.url_path_for(request.scope["route"].name)  # type: ignore[attr-defined]
        except Exception:
            pass
        with tracer.start_as_current_span(f"{request.method} {route}") as span:
            span.set_attribute("http.method", request.method)
            span.set_attribute("http.route", str(route))
            response = await call_next(request)
            span.set_attribute("http.status_code", response.status_code)
            return response
