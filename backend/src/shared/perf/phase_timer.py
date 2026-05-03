"""Per-request phase timing for end-to-end performance visibility.

Phases accumulate in a contextvar that lives for the duration of a single
request. The HTTP middleware reads the accumulated phases after the route
handler returns and emits them as a W3C ``Server-Timing`` header.

Usage::

    with phase_timer("topology_resolve"):
        ...
    with phase_timer("query"):
        ...

Each phase also opens an OpenTelemetry child span under the active request
span, so phases appear in Tempo without extra wiring.
"""
import time
from contextlib import contextmanager
from contextvars import ContextVar
from typing import List, Optional, Tuple

from opentelemetry import trace

_phases: ContextVar[Optional[List[Tuple[str, float]]]] = ContextVar(
    "_perf_phases", default=None
)

_tracer = trace.get_tracer("grid-backend.perf")


def reset_phases() -> None:
    """Initialize a fresh phase list for the current request context."""
    _phases.set([])


def current_phases() -> List[Tuple[str, float]]:
    """Return all phases recorded so far in this context."""
    return _phases.get() or []


def record_phase(name: str, duration_ms: float) -> None:
    """Append a phase result without using the context manager.

    Used when an external timer (e.g. the DuckDB adapter's split timing)
    has already measured the duration and just needs to publish it.
    """
    phases = _phases.get()
    if phases is None:
        return
    phases.append((name, duration_ms))


@contextmanager
def phase_timer(name: str):
    """Time a block and append the result to the request's phase list."""
    with _tracer.start_as_current_span(f"phase.{name}"):
        t0 = time.perf_counter()
        try:
            yield
        finally:
            record_phase(name, (time.perf_counter() - t0) * 1000)


def dump_server_timing() -> str:
    """Format the recorded phases as a W3C Server-Timing header value.

    Same-named phases are summed (their durations aggregate) while preserving
    first-seen order. Returns an empty string if no phases were recorded.
    """
    phases = current_phases()
    if not phases:
        return ""
    seen: dict[str, float] = {}
    order: list[str] = []
    for name, dur in phases:
        if name not in seen:
            order.append(name)
            seen[name] = 0.0
        seen[name] += dur
    parts = []
    for name in order:
        token = "".join(c if c.isalnum() or c in "_-" else "_" for c in name)
        parts.append(f"{token};dur={seen[name]:.2f}")
    return ", ".join(parts)
