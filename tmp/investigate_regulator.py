
import sys
import os
from pathlib import Path

# Add backend to path
sys.path.append(os.getcwd())

from src.shared.cim.helpers import _mrid_str, _get_name
from src.shared.cim.manager import CimModelManager

def investigate():
    mgr = CimModelManager.get_instance()
    mgr.load()
    
    target_id = "B7C99664-2FB4-44FD-988B-3E8A9E162E46"
    print(f"Investigating {target_id}...")
    
    # 1. Check if it's in the index
    entry = mgr._idx.equipment_index.get(target_id)
    if not entry:
        print("Not found in equipment_index.")
        # Search for regulators by name
        print("\nSearching for objects with 'Regulator' in name...")
        reg_count = 0
        for cls, objs in mgr.network.graph.items():
            for mrid, obj in objs.items():
                name = _get_name(obj)
                if name and "regulator" in name.lower():
                    print(f"Found: {name} (mRID: {mrid}, Class: {cls.__name__})")
                    reg_count += 1
        print(f"Total regulators found: {reg_count}")
        return

    cls_name, obj = entry
    print(f"Class: {cls_name}")
    print(f"Type from index: {mgr._idx.equipment_types.get(target_id)}")
    
    # 2. Check neighbors
    neighbors = mgr.get_neighbors(target_id)
    print("\nNeighbors:")
    if neighbors:
        for n in neighbors.get("neighbors", []):
            print(f"  - {n['type']} {n['id']} ({n.get('cim_class', 'N/A')}) {n.get('name', '')}")
    
    # 3. Check full details
    detail = mgr.get_equipment_detail(target_id)
    print("\nDetail keys:", list(detail.keys()))
    if "terminals" in detail:
        print("Terminals:")
        for t in detail["terminals"]:
            cn_id = t["connectivity_node"]
            # Check what else is at this CN
            at_cn = mgr._idx.cn_equipment.get(cn_id, [])
            print(f"  - CN {cn_id} has equipment: {at_cn}")
            for eq_id in at_cn:
                if eq_id != target_id:
                    eq_type = mgr._idx.equipment_types.get(eq_id)
                    print(f"    - {eq_id} ({eq_type})")

    # 4. Check if it's a PowerTransformer and what's inside its container
    container = detail.get("container")
    if container:
        print(f"\nContainer: {container['class']} {container['mrid']} ({container['name']})")
        # Check what else is in this container
        objs_in_container = []
        for eq_mrid, eq_type in mgr._idx.equipment_types.items():
            eq_detail = mgr.get_equipment_detail(eq_mrid)
            if eq_detail and eq_detail.get("container", {}).get("mrid") == container["mrid"]:
                objs_in_container.append((eq_mrid, eq_type, eq_detail.get("name")))
        
        print(f"Objects in the same container:")
        for m, t, n in objs_in_container:
            print(f"  - {m} ({t}) {n}")

if __name__ == "__main__":
    investigate()
