import duckdb
import time

def test_join():
    conn = duckdb.connect(':memory:')
    parquet_file = '/app/cim_readings/readings_unified_2026_04.parquet'
    
    ids_raw = conn.execute(f"SELECT DISTINCT node_id FROM read_parquet('{parquet_file}') LIMIT 69").fetchall()
    target_ids = [r[0] for r in ids_raw]
    wa = [0.333] * 69
    wb = [0.333] * 69
    wc = [0.333] * 69

    print(f"Testing JOIN with {len(target_ids)} unique nodes...")
    start = time.time()
    query = f"""
        WITH mapping(node_id, wa, wb, wc) AS (
            SELECT unnest(?::VARCHAR[]), unnest(?::DOUBLE[]), unnest(?::DOUBLE[]), unnest(?::DOUBLE[])
        )
        SELECT 
            r.timestamp,
            SUM(r.kwh_dlv * m.wa)
        FROM read_parquet('{parquet_file}') r
        JOIN mapping m ON r.node_id = m.node_id
        WHERE r.timestamp >= '2026-04-27' AND r.timestamp <= '2026-04-28'
        GROUP BY r.timestamp
    """
    res = conn.execute(query, [target_ids, wa, wb, wc]).fetchall()
    print(f"Result count: {len(res)}, Time: {time.time()-start:.2f}s")

if __name__ == "__main__":
    test_join()
