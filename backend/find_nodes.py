import duckdb
conn = duckdb.connect()
path = "../cim_readings/*.parquet"
res = conn.execute(f"SELECT node_id, count(*) FROM read_parquet('{path}') GROUP BY 1 LIMIT 5").fetchall()
for row in res:
    print(f"Node: {row[0]}, Count: {row[1]}")
