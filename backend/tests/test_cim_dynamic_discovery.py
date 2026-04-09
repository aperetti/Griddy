import pytest
from unittest.mock import MagicMock
from src.shared.cim.manager import CimModelManager
from src.shared.cim.indexes import IndexBuilder
from src.shared.cim.topology import TopologyBuilder

class MockCimEntity:
    def __init__(self, mrid, name=None, **kwargs):
        self.mRID = mrid
        self.name = name
        for k, v in kwargs.items():
            setattr(self, k, v)

def test_dynamic_label_discovery():
    # 1. Mock Neo4j driver and session
    mock_session = MagicMock()
    mock_driver = MagicMock()
    mock_driver.get_server_info.return_value.version = "5.0.0"
    mock_driver.session.return_value.__enter__.return_value = mock_session
    
    # Simulate finding PowerElectronicsConnection and ACLineSegment in DB
    mock_session.run.return_value = [
        {"label": "PowerElectronicsConnection"},
        {"label": "ACLineSegment"},
        {"label": "ConnectivityNode"},
        {"label": "Terminal"}
    ]
    
    manager = CimModelManager()
    labels = manager._discover_labels(mock_driver)
    
    assert "PowerElectronicsConnection" in labels
    assert "ACLineSegment" in labels

def test_topology_builder_terminal_count_classification():
    cim = MagicMock()
    # Define classes
    cim.ConnectivityNode = type("ConnectivityNode", (), {})
    cim.Terminal = type("Terminal", (), {})
    cim.PowerElectronicsConnection = type("PowerElectronicsConnection", (), {})
    cim.ACLineSegment = type("ACLineSegment", (), {})
    
    # Objects
    cn1 = MockCimEntity("CN_1", "Node 1")
    cn2 = MockCimEntity("CN_2", "Node 2")
    
    # 1-terminal equipment (Should be ATTACHED)
    pec = MockCimEntity("PEC_1", "Inverter")
    t1 = MockCimEntity("T1", ConductingEquipment=pec, ConnectivityNode=cn1)
    
    # 2-terminal equipment (Should be EDGE)
    line = MockCimEntity("LINE_1", "Underground Line")
    t2 = MockCimEntity("T2", ConductingEquipment=line, ConnectivityNode=cn1)
    t3 = MockCimEntity("T3", ConductingEquipment=line, ConnectivityNode=cn2)
    
    graph = {
        cim.ConnectivityNode: {"CN_1": cn1, "CN_2": cn2},
        cim.PowerElectronicsConnection: {"PEC_1": pec},
        cim.ACLineSegment: {"LINE_1": line},
        cim.Terminal: {"T1": t1, "T2": t2, "T3": t3}
    }
    
    idx = IndexBuilder(cim, graph)
    idx.build()
    
    # Verify indexes
    assert idx.equipment_types["PEC_1"] == "PowerElectronicsConnection"
    assert idx.equipment_types["LINE_1"] == "ACLineSegment"
    
    # Verify topology
    topo = TopologyBuilder(cim, graph, idx)
    topo.build()
    
    # Check nodes
    nodes = {n["node_id"]: n for n in topo.nodes}
    assert "PEC_1" in [a["mrid"] for a in nodes["CN_1"]["attached_equipment"]]
    
    # Check edges
    edges = {e["edge_id"]: e for e in topo.edges}
    assert "LINE_1" in edges
    assert edges["LINE_1"]["from_node_id"] == "CN_1"
    assert edges["LINE_1"]["to_node_id"] == "CN_2"

if __name__ == "__main__":
    pytest.main([__file__])
