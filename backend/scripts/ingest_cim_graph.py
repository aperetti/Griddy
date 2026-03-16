#!/usr/bin/env python3
"""
CIM-Graph based CIM XML ingestion → SQLite topology database.

Uses the shared CimModelManager singleton so that phase data comes from
the per-phase CIM association objects (ACLineSegmentPhase,
EnergyConsumerPhase, …) rather than being hard-coded to ["A","B","C"].

Usage:
    python scripts/ingest_cim_graph.py
    CIM_MODEL_PATH=sample_data/IEEE8500.xml python scripts/ingest_cim_graph.py
"""
import os
import sys
import sqlite3
import json
import random
from pathlib import Path

SCRIPT_PATH = Path(__file__).resolve()
BACKEND_DIR = SCRIPT_PATH.parents[1]
WORKSPACE_ROOT = SCRIPT_PATH.parents[2]

# Ensure backend/ is importable for CimModelManager
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from src.shared.database_setup import SQLITE_PATH


# ---------------------------------------------------------------------------
# SQLite setup
# ---------------------------------------------------------------------------

def setup_sqlite(db_path: str) -> sqlite3.Connection:
    """Create / reset the SQLite topology database."""
    conn = sqlite3.connect(db_path)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")

    conn.execute("DROP TABLE IF EXISTS grid_edges")
    conn.execute("DROP TABLE IF EXISTS grid_nodes")

    conn.execute("""
        CREATE TABLE grid_nodes (
            node_id   TEXT PRIMARY KEY,
            node_type TEXT NOT NULL,
            name      TEXT,
            phases_present TEXT DEFAULT '["A","B","C"]',
            latitude  REAL,
            longitude REAL,
            is_open   INTEGER DEFAULT 0
        )
    """)
    conn.execute("""
        CREATE TABLE grid_edges (
            edge_id      TEXT PRIMARY KEY,
            from_node_id TEXT NOT NULL REFERENCES grid_nodes(node_id),
            to_node_id   TEXT NOT NULL REFERENCES grid_nodes(node_id),
            conductor_type TEXT,
            phases       TEXT DEFAULT '["A","B","C"]'
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS alarms (
            alarm_id  TEXT PRIMARY KEY,
            node_id   TEXT,
            timestamp TEXT,
            alarm_code TEXT,
            severity  TEXT,
            message   TEXT,
            is_active INTEGER DEFAULT 1
        )
    """)
    conn.commit()
    return conn


# ---------------------------------------------------------------------------
# Main ingestion
# ---------------------------------------------------------------------------

def main():
    from src.shared.cim_model import CimModelManager

    print(f"SQLite DB : {SQLITE_PATH}")

    # ── 1. Load CIM model via shared manager ──────────────────────
    print("\nLoading CIM model via CimModelManager...")
    manager = CimModelManager.get_instance()
    manager.load()

    nodes_raw = manager.get_topology_nodes()
    edges_raw = manager.get_topology_edges()

    print(f"  {len(nodes_raw)} nodes, {len(edges_raw)} edges from CIM model")

    # ── 2. Convert to SQLite rows ─────────────────────────────────
    nodes_to_insert = []
    for n in nodes_raw:
        nodes_to_insert.append((
            n["node_id"],
            n["node_type"],
            n.get("name", ""),
            json.dumps(n.get("phases_present", ["A", "B", "C"])),
            n.get("latitude", 0.0),
            n.get("longitude", 0.0),
            int(n.get("is_open", False)),
        ))

    edges_to_insert = []
    for e in edges_raw:
        edges_to_insert.append((
            e["edge_id"],
            e["from_node_id"],
            e["to_node_id"],
            e.get("conductor_type", "Unknown"),
            json.dumps(e.get("phases", ["A", "B", "C"])),
        ))

    # ── 3. Write to SQLite ────────────────────────────────────────
    print(f"\nWriting {len(nodes_to_insert)} nodes and "
          f"{len(edges_to_insert)} edges to SQLite...")

    conn = setup_sqlite(SQLITE_PATH)

    conn.executemany(
        "INSERT INTO grid_nodes "
        "(node_id, node_type, name, phases_present, latitude, longitude, is_open) "
        "VALUES (?, ?, ?, ?, ?, ?, ?)",
        nodes_to_insert
    )
    conn.executemany(
        "INSERT INTO grid_edges "
        "(edge_id, from_node_id, to_node_id, conductor_type, phases) "
        "VALUES (?, ?, ?, ?, ?)",
        edges_to_insert
    )

    conn.commit()

    # ── Summary ───────────────────────────────────────────────────
    node_count = conn.execute("SELECT COUNT(*) FROM grid_nodes").fetchone()[0]
    edge_count = conn.execute("SELECT COUNT(*) FROM grid_edges").fetchone()[0]
    type_summary = conn.execute(
        "SELECT node_type, COUNT(*) FROM grid_nodes GROUP BY node_type ORDER BY COUNT(*) DESC"
    ).fetchall()

    phase_summary: dict[str, int] = {}
    for row in conn.execute("SELECT phases_present FROM grid_nodes").fetchall():
        phases = json.loads(row[0]) if row[0] else ["A", "B", "C"]
        key = ",".join(sorted(phases))
        phase_summary[key] = phase_summary.get(key, 0) + 1

    print(f"\n{'=' * 50}")
    print("Ingestion complete!")
    print(f"  Nodes : {node_count}")
    print(f"  Edges : {edge_count}")
    print("  Types :")
    for t, c in type_summary:
        print(f"    {t:20s} {c}")
    print("  Phase distribution (nodes):")
    for phases, count in sorted(phase_summary.items(), key=lambda x: -x[1]):
        print(f"    {phases:20s} {count}")
    print(f"  DB    : {SQLITE_PATH}")
    print(f"{'=' * 50}")

    conn.close()


if __name__ == '__main__':
    main()
