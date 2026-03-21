import requests
import json
import sys

BASE_URL = "http://localhost:8000"

def test_topology():
    print("\n--- Testing Topology ---")
    # Get models first
    resp = requests.get(f"{BASE_URL}/api/models")
    models = resp.json()
    if not models:
        print("No models found!")
        return
        
    model_ids = [m['model_id'] for m in models[:1]]
    print(f"Testing with model: {model_ids}")
    
    resp = requests.post(f"{BASE_URL}/api/topology", json={"model_ids": model_ids})
    topo = resp.json()
    
    # Check that all nodes have IDs and positions
    nodes = topo.get('nodes', [])
    print(f"Total nodes: {len(nodes)}")
    for n in nodes[:5]:
        print(f"  Node {n['id']}: pos={n['position']}, has_coords={n.get('has_coords')}")
        
    # Check edges
    edges = topo.get('edges', [])
    print(f"Total edges: {len(edges)}")
    for e in edges[:5]:
        if e.get('edge_type') == 'PowerTransformer':
            print(f"  Found Transformer {e['id']}: type={e['edge_type']}, name={e.get('name')}")

def test_equipment_hierarchy():
    print("\n--- Testing Equipment Hierarchy ---")
    # Search for different types of equipment
    for query in ["PowerTransformer", "Breaker", "Capacitor"]:
        print(f"\nSearching for {query}...")
        resp = requests.get(f"{BASE_URL}/api/search?q={query}")
        results = resp.json()
        if not results:
            print(f"No {query} found.")
            continue
            
        # Get first result
        eq = results[0]
        mrid = eq['mrid']
        print(f"Getting details for {mrid} ({eq.get('name')})")
        
        # We need model_id
        # Search returns results from all models, but we'll try to find which model it belongs to
        # For simplicity, we'll try to get detail without model_id if possible, or get model_id from search
        model_id = eq.get('model_id')
        if not model_id:
            # Fallback to first available model if not provided
            resp = requests.get(f"{BASE_URL}/api/models")
            model_id = resp.json()[0]['model_id']
            
        detail_resp = requests.get(f"{BASE_URL}/api/equipment/{mrid}?model_id={model_id}")
        detail = detail_resp.json()
        
        if 'hierarchy' in detail:
            print(f"  SUCCESS: Hierarchy found for {query}")
            print(f"  Hierarchy root class: {detail['hierarchy'].get('class')}")
            print(f"  Children count: {len(detail['hierarchy'].get('children', []))}")
        else:
            print(f"  FAILURE: No hierarchy found for {query}")

if __name__ == "__main__":
    try:
        test_topology()
        test_equipment_hierarchy()
    except Exception as e:
        print(f"Error: {e}")
        sys.exit(1)
