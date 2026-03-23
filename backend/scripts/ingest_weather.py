import os
import duckdb
from pathlib import Path

SCRIPT_PATH = Path(__file__).resolve()
WORKSPACE_ROOT = SCRIPT_PATH.parents[2]

DB_PATH = os.getenv("DB_PATH", str(WORKSPACE_ROOT / "grid_data_cim.duckdb"))
WEATHER_PATH = os.getenv(
    "WEATHER_DATA_PATH", str(SCRIPT_PATH.parents[1] / "sample_data" / "weather.epw")
)


def setup_weather_table(conn):
    """Creates the weather_recordings table."""
    conn.execute("DROP TABLE IF EXISTS weather_recordings")
    conn.execute("""
        CREATE TABLE weather_recordings (
            month INTEGER,
            day INTEGER,
            hour INTEGER,
            temperature DOUBLE
        )
    """)
    print("Created weather_recordings table.")


def ingest_epw(conn, file_path):
    """Parses EPW file and ingests into DuckDB using native DuckDB functions."""
    if not os.path.exists(file_path):
        print(f"Error: Weather file not found at {file_path}")
        return

    print(f"Ingesting weather data from {file_path}...")

    # EPW Column Mapping (Standard):
    # col2: Month, col3: Day, col4: Hour, col7: Dry Bulb Temperature
    # We skip 8 header lines.
    # We subtract 1 from hour to match 0-23 indexing.

    # We define a few column names to avoid "column01" padding issues
    conn.execute(f"""
        INSERT INTO weather_recordings 
        SELECT 
            c2::INTEGER, 
            c3::INTEGER, 
            c4::INTEGER - 1, 
            c7::DOUBLE 
        FROM read_csv('{file_path}', 
                      skip=8, 
                      header=False, 
                      names=['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7'])
    """)

    count = conn.execute("SELECT COUNT(*) FROM weather_recordings").fetchone()[0]
    print(f"Successfully ingested {count} weather records.")


def main():
    conn = duckdb.connect(DB_PATH)
    setup_weather_table(conn)
    ingest_epw(conn, WEATHER_PATH)
    conn.close()


if __name__ == "__main__":
    main()
