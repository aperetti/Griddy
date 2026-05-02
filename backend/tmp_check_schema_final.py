import duckdb
f = '/app/cim_readings/readings_unified_2026_04.parquet'
conn = duckdb.connect()
print(conn.execute(f"DESCRIBE SELECT * FROM read_parquet('{f}')").fetchall())
