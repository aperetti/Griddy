import duckdb
import pyarrow as pa
import time

f = '/app/cim_readings/readings_unified_2026_04.parquet'
conn = duckdb.connect()

# 1. Get 2 IDs
ids = conn.execute(f"SELECT DISTINCT node_id_int FROM read_parquet('{f}') LIMIT 2").fetchall()
ids = [r[0] for r in ids]

# 2. Test literal IN
sql_ids = ",".join(map(str, ids))
print(f"\nBenchmarking literal IN with {len(ids)} integers:")
query_in = f"EXPLAIN ANALYZE SELECT COUNT(*) FROM read_parquet('{f}') WHERE node_id_int IN ({sql_ids})"
res = conn.execute(query_in).fetchall()
print(res[0][1])

# 3. Test JOIN
node_table = pa.Table.from_arrays([pa.array(ids, type=pa.int64())], names=['node_id_int'])
conn.register("node_table", node_table)
print(f"\nBenchmarking INNER JOIN with {len(ids)} integers:")
query_join = f"EXPLAIN ANALYZE SELECT COUNT(*) FROM read_parquet('{f}') r INNER JOIN node_table n ON r.node_id_int = n.node_id_int"
res = conn.execute(query_join).fetchall()
print(res[0][1])
