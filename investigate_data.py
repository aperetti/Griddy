import pandas as pd
import glob
import os

def investigate():
    files = glob.glob('cim_readings/*.parquet')
    if not files:
        print("No parquet files found in cim_readings/")
        return

    print(f"Found {len(files)} parquet files.")
    
    for f in files:
        print(f"\nInvestigating {f}...")
        df = pd.read_parquet(f)
        print(f"  Columns: {df.columns.tolist()}")
        print(f"  Rows: {len(df)}")
        print(f"  Min Timestamp: {df['timestamp'].min()}")
        print(f"  Max Timestamp: {df['timestamp'].max()}")
        
        # Check for our test node
        target_node = "E93A6F17-44FE-4E0A-B640-20C876F940B9"
        matches = df[df['node_id'] == target_node]
        print(f"  Matches for {target_node}: {len(matches)}")
        
        if len(matches) > 0:
            print(f"  Sample values for {target_node}:")
            print(matches[['timestamp', 'voltage_a', 'kwh_dlv']].head())

if __name__ == "__main__":
    investigate()
