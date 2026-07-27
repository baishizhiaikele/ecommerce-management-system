"""可观测性：进程内请求指标（P2 工程）。

轻量 Prometheus 风格指标：累计请求数、按路径 / 状态码分布、平均耗时。
生产可替换为 Prometheus Client 或外接 APM；当前实现零额外依赖、可随 /metrics 暴露。
"""
from __future__ import annotations

import time
from collections import defaultdict

from starlette.middleware.base import BaseHTTPMiddleware


_metrics: dict = {
    "requests_total": 0,
    "by_path": defaultdict(int),
    "by_status": defaultdict(int),
    "latency_sum": 0.0,
}


class MetricsMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        start = time.perf_counter()
        response = await call_next(request)
        _metrics["requests_total"] += 1
        _metrics["by_path"][request.url.path] += 1
        _metrics["by_status"][response.status_code] += 1
        _metrics["latency_sum"] += time.perf_counter() - start
        return response


def render() -> str:
    total = _metrics["requests_total"]
    lines = [f"http_requests_total {total}"]
    for path, count in _metrics["by_path"].items():
        lines.append(f'http_requests_by_path{{path="{path}"}} {count}')
    for code, count in _metrics["by_status"].items():
        lines.append(f'http_responses_by_status{{code="{code}"}} {count}')
    avg = (_metrics["latency_sum"] / total) if total else 0.0
    lines.append(f"http_request_latency_avg_seconds {avg:.6f}")
    return "\n".join(lines) + "\n"
