import pandas as pd
import glob
import os

def find_nodes_with_voltage():
    files = glob.glob('cim_readings/*.parquet')
    if not files:
        print("No files found.")
        return

    # Just check the first file for speed
    f = files[0]
    print(f"Checking {f}...")
    df = pd.read_parquet(f)
    has_v = df[df['voltage_a'].notnull()]
    print(f"Total rows: {len(df)}")
    print(f"Rows with voltage_a: {len(has_v)}")
    
    if len(has_v) > 0:
        unique_nodes = has_v['node_id'].unique()
        print(f"Number of nodes with voltage: {len(unique_nodes)}")
        print(f"Sample node IDs with voltage: {unique_nodes[:5].tolist()}")
        
        # Check a sample node's data range
        sample_node = unique_nodes[0]
        node_df = has_v[has_v['node_id'] == sample_node]
        print(f"\nSample Node: {sample_node}")
        print(f"Min Voltage: {node_df['voltage_a'].min()}")
        print(f"Max Voltage: {node_df['voltage_a'].max()}")
        print(f"Min Timestamp: {node_df['timestamp'].min()}")
        print(f"Max Timestamp: {node_df['timestamp'].max()}")
    else:
        print("No rows found with voltage_a set!")

if __name__ == "__main__":
    find_nodes_with_voltage()
