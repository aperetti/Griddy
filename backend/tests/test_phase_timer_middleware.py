"""Verify contextvar phase timing propagates through FastAPI middleware."""
import time
from fastapi import FastAPI
from fastapi.testclient import TestClient

from src.shared.perf import (
    dump_server_timing,
    phase_timer,
    record_phase,
    reset_phases,
)


def _build_app():
    app = FastAPI()

    @app.middleware("http")
    async def phases_mw(request, call_next):
        reset_phases()
        response = await call_next(request)
        st = dump_server_timing()
        if st:
            response.headers["Server-Timing"] = st
        return response

    @app.get("/work")
    def work():
        with phase_timer("alpha"):
            time.sleep(0.005)
        record_phase("beta", 7.0)
        with phase_timer("alpha"):
            time.sleep(0.003)
        return {"ok": True}

    return app


def test_server_timing_header_aggregates_phases():
    client = TestClient(_build_app())
    r = client.get("/work")
    assert r.status_code == 200
    header = r.headers.get("Server-Timing")
    assert header is not None, "Server-Timing header missing"
    # Both alpha calls should be summed; beta should appear once at 7.00ms.
    assert "alpha;dur=" in header
    assert "beta;dur=7.00" in header
    # Order is first-seen.
    assert header.index("alpha") < header.index("beta")


def test_phase_timer_is_noop_outside_request_context():
    """record_phase outside a reset_phases() scope must not crash."""
    # Brand-new context (no reset). The contextvar default is None.
    record_phase("orphan", 1.0)
    with phase_timer("orphan2"):
        pass
    # No crash, dump returns empty when no list initialized.
    assert dump_server_timing() == ""
