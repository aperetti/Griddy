import duckdb
try:
    df = duckdb.query("SELECT * FROM read_parquet('cim_readings/*.parquet') LIMIT 1").to_df()
    print(df.columns.tolist())
except Exception as e:
    print(f"Error: {e}")
