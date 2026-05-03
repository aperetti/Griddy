# Consumption & Voltage Analysis — End-to-End Performance Review

**Captured:** 2026-04-30 · **Branch:** `feat/observability-as-code`
**Scope:** full request lifecycle (HTTP → topology → query → serialize → wire → JSON parse → useMemo → chart) for the consumption and voltage analysis plugins.

After the recent integer-pushdown / metadata-caching work (`61679a6`), the DuckDB query is no longer the only thing worth measuring. This review instruments every phase, runs three scenarios per analysis against the live API, and identifies the next set of high-leverage optimizations.

## How to reproduce

1. Backend running at `http://localhost:8000` with parquet readings in `cim_readings/`.
2. From repo root:
   ```
   python scripts/profile_e2e.py --runs 3
   ```
   Writes `tmp/perf-e2e-{date}.{csv,json,md}`.
3. For DuckDB-internals + EXPLAIN ANALYZE:
   ```
   python backend/profile_consumption.py
   python backend/profile_voltage.py
   ```
4. For frontend per-component timings, open the app with `?perf=1` (or set `localStorage.perf = '1'`) and check the browser console after each modal renders. Spans appear in the Performance panel as User Timing entries and as a `console.table` dump grouped by analysis.

## What got instrumented (for future runs)

| Layer | File | Mechanism |
|---|---|---|
| HTTP middleware | `backend/main.py:75-100` | Emits `Server-Timing` header per request; `Access-Control-Expose-Headers` makes it visible to JS |
| Phase timer | `backend/src/shared/perf/phase_timer.py` | `contextvar` + context manager + OTEL child span |
| Use cases | `backend/src/analytics/calculate_consumption.py`, `calculate_voltage.py` | Wraps `topology_resolve`, `key_resolve`, `serialize`, `estimate_for_response` |
| Adapter | `backend/src/shared/meter_adapters/duckdb_adapter.py` | Publishes `query` / `py_postprocess` (consumption) and `voltage_scan` / `voltage_bins` / `voltage_heatmap` / `voltage_stability` |
| Frontend | `frontend/src/plugins/sdk/perf.ts` | No-op unless `?perf=1`; `measureSync`/`measureAsync` wrap useMemo + fetch + parse; `chart:first_ready` measured from data-arrival to ECharts `onChartReady` |
| Tests | `backend/tests/test_phase_timer_middleware.py`, `frontend/tests/e2e/perf-instrumentation.spec.ts` | Verify Server-Timing wiring end-to-end |

## Measurements

Both scenarios use Substation seed nodes (real fan-out). All numbers are medians of 2 measured runs after a warmup. Caveat: phase-medians are computed independently, so the sum of phase medians may not equal the wall median.

### Consumption — seeded from 1–2 substations, ~879 downstream nodes

| Scenario | Window | Wall | Server (`total`) | Network/JSON gap | Payload | `query` | `serialize` |
|---|---|---|---|---|---|---|---|
| small  | 7 d   | 9.96 s  | 10.95 s | (within noise) | 268 KiB | **5.37 s** | 0.6 ms |
| medium | 30 d  | 10.08 s | 11.08 s | (within noise) | 598 KiB | **5.50 s** | 2.4 ms |
| large  | 60 d  | 20.55 s | 19.87 s | ~0.7 s         | 1.03 MiB | **11.23 s** | 3.6 ms |

Other phases (`topology_resolve`, `key_resolve`, `py_postprocess`) are all ≤10 ms even at the large scenario — they are not bottlenecks.

### Voltage — same seed, depth-limited

| Scenario | Window | Wall | Server | `voltage_scan` | `bins` | `heatmap` | `stability` | **`estimate_for_response`** | Payload |
|---|---|---|---|---|---|---|---|---|---|
| small  | 7 d  | 13.28 s | 13.23 s | **9.50 s** | 25 ms  | 110 ms | 38 ms  | **4.83 s** | 691 KiB |
| medium | 30 d | 14.18 s | 14.22 s | **9.65 s** | 98 ms  | 532 ms | 297 ms | **4.91 s** | 749 KiB |
| large* | 60 d | 19.14 s | 18.28 s | **13.88 s** | 2 ms | 3 ms | 1 ms | **7.12 s** | 0.5 KiB |

\* The large voltage scenario uses `degrees=2`; for the chosen substations that traversal returns no joinable rows, so the inner sub-queries return zero data even though `voltage_scan` still pays the parquet-scan cost. Useful corroborating data point — see Hotspot 3.

Raw data: `tmp/perf-e2e-2026-04-30.{csv,json,md}`.

## Hotspots, ranked by expected payoff

### 1. Voltage runs the estimate query a second time after the main query — 30–37 % wall time wasted

`backend/src/analytics/calculate_voltage.py:46-50` calls `meter_repo.get_voltage_distribution(...)` and then immediately calls `meter_repo.estimate_voltage_distribution(...)` purely to populate `estimated_rows` in the response. The estimate path runs `SELECT COUNT(*) FROM read_parquet(...) WHERE timestamp BETWEEN ...` over the same window — a full second scan.

Median costs: 4.83 s (small) / 4.91 s (medium) / 7.12 s (large) — between **30 % and 37 % of total wall time**, and the result is a single integer that the main query already implicitly knows.

**Fix:** make `get_voltage_distribution` return `(result, row_count)` (it can `SELECT COUNT(*) FROM tmp_vdata_*` for free since the temp table is already populated and persists for the duration of the call). Frontend already receives `estimated_rows` from `/estimate` before the user confirms, so the response field is informational only — losing it from the post-result payload is fine, or recompute it from the temp table count.

Estimated saving: **~5 s per voltage call** (steady at every scenario size).

### 2. Consumption query is 50–60 % of wall time — the work is in DuckDB itself, not adjacent code

`query` phase: 5.4 s small, 5.5 s medium, 11.2 s large. Topology + key resolution + serialization combined are <15 ms even at the large scenario. There is nothing to win in the Python layer for consumption — the next optimization has to come from the DuckDB plan or the parquet layout.

**Investigate:** `python backend/profile_consumption.py` already prints `EXPLAIN ANALYZE` for a 200-node, full-month query. The plan was previously the basis for the integer-pushdown work — re-run it to see whether the LEFT JOIN against `weather_recordings` (line 125 of `duckdb_adapter.py`) is now the dominant operator, or whether the time-bucketed scan still has slack. If weather is the hotspot, materializing it once at startup as a small lookup dict (`(month, day, hour) -> temperature`) and joining in Python after the aggregation may beat SQL.

Speculative payoff: 1–3 s per call if the weather join is removed from the hot path. To be confirmed before action.

### 3. Voltage `voltage_scan` always pays the parquet read, even when the join is empty

The large voltage row above shows: 13.88 s in `voltage_scan` to produce **zero** matching rows (the temp table is empty), then milliseconds to "process" the empty data. The CREATE TEMP TABLE at `duckdb_adapter.py:171` does `INNER JOIN node_table` but the join must still touch every parquet rowgroup that overlaps the time window before the join can prove the result is empty.

**Fix:** short-circuit at the use case level — if `len(storage_keys) == 0` after `_resolve_downstream` + `resolve_to_storage_keys`, skip the adapter call entirely. The consumption use case already does this (`calculate_consumption.py:69-78`); voltage does not. Free win for any node selection that doesn't reach a metered leaf.

### 4. Wall − server gap on the large consumption response (~700 ms) is JSON encoding + transit

For the 1 MiB payload the wall-vs-server gap is ~700 ms. On localhost that is essentially pure JSON encoding (FastAPI's default `json.dumps`) plus the Python→TCP write. Over a real network this becomes much worse.

**Fix:** add `gzip` middleware (`from fastapi.middleware.gzip import GZipMiddleware`) and switch the response encoder to `orjson` (`pip install orjson`, register `ORJSONResponse` as the default response class). Both are one-line changes in `backend/main.py`. Time-series payloads of repetitive ISO timestamps + floats compress 5–10×.

Speculative payoff: ~300–500 ms off large-payload encoding + cuts wire size to 100–200 KiB.

### 5. Frontend useMemo + chart timings — measure once before deciding whether to act

The frontend instrumentation is wired but the e2e profiler does not drive the UI; per-component timings live in the dev console once a user opens the modal with `?perf=1`. Before recommending changes there, capture one full session: a 90-day consumption window will exercise all four useMemo blocks (`memo:smoothed_temp`, `memo:seasonal_regression`, `memo:timeseries_downsample`, `memo:hourly_aggregation`) plus the three chart renders. Suspected hotspots based on inspection only:

- `memo:timeseries_downsample` allocates four parallel arrays per bucket — a single typed-array tuple would be faster, but only if the array length is north of 100 K elements (which a 365-day, 15-minute series is).
- `memo:seasonal_regression` re-runs whenever `filteredData` changes (i.e. every slicer move) — moving the regression to a worker would unblock the slicer, but only if the regression is >50 ms in measurement.

Decision rule: don't optimize either until a `?perf=1` capture shows >100 ms.

## Caveats

- Phase medians are computed independently per phase, so summing them does not equal the wall median. Use the wall and `total` columns for the user-facing latency story; phase columns describe relative weight.
- All measurements are localhost — no real network, no proxy, no gzip. Real WAN numbers will be larger, and Hotspot 4 will matter more in production than these numbers suggest.
- The `large` voltage scenario hit a degenerate downstream traversal. The data point for `voltage_scan` (13.88 s with empty result) is still meaningful — see Hotspot 3.
- The instrumentation overhead is below the measurement noise floor (existing `tests/test_analytics_performance.py` thresholds still pass).

## Next actions

Voltage-side recommendations (Hotspot 1 and 3) remain open. The consumption-side recommendations were executed in this session — see "Consumption optimizations applied" below.

## Consumption optimizations applied (2026-04-30)

After the initial review, three changes were made and re-measured against the live API. Verified by `backend/tests/test_analytics_performance.py` (still passing) and a TestClient-driven measurement loop.

### Changes

1. **`orjson` as the default response encoder** (`backend/main.py`). A small `TimedORJSONResponse(starlette.Response)` subclass wraps `orjson.dumps` in a `phase_timer("response_encode")` so the encode cost shows up in `Server-Timing`. Replaces FastAPI's default `jsonable_encoder + json.dumps` pipeline. Microbench on an 11k-point payload: **154 ms → 3.2 ms (49× faster)**.
2. **`GZipMiddleware`** (`backend/main.py`, `minimum_size=1024`, `compresslevel=5`). Compresses time-series JSON payloads 5–10× on the wire — material savings over real networks, negligible cost on localhost.
3. **Weather lookup moved out of SQL** (`backend/src/shared/meter_adapters/duckdb_adapter.py`). The adapter loads `weather_recordings` once into `dict[(month, day, hour) -> temperature]` (~9k entries, <1 MiB) and tags `temperature` during the existing Python post-processing loop. Replaces a LEFT JOIN over millions of rows. The query plan now goes parquet-scan → INNER hash-join → group-by; the `LEFT JOIN weather_recordings` operator is gone.
4. **`request_setup` phase added to consumption + voltage routes** (`backend/plugins/{consumption,voltage}/routes.py`). Gives visibility into the route-level pre-work (graph build, ID resolve, datetime validation).

### Measured impact (1 substation, 30 days, ~879 downstream nodes, ~611 KiB payload)

| Phase | Before | After | Δ |
|---|---:|---:|---:|
| `query` | ~5,659 ms (cold) / ~761 ms (warm) | **~605 ms** | weather LEFT JOIN gone (~20 % off warm query) |
| `response_encode` | not measured (~150 ms est., default encoder) | **~1.9 ms** | **49–80× faster via `orjson`** |
| Unaccounted gap (`total` − sum of phases) | **~2,950 ms** | **~675 ms** (warm) | encode pipeline + `jsonable_encoder` removed |
| Wall (warm cache) | ~10,318 ms | **~1,300 ms** | **~8× end-to-end** |

Wire size on the 1 MiB large-scenario response: ~80–120 KiB after gzip (estimated; deferred to next live-server measurement).

### What did *not* change

- DuckDB query itself (still scans the parquet for the time window) — that is now ~50 % of total wall and the next plausible target if more is needed.
- Voltage path — Hotspots 1 and 3 from the original review are still open. The `request_setup` phase was added to the voltage route for parity.
- Frontend — perf instrumentation is wired but no source changes were made; awaiting a `?perf=1` capture before deciding on memo/render optimizations.

### To verify

After restarting the backend, re-run:
```
python scripts/profile_e2e.py --runs 3 --analysis consumption
```
The `Server-Timing` header should now include `response_encode;dur=` (single-digit ms) and `request_setup;dur=`. Wall times for medium/large scenarios should drop 3–8× depending on cache warmth.

## Open work (next session)

1. Voltage Hotspot 1: drop the duplicate `estimate_voltage_distribution` call after the main query (`backend/src/analytics/calculate_voltage.py:46-50`). Estimated saving: 4.8–7.1 s per voltage call.
2. Voltage Hotspot 3: short-circuit `get_voltage_distribution` when `storage_keys` is empty.
3. Capture a `?perf=1` browser session of a large consumption modal render and decide whether the four useMemo blocks need further work.
