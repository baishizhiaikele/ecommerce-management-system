"""可观测性：进程内请求指标（P2 工程）。

轻量 Prometheus 风格指标：累计请求数、按路径 / 状态码分布、平均耗时，
以及关键业务计数器（支付成功、退款、订单创建、营销活动）与进程资源指标。
生产可替换为 Prometheus Client 或外接 APM；当前实现零硬依赖、可随 /metrics 暴露。
资源采样优先用 psutil，缺失时降级为标准库（Windows 用 ctypes 读工作集）。
"""
from __future__ import annotations

import platform
import time
from collections import defaultdict

from starlette.middleware.base import BaseHTTPMiddleware


_metrics: dict = {
    "requests_total": 0,
    "by_path": defaultdict(int),
    "by_status": defaultdict(int),
    "latency_sum": 0.0,
    # 延迟直方图（P2 接外部 APM）：固定桶，便于 Prometheus/OTLP 直采
    "latency_hist": {b: 0 for b in (0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0)},
    # 业务计数器（P0/P2 可观测性深化）：随核心流程埋点，便于监控告警
    "business": defaultdict(int),
    # 进程资源快照（告警用）
    "resource": {"cpu_percent": 0.0, "memory_rss_bytes": 0, "memory_percent": 0.0},
}

_LATENCY_BUCKETS = (0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0)


# 业务计数器合法键（防止埋点拼写漂移）
_BUSINESS_COUNTERS = (
    "orders_created",
    "payments_succeeded",
    "payments_refunded",
    "marketing_groups_created",
    "marketing_bargains_created",
    "webhook_signature_failures",
)

# 告警阈值（可经配置覆盖；此处用模块级常量保持零依赖）
ALERT_WEBHOOK_FAIL_THRESHOLD = 20          # 累计验签失败超过即告警
ALERT_MEMORY_PERCENT_THRESHOLD = 85.0      # 进程内存占比（相对系统）超阈值告警
ALERT_CPU_PERCENT_THRESHOLD = 90.0         # 单进程 CPU 占比超阈值告警


def _sample_resource() -> None:
    """采样进程资源占用；优先 psutil，缺失则降级标准库。失败静默。"""
    try:
        try:
            import psutil  # 可选依赖

            proc = psutil.Process()
            _metrics["resource"]["cpu_percent"] = round(proc.cpu_percent(interval=None), 2)
            _metrics["resource"]["memory_rss_bytes"] = int(proc.memory_info().rss)
            _metrics["resource"]["memory_percent"] = round(proc.memory_percent(), 2)
            return
        except ImportError:
            pass
        # 降级：标准库
        if platform.system() == "Windows":
            try:
                import ctypes

                class _PROCMEM(ctypes.Structure):
                    _fields_ = [
                        ("cb", ctypes.c_ulong),
                        ("PageFaultCount", ctypes.c_ulong),
                        ("PeakWorkingSetSize", ctypes.c_size_t),
                        ("WorkingSetSize", ctypes.c_size_t),
                        ("QuotaPeakPagedPoolUsage", ctypes.c_size_t),
                        ("QuotaPagedPoolUsage", ctypes.c_size_t),
                        ("QuotaPeakNonPagedPoolUsage", ctypes.c_size_t),
                        ("QuotaNonPagedPoolUsage", ctypes.c_size_t),
                        ("PagefileUsage", ctypes.c_size_t),
                        ("PeakPagefileUsage", ctypes.c_size_t),
                        ("PrivateUsage", ctypes.c_size_t),
                    ]

                mem = _PROCMEM()
                mem.cb = ctypes.sizeof(_PROCMEM)
                ctypes.windll.psapi.GetProcessMemoryInfo(
                    ctypes.windll.kernel32.GetCurrentProcess(), ctypes.byref(mem), ctypes.sizeof(mem)
                )
                _metrics["resource"]["memory_rss_bytes"] = int(mem.WorkingSetSize)
            except Exception:  # noqa: BLE001
                pass
        else:
            try:
                import resource

                _metrics["resource"]["memory_rss_bytes"] = int(resource.getrusage(resource.RUSAGE_SELF).ru_maxrss) * 1024
            except Exception:  # noqa: BLE001
                pass
    except Exception:  # noqa: BLE001
        pass


def collect_alerts() -> list[dict]:
    """基于业务计数器与资源快照计算告警列表（供 /health 暴露）。"""
    _sample_resource()
    res = _metrics["resource"]
    biz = _metrics["business"]
    alerts: list[dict] = []
    if biz.get("webhook_signature_failures", 0) >= ALERT_WEBHOOK_FAIL_THRESHOLD:
        alerts.append({
            "level": "warning",
            "code": "webhook_signature_failures",
            "message": f"支付回调验签失败累计 {biz['webhook_signature_failures']} 次，疑似密钥/回调被篡改",
        })
    if res["memory_percent"] >= ALERT_MEMORY_PERCENT_THRESHOLD:
        alerts.append({
            "level": "warning",
            "code": "memory_high",
            "message": f"进程内存占用 {res['memory_percent']}% 超过阈值 {ALERT_MEMORY_PERCENT_THRESHOLD}%",
        })
    if res["cpu_percent"] >= ALERT_CPU_PERCENT_THRESHOLD:
        alerts.append({
            "level": "warning",
            "code": "cpu_high",
            "message": f"进程 CPU 占用 {res['cpu_percent']}% 超过阈值 {ALERT_CPU_PERCENT_THRESHOLD}%",
        })
    return alerts


class MetricsMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        start = time.perf_counter()
        response = await call_next(request)
        _metrics["requests_total"] += 1
        _metrics["by_path"][request.url.path] += 1
        _metrics["by_status"][response.status_code] += 1
        dt = time.perf_counter() - start
        _metrics["latency_sum"] += dt
        for b in _LATENCY_BUCKETS:
            if dt <= b:
                _metrics["latency_hist"][b] += 1
                break
        return response


def inc_counter(name: str, value: int = 1) -> None:
    """业务计数器递增；未知键静默忽略（避免埋点 typo 造成噪声）。"""
    if name in _BUSINESS_COUNTERS:
        _metrics["business"][name] += value


def render() -> str:
    total = _metrics["requests_total"]
    lines = [f"http_requests_total {total}"]
    for path, count in _metrics["by_path"].items():
        lines.append(f'http_requests_by_path{{path="{path}"}} {count}')
    for code, count in _metrics["by_status"].items():
        lines.append(f'http_responses_by_status{{code="{code}"}} {count}')
    avg = (_metrics["latency_sum"] / total) if total else 0.0
    lines.append(f"http_request_latency_avg_seconds {avg:.6f}")
    cum = 0
    for b in _LATENCY_BUCKETS:
        cum += _metrics["latency_hist"][b]
        lines.append(f'http_request_latency_bucket{{le="{b}"}} {cum}')
    lines.append(f"http_request_latency_count {total}")
    for name in _BUSINESS_COUNTERS:
        lines.append(f'business_{name}_total {_metrics["business"].get(name, 0)}')
    res = _metrics["resource"]
    lines.append(f"process_cpu_percent {res['cpu_percent']}")
    lines.append(f"process_memory_rss_bytes {res['memory_rss_bytes']}")
    lines.append(f"process_memory_percent {res['memory_percent']}")
    return "\n".join(lines) + "\n"
