"""End-to-end performance profiler for consumption + voltage analysis.

Hits the real HTTP endpoints (so the measurement includes network +
serialization) across three scenario sizes, parses the ``Server-Timing``
response header into per-phase durations, and writes a CSV + markdown summary.

Prerequisites
-------------
- Backend running on ``http://localhost:8000`` (or override with ``--base-url``).
- DuckDB + parquet readings available so the backend can resolve real node IDs.

Run from the repo root:

    python scripts/profile_e2e.py
    python scripts/profile_e2e.py --base-url http://localhost:8000 --runs 3

Outputs (under ``tmp/``):
    perf-e2e-{date}.csv     — one row per (analysis, scenario, run, phase)
    perf-e2e-{date}.md      — human-readable summary table
"""
from __future__ import annotations

import argparse
import csv
import datetime as dt
import json
import os
import statistics
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

import duckdb
import httpx


REPO_ROOT = Path(__file__).resolve().parents[1]
PARQUET_DIR = REPO_ROOT / "cim_readings"
TMP_DIR = REPO_ROOT / "tmp"


@dataclass
class Scenario:
    name: str
    node_count: int
    days: int
    start: str  # ISO 8601
    degrees: int | None = None  # voltage only


def _pick_node_ids(n: int, base_url: str) -> list[str]:
    """Pick *n* node IDs that actually exercise the analysis pipeline.

    We source these from the live topology endpoint (preferring Substation
    nodes, which fan out to many downstream consumers) rather than from the
    raw parquet — parquet node IDs are equipment-level and may not resolve
    to any downstream EnergyConsumer through the topology graph, leading to
    degenerate (empty-result) measurements.
    """
    try:
        topo = httpx.get(f"{base_url}/api/graph/topology", timeout=30).json()
    except Exception as e:
        sys.exit(f"Could not fetch topology from {base_url}: {e}")
    nodes = topo.get("nodes", [])
    if not nodes:
        sys.exit("Topology returned no nodes")
    # Prefer Substations, fall back to any node so the script still runs.
    subs = [node for node in nodes if node.get("type") == "Substation"]
    pool = subs or nodes
    ids = [node["id"] for node in pool[:n]]
    print(f"[setup] picked {len(ids)} node IDs from topology ({'Substations' if subs else 'any nodes'})")
    return ids


def _parse_server_timing(value: str | None) -> list[tuple[str, float]]:
    """Parse a Server-Timing header into [(phase, duration_ms)]."""
    if not value:
        return []
    out: list[tuple[str, float]] = []
    for part in value.split(","):
        part = part.strip()
        if not part:
            continue
        segs = [s.strip() for s in part.split(";")]
        name = segs[0]
        dur = 0.0
        for seg in segs[1:]:
            if seg.startswith("dur="):
                try:
                    dur = float(seg.split("=", 1)[1])
                except ValueError:
                    pass
        if name:
            out.append((name, dur))
    return out


def _post_run(client: httpx.Client, url: str, label: str) -> dict:
    """Make a single timed request. Returns a dict with timing + payload info."""
    t0 = time.perf_counter()
    res = client.get(url)
    wall_ms = (time.perf_counter() - t0) * 1000
    res.raise_for_status()
    payload_bytes = len(res.content)
    server_timing = _parse_server_timing(res.headers.get("Server-Timing"))
    return {
        "label": label,
        "url": url,
        "wall_ms": wall_ms,
        "payload_bytes": payload_bytes,
        "phases": server_timing,
    }


def _run_scenario(
    client: httpx.Client,
    base_url: str,
    analysis: str,
    scenario: Scenario,
    node_ids: list[str],
    runs: int,
) -> list[dict]:
    """Run one scenario `runs` times. The first run is warmup and is kept separate."""
    end = (dt.datetime.fromisoformat(scenario.start.replace("Z", "+00:00"))
           + dt.timedelta(days=scenario.days)).isoformat().replace("+00:00", "Z")
    nid_csv = ",".join(node_ids[:scenario.node_count])
    # force=true bypasses the row-count threshold so large scenarios can run.
    if analysis == "consumption":
        url = f"{base_url}/api/plugins/consumption/{nid_csv}?start_time={scenario.start}&end_time={end}&force=true"
    elif analysis == "voltage":
        deg = f"&degrees={scenario.degrees}" if scenario.degrees is not None else ""
        url = f"{base_url}/api/plugins/voltage/{nid_csv}?start_time={scenario.start}&end_time={end}&force=true{deg}"
    else:
        raise ValueError(f"Unknown analysis: {analysis}")

    results = []
    for i in range(runs):
        kind = "warmup" if i == 0 else f"run{i}"
        try:
            r = _post_run(client, url, f"{analysis}/{scenario.name}/{kind}")
        except httpx.HTTPStatusError as e:
            print(f"  ! {analysis}/{scenario.name}/{kind} failed: {e}")
            continue
        results.append({"analysis": analysis, "scenario": scenario.name, "run": kind, **r})
        print(f"  {analysis:11s} {scenario.name:6s} {kind:7s} wall={r['wall_ms']:7.1f}ms  bytes={r['payload_bytes']:>9,}  phases={len(r['phases'])}")
    return results


def _write_csv(rows: list[dict], path: Path) -> None:
    if not rows:
        return
    with path.open("w", newline="") as fh:
        w = csv.writer(fh)
        w.writerow(["analysis", "scenario", "run", "wall_ms", "payload_bytes", "phase", "phase_ms"])
        for r in rows:
            if not r["phases"]:
                w.writerow([r["analysis"], r["scenario"], r["run"], f"{r['wall_ms']:.2f}", r["payload_bytes"], "", ""])
                continue
            for name, dur in r["phases"]:
                w.writerow([r["analysis"], r["scenario"], r["run"], f"{r['wall_ms']:.2f}",
                            r["payload_bytes"], name, f"{dur:.2f}"])


def _summarize_phase_medians(rows: list[dict]) -> dict[tuple[str, str], dict[str, float]]:
    """Per (analysis, scenario): median of each phase across the measured (non-warmup) runs."""
    grouped: dict[tuple[str, str], list[dict]] = {}
    for r in rows:
        if r["run"] == "warmup":
            continue
        grouped.setdefault((r["analysis"], r["scenario"]), []).append(r)

    out: dict[tuple[str, str], dict[str, float]] = {}
    for key, runs in grouped.items():
        per_phase: dict[str, list[float]] = {}
        for run in runs:
            for name, dur in run["phases"]:
                per_phase.setdefault(name, []).append(dur)
            per_phase.setdefault("__wall_ms__", []).append(run["wall_ms"])
            per_phase.setdefault("__payload_bytes__", []).append(float(run["payload_bytes"]))
        out[key] = {p: statistics.median(vals) for p, vals in per_phase.items()}
    return out


def _write_markdown(rows: list[dict], path: Path) -> None:
    summary = _summarize_phase_medians(rows)
    lines: list[str] = []
    lines.append(f"# E2E performance — {dt.datetime.now().isoformat(timespec='seconds')}")
    lines.append("")
    lines.append("Each cell is the median across measured (non-warmup) runs, in ms.")
    lines.append("")
    by_analysis: dict[str, list[tuple[str, dict[str, float]]]] = {}
    for (analysis, scenario), phases in summary.items():
        by_analysis.setdefault(analysis, []).append((scenario, phases))

    for analysis, entries in by_analysis.items():
        lines.append(f"## {analysis}")
        lines.append("")
        # Collect every phase name across this analysis so columns line up.
        all_phases: list[str] = []
        for _, phases in entries:
            for p in phases:
                if p.startswith("__"):
                    continue
                if p not in all_phases:
                    all_phases.append(p)
        header = ["scenario", "wall (ms)", "payload (KiB)"] + all_phases
        lines.append("| " + " | ".join(header) + " |")
        lines.append("|" + "|".join(["---"] * len(header)) + "|")
        # Sort scenarios in input order: small, medium, large, ...
        order = ["small", "medium", "large"]
        entries.sort(key=lambda x: order.index(x[0]) if x[0] in order else 99)
        for scenario, phases in entries:
            row = [
                scenario,
                f"{phases.get('__wall_ms__', 0):.1f}",
                f"{phases.get('__payload_bytes__', 0)/1024:.1f}",
            ]
            for p in all_phases:
                v = phases.get(p)
                row.append(f"{v:.1f}" if v is not None else "—")
            lines.append("| " + " | ".join(row) + " |")
        lines.append("")
    path.write_text("\n".join(lines), encoding="utf-8")


def main(argv: Iterable[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--base-url", default="http://localhost:8000")
    p.add_argument("--runs", type=int, default=3, help="Total runs per scenario (1 warmup + N-1 measured)")
    p.add_argument("--scenarios", default="small,medium,large", help="Comma-separated subset")
    p.add_argument("--analysis", default="consumption,voltage", help="consumption | voltage | both")
    p.add_argument("--timeout", type=float, default=120.0)
    args = p.parse_args(argv)

    TMP_DIR.mkdir(parents=True, exist_ok=True)

    chosen = set(args.scenarios.split(","))
    # We seed from Substation nodes (large fan-out). The HTTP route caps node
    # IDs at 100 (plugins/consumption/routes.py MAX_NODE_IDS); for the larger
    # scenarios we widen the time window instead of the seed-node count.
    all_scenarios = [
        Scenario("small",  node_count=1, days=7,    start="2026-04-01T00:00:00Z"),
        Scenario("medium", node_count=1, days=30,   start="2026-04-01T00:00:00Z"),
        Scenario("large",  node_count=2, days=60,   start="2026-03-01T00:00:00Z", degrees=2),
    ]
    scenarios = [s for s in all_scenarios if s.name in chosen]
    analyses = [a.strip() for a in args.analysis.split(",") if a.strip()]
    max_nodes = max(s.node_count for s in scenarios)

    print(f"[setup] picking up to {max_nodes} node IDs from topology ...")
    node_ids = _pick_node_ids(max_nodes, args.base_url)
    print(f"[setup] scenarios: {[s.name for s in scenarios]}, analyses: {analyses}")
    print(f"[setup] base URL: {args.base_url}, runs/scenario: {args.runs}")
    print()

    rows: list[dict] = []
    with httpx.Client(timeout=args.timeout) as client:
        for analysis in analyses:
            for scenario in scenarios:
                rows.extend(_run_scenario(client, args.base_url, analysis, scenario, node_ids, args.runs))

    today = dt.date.today().isoformat()
    csv_path = TMP_DIR / f"perf-e2e-{today}.csv"
    md_path = TMP_DIR / f"perf-e2e-{today}.md"
    _write_csv(rows, csv_path)
    _write_markdown(rows, md_path)
    # Always also dump the raw row list for downstream tooling.
    json_path = TMP_DIR / f"perf-e2e-{today}.json"
    json_path.write_text(json.dumps(rows, indent=2), encoding="utf-8")

    print()
    print(f"[done] CSV  -> {csv_path}")
    print(f"[done] MD   -> {md_path}")
    print(f"[done] JSON -> {json_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
