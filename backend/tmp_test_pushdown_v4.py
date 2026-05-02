import duckdb
import pyarrow as pa
import time

f = '/app/cim_readings/readings_unified_2026_04.parquet'
conn = duckdb.connect()

# 1. Get 2 IDs
ids = conn.execute(f"SELECT DISTINCT node_id_int FROM read_parquet('{f}') LIMIT 2").fetchall()
ids = [r[0] for r in ids]

# 2. Test JOIN with timestamp
node_table = pa.Table.from_arrays([pa.array(ids, type=pa.int64())], names=['node_id_int'])
conn.register("node_table", node_table)
start = '2026-04-23 05:18:12'
end = '2026-04-30 05:18:12'

print(f"\nBenchmarking INNER JOIN with 2 nodes and 1 week timestamp filter:")
query = f"""
    EXPLAIN ANALYZE 
    SELECT COUNT(*) 
    FROM read_parquet('{f}') r 
    INNER JOIN node_table n ON r.node_id_int = n.node_id_int 
    WHERE r.timestamp >= '{start}'::TIMESTAMP 
      AND r.timestamp <= '{end}'::TIMESTAMP
"""
res = conn.execute(query).fetchall()
print(res[0][1])
