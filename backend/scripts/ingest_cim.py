import os
import duckdb
import xml.etree.ElementTree as ET
from pathlib import Path

SCRIPT_PATH = Path(__file__).resolve()
BACKEND_DIR = SCRIPT_PATH.parents[1]
WORKSPACE_ROOT = SCRIPT_PATH.parents[2]


def resolve_xml_path() -> Path:
    """Resolves CIM XML path from env var or common project locations."""
    env_xml = os.getenv("CIM_MODEL_PATH")
    if env_xml:
        p = Path(env_xml)
        if p.is_file():
            return p
        # If relative path is provided, try resolving from CWD first
        cwd_resolved = (Path.cwd() / p).resolve()
        if cwd_resolved.is_file():
            return cwd_resolved

    candidates = [
        BACKEND_DIR / "cim" / "models" / "IEEE8500.xml",
        WORKSPACE_ROOT / "backend" / "cim" / "models" / "IEEE8500.xml",
        WORKSPACE_ROOT / "cim" / "models" / "IEEE8500.xml",
        Path.cwd() / "cim" / "models" / "IEEE8500.xml",
        Path.cwd() / "IEEE8500.xml",
    ]

    for c in candidates:
        if c.is_file():
            return c

    # Fall back to the primary expected location for a clearer error message
    return BACKEND_DIR / "cim" / "models" / "IEEE8500.xml"


# Default DB is workspace root so API and scripts read the same file.
DB_PATH = os.getenv("DB_PATH", str(WORKSPACE_ROOT / "grid_data_cim.duckdb"))
XML_PATH = str(resolve_xml_path())

# We must map CIM phases to our schema: ['A', 'B', 'C', 'AB', 'AC', 'BC', 'ABC']
# Depending on how the CIM defines it, PhaseCodes might exist or we just default them.

def setup_db(conn):
    """Recreates the DuckDB tables from scratch to ingest the CIM model cleanly."""
    conn.execute("DROP TABLE IF EXISTS grid_edges")
    conn.execute("DROP TABLE IF EXISTS grid_nodes")

    conn.execute("""
        CREATE TABLE grid_nodes (
            node_id VARCHAR PRIMARY KEY,
            node_type VARCHAR,
            name VARCHAR,
            phases_present VARCHAR[],
            latitude DOUBLE,
            longitude DOUBLE,
            is_open BOOLEAN
        )
    """)
    conn.execute("""
        CREATE TABLE grid_edges (
            edge_id VARCHAR PRIMARY KEY,
            from_node_id VARCHAR,
            to_node_id VARCHAR,
            conductor_type VARCHAR,
            phases VARCHAR[],
            FOREIGN KEY (from_node_id) REFERENCES grid_nodes(node_id),
            FOREIGN KEY (to_node_id) REFERENCES grid_nodes(node_id)
        )
    """)
    print("Cleaned database tables.")

def extract_mrid(element):
    """Extracts the rdf:ID or rdf:about mRID."""
    if '{http://www.w3.org/1999/02/22-rdf-syntax-ns#}ID' in element.attrib:
        return element.attrib['{http://www.w3.org/1999/02/22-rdf-syntax-ns#}ID']
    if '{http://www.w3.org/1999/02/22-rdf-syntax-ns#}about' in element.attrib:
        return element.attrib['{http://www.w3.org/1999/02/22-rdf-syntax-ns#}about'].replace('urn:uuid:', '')
    return None

def extract_name(element, namespaces):
    """Extracts the IdentifiedObject.name."""
    name_el = element.find('cim:IdentifiedObject.name', namespaces)
    if name_el is not None:
        return name_el.text
    return "Unknown"

def main():
    print(f"DB: {DB_PATH}")
    print(f"Parsing {XML_PATH}...")
    tree = ET.parse(XML_PATH)
    root = tree.getroot()
    namespaces = {
        'cim': 'http://iec.ch/TC57/CIM100#',
        'rdf': 'http://www.w3.org/1999/02/22-rdf-syntax-ns#'
    }
    
    conn = duckdb.connect(DB_PATH)
    setup_db(conn)

    print("Extracting coordinates...")
    # First, collect all raw coordinates to find bounds for normalization
    raw_points = []
    for pt in root.findall('cim:PositionPoint', namespaces):
        x_val = pt.find('cim:PositionPoint.xPosition', namespaces)
        y_val = pt.find('cim:PositionPoint.yPosition', namespaces)
        if x_val is not None and y_val is not None:
            try:
                raw_points.append((float(x_val.text), float(y_val.text)))
            except ValueError:
                pass

    # Basic normalization to fit the grid model into a viewable area (e.g. 0.1 degree box around LA)
    if raw_points:
        min_x = min(p[0] for p in raw_points)
        max_x = max(p[0] for p in raw_points)
        min_y = min(p[1] for p in raw_points)
        max_y = max(p[1] for p in raw_points)
        
        span_x = max_x - min_x if max_x != min_x else 1
        span_y = max_y - min_y if max_y != min_y else 1
        
        def normalize(x, y):
            # Scale to 0.1 degree span
            norm_x = (x - min_x) / span_x * 0.1 - 118.2437
            norm_y = (y - min_y) / span_y * 0.1 + 34.0522
            return norm_y, norm_x
    else:
        def normalize(x, y): return 34.0522, -118.2437

    locations = {}
    for pt in root.findall('cim:PositionPoint', namespaces):
        loc_id = pt.find('cim:PositionPoint.Location', namespaces)
        if loc_id is not None and '{http://www.w3.org/1999/02/22-rdf-syntax-ns#}resource' in loc_id.attrib:
            loc_id_val = loc_id.attrib['{http://www.w3.org/1999/02/22-rdf-syntax-ns#}resource'].split(':')[-1]
            x_val = pt.find('cim:PositionPoint.xPosition', namespaces)
            y_val = pt.find('cim:PositionPoint.yPosition', namespaces)
            if loc_id_val and x_val is not None and y_val is not None:
                try:
                    lat, lon = normalize(float(x_val.text), float(y_val.text))
                    if loc_id_val not in locations:
                        locations[loc_id_val] = (lat, lon)
                except ValueError:
                    pass


    print("Extracting topological nodes...")
    nodes_to_insert = []
    
    # Track which CIM entity maps to which Location
    def get_lat_lon(element):
        loc = element.find('cim:PowerSystemResource.Location', namespaces)
        if loc is not None and '{http://www.w3.org/1999/02/22-rdf-syntax-ns#}resource' in loc.attrib:
            loc_id = loc.attrib['{http://www.w3.org/1999/02/22-rdf-syntax-ns#}resource'].split(':')[-1]
            if loc_id in locations:
                return locations[loc_id]
        return (0.0, 0.0)

    # 1. Substations (Source)
    for sub in root.findall('cim:Substation', namespaces):
        mrid = extract_mrid(sub)
        name = extract_name(sub, namespaces)
        lat, lon = get_lat_lon(sub)
        nodes_to_insert.append((mrid, 'Substation', name, ['A', 'B', 'C'], lat, lon))

    # 2. PowerTransformers
    for xf in root.findall('cim:PowerTransformer', namespaces):
        mrid = extract_mrid(xf)
        name = extract_name(xf, namespaces)
        lat, lon = get_lat_lon(xf)
        nodes_to_insert.append((mrid, 'Transformer', name, ['A', 'B', 'C'], lat, lon))
        
    # 3. EnergyConsumers (Meters)
    for meter in root.findall('cim:EnergyConsumer', namespaces):
        mrid = extract_mrid(meter)
        name = extract_name(meter, namespaces)
        lat, lon = get_lat_lon(meter)
        # Attempt to figure out phase. Default to ['A'] for simulation
        phase_el = meter.find('cim:EnergyConsumer.phaseConnection', namespaces)
        nodes_to_insert.append((mrid, 'Meter', name, ['A'], lat, lon))
        
    # Wait, the graph connectivity isn't direct. Assets -> Terminals -> ConnectivityNodes <- Terminals <- Assets.
    # To build a `grid_nodes` and `grid_edges` array, we actually should treat `ConnectivityNode` as the core graph nodes,
    # OR map the devices.
    # We will treat `ConnectivityNode` objects as `grid_nodes` to allow identical topology flow, 
    # and mark the Physical equipments attached to them.
    # But for simplicity, let's insert the ConnectivityNodes natively to preserve exactly the exact IEEE8500 branching.

    print("Populating Terminals...")
    # Terminal dict: terminal_id -> (equipment_mrid, connectivity_node_mrid)
    terminals = {}
    for term in root.findall('cim:Terminal', namespaces):
        tid = extract_mrid(term)
        ce_el = term.find('cim:Terminal.ConductingEquipment', namespaces)
        cn_el = term.find('cim:Terminal.ConnectivityNode', namespaces)
        
        ce = ce_el.attrib['{http://www.w3.org/1999/02/22-rdf-syntax-ns#}resource'].split(':')[-1] if ce_el is not None and '{http://www.w3.org/1999/02/22-rdf-syntax-ns#}resource' in ce_el.attrib else None
        cn = cn_el.attrib['{http://www.w3.org/1999/02/22-rdf-syntax-ns#}resource'].split(':')[-1] if cn_el is not None and '{http://www.w3.org/1999/02/22-rdf-syntax-ns#}resource' in cn_el.attrib else None
        
        if tid and ce and cn:
            terminals[tid] = (ce, cn)
            
    # Group terminals by ConnectivityNode to establish physical edges
    edges_to_insert = []
    
    # ACLineSegments act as Edges between two Terminals -> two Connectivity Nodes
    for line in root.findall('cim:ACLineSegment', namespaces):
        mrid = extract_mrid(line)
        name = extract_name(line, namespaces)
        
        # Find terminals belonging to this line.
        line_terms = [v for k, v in terminals.items() if v[0] == mrid]
        if len(line_terms) == 2:
            cn1 = line_terms[0][1]
            cn2 = line_terms[1][1]
            edges_to_insert.append((mrid, cn1, cn2, 'Overhead', ['A', 'B', 'C']))
            
    # For PowerTransformers and Switches, we also treat them as edges bridging two Connectivity Nodes
    for eq_type in ['cim:PowerTransformer', 'cim:Breaker', 'cim:LoadBreakSwitch']:
        for eq in root.findall(eq_type, namespaces):
            mrid = extract_mrid(eq)
            name = extract_name(eq, namespaces)
            eq_terms = [v for k, v in terminals.items() if v[0] == mrid]
            # Some transformers have 3 windings, we just take the first two to form the edge.
            if len(eq_terms) >= 2:
                cn1 = eq_terms[0][1]
                cn2 = eq_terms[1][1]
                edges_to_insert.append((mrid, cn1, cn2, eq_type.replace('cim:', ''), ['A', 'B', 'C']))

    print("Building Connectivity Nodes...")
    # The actual nodes in the graph are going to be the ConnectivityNodes.
    # We trace equipments attached to them to determine Node Types and coordinates
    cnode_map = {}
    for cn in root.findall('cim:ConnectivityNode', namespaces):
        mrid = extract_mrid(cn)
        name = extract_name(cn, namespaces)
        cnode_map[mrid] = {'id': mrid, 'name': name, 'type': 'Bus', 'lat': 0.0, 'lon': 0.0, 'equipments': []}
        
    for tid, (ce, cn) in terminals.items():
        if cn in cnode_map:
            cnode_map[cn]['equipments'].append(ce)
            
    # Figure out the coordinates for Connectivity Nodes. Assign from the first equipment that has a position.
    equipment_to_loc = {extract_mrid(eq): get_lat_lon(eq) for eq in root.findall('cim:PowerSystemResource', namespaces)}
    
    # We also manually extract generic equipments that inherit PowerSystemResource implicitly in CIM
    for eq_type in ['cim:EnergyConsumer', 'cim:Substation', 'cim:PowerTransformer', 'cim:ACLineSegment', 'cim:EnergySource', 'cim:LoadBreakSwitch', 'cim:Breaker']:
        for eq in root.findall(eq_type, namespaces):
            equipment_to_loc[extract_mrid(eq)] = get_lat_lon(eq)

    print("Building Equipment lookup dictionary to fix O(N^2) performance...")
    equipment_types = {}
    equipment_open = {}
    for eq_type in ['cim:Substation', 'cim:PowerTransformer', 'cim:Breaker', 'cim:LoadBreakSwitch', 'cim:EnergyConsumer', 'cim:ACLineSegment', 'cim:EnergySource']:
        for eq in root.findall(eq_type, namespaces):
            mrid = extract_mrid(eq)
            if mrid:
                equipment_types[mrid] = eq_type.replace('cim:', '')
                if eq_type == 'cim:LoadBreakSwitch' or eq_type == 'cim:Breaker':
                    open_el = eq.find('cim:Switch.normalOpen', namespaces)
                    if open_el is None:
                        open_el = eq.find('cim:Switch.open', namespaces)
                    equipment_open[mrid] = open_el.text.lower() == 'true' if open_el is not None else False

    cnode_list = []
    for cn_id, data in cnode_map.items():
        lat, lon = (0.0, 0.0)
        node_type = 'Bus'
        is_open = False
        for eq in data['equipments']:
            if eq in equipment_to_loc and equipment_to_loc[eq] != (0.0, 0.0):
                lat, lon = equipment_to_loc[eq]
            
            if eq in equipment_types:
                t = equipment_types[eq]
                if t == 'EnergyConsumer':
                    node_type = 'Meter'
                elif t == 'EnergySource' or t == 'Substation':
                    node_type = 'Substation'
                elif t == 'LoadBreakSwitch':
                    node_type = 'Switch'
                    is_open = equipment_open.get(eq, False)
                elif t == 'Breaker':
                    node_type = 'Breaker'
                    is_open = equipment_open.get(eq, False)
                elif t == 'PowerTransformer':
                    node_type = 'Transformer'
                    
        cnode_list.append((cn_id, node_type, data['name'], ['A', 'B', 'C'], lat, lon, is_open))
        
    print(f"Inserting {len(cnode_list)} nodes and {len(edges_to_insert)} edges into DuckDB...")
    
    conn.executemany(
        "INSERT INTO grid_nodes (node_id, node_type, name, phases_present, latitude, longitude, is_open) VALUES (?, ?, ?, ?, ?, ?, ?)",
        cnode_list
    )
    conn.executemany(
        "INSERT INTO grid_edges (edge_id, from_node_id, to_node_id, conductor_type, phases) VALUES (?, ?, ?, ?, ?)",
        edges_to_insert
    )
    
    print("Graph topology imported. Fixing any missing coordinates with random scatter offset for visualization...")
    conn.execute("""
        UPDATE grid_nodes 
        SET latitude = 34.0522 + (random() * 0.1 - 0.05),
            longitude = -118.2437 + (random() * 0.1 - 0.05)
        WHERE latitude = 0.0 AND longitude = 0.0
    """)

    conn.close()
    print("Done!")

if __name__ == '__main__':
    main()
