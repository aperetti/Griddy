import pytest
from unittest.mock import MagicMock
from src.shared.cim.indexes import IndexBuilder
from src.shared.cim.topology import TopologyBuilder
from src.grid.display_rule_engine import DisplayRuleEngine

def test_tap_changer_indexing_and_topology():
    # 1. Setup mock CIM objects
    class MockCim:
        class PowerTransformer: pass
        class PowerTransformerEnd: pass
        class RatioTapChanger: pass
        class Terminal: pass
        class ConnectivityNode: pass
        class PositionPoint: pass

    cim = MockCim()
    
    # Create PowerTransformer
    pt = MagicMock()
    pt.mRID = "PT_1"
    pt.name = "Transformer 1"
    
    # Create PowerTransformerEnd
    pte = MagicMock()
    pte.mRID = "PTE_1"
    pte.endNumber = 1
    pte.PowerTransformer = pt
    pte.ratedS = 100000.0 # 100 kVA
    
    # Create RatioTapChanger and link to PTE
    rtc = MagicMock()
    rtc.mRID = "RTC_1"
    rtc.step = 10.0
    rtc.highStep = 32.0
    rtc.lowStep = 1.0
    rtc.neutralStep = 16.0
    rtc.TransformerEnd = pte 
    
    # Create Connectivity Nodes
    cn1 = MagicMock()
    cn1.mRID = "CN_1"
    cn2 = MagicMock()
    cn2.mRID = "CN_2"
    
    # Create Terminals linking PT to CNs
    t1 = MagicMock()
    t1.mRID = "T_1"
    t1.ConductingEquipment = pt
    t1.ConnectivityNode = cn1
    
    t2 = MagicMock()
    t2.mRID = "T_2"
    t2.ConductingEquipment = pt
    t2.ConnectivityNode = cn2

    # Map for graph lookup
    graph = {
        cim.PowerTransformer: {"PT_1": pt},
        cim.PowerTransformerEnd: {"PTE_1": pte},
        cim.RatioTapChanger: {"RTC_1": rtc},
        cim.Terminal: {"T_1": t1, "T_2": t2},
        cim.ConnectivityNode: {"CN_1": cn1, "CN_2": cn2},
        cim.PositionPoint: {}
    }

    # 2. Run IndexBuilder
    idx = IndexBuilder(cim, graph)
    idx.build()
    
    assert idx.transformer_has_tap_changer.get("PT_1") is True
    assert idx.transformer_tap_changers["PT_1"]["step"] == 10.0
    assert idx.transformer_kva["PT_1"] == 100.0
    
    # 3. Run TopologyBuilder
    topo = TopologyBuilder(cim, graph, idx)
    topo.build()
    
    # Find the edge for the transformer
    pt_edge = next(e for e in topo.edges if e["edge_id"] == "PT_1")
    assert "ratio_tap_changer" in pt_edge
    assert pt_edge["ratio_tap_changer"]["step"] == 10.0
    assert pt_edge["ratio_tap_changer"]["highStep"] == 32.0
    
    # 4. Verify Rule Engine can match it using nested path
    # We bypass DB loading by calling _check_conditions directly
    engine = DisplayRuleEngine(":memory:") 
    
    # Condition: Highlight if tap step is exactly 10
    conditions = {
        "logical_op": "AND",
        "conditions": [
            {"path": "ratio_tap_changer.step", "op": "==", "value": 10.0}
        ]
    }
    
    # _check_conditions expects a list of objects (the edge itself in this case)
    assert engine._check_conditions(conditions, [pt_edge]) is True
    
    # Condition: Highlight if at tap limit
    conditions_limit = {
        "logical_op": "AND",
        "conditions": [
            {"path": "ratio_tap_changer.step", "op": "==", "value": 32.0}
        ]
    }
    assert engine._check_conditions(conditions_limit, [pt_edge]) is False
    
    # Set step to limit and re-check
    pt_edge["ratio_tap_changer"]["step"] = 32.0
    assert engine._check_conditions(conditions_limit, [pt_edge]) is True

    print("Success: Transformer tap changer properties and rules verified.")

if __name__ == "__main__":
    test_tap_changer_indexing_and_topology()
