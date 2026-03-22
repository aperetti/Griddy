import requests
import json

try:
    url = "http://localhost:8000/api/graph/topology"
    res = requests.get(url)
    data = res.json()
    
    # Analyze some consumer nodes
    consumers = [n for n in data['nodes'] if n['display_type'] == 'Regulator'] # Customers rule uses Regulator type
    
    print(f"Found {len(consumers)} consumer nodes.")
    if consumers:
        c = consumers[0]
        print("Example Consumer Node:")
        print(f"  ID: {c['id']}")
        print(f"  Display Type: {c['display_type']}")
        print(f"  Display Size: {c['display_size']}")
        if c['display_icon']:
            print(f"  Display Icon: {c['display_icon'][:100]}...")
            
except Exception as e:
    print(f"Error: {e}")
