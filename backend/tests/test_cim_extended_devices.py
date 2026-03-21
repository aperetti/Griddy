import pytest
from unittest.mock import MagicMock
from src.shared.cim.indexes import IndexBuilder
from src.shared.cim.topology import TopologyBuilder

class MockCimEntity:
    def __init__(self, mrid, name=None, **kwargs):
        self.mRID = mrid
        self.name = name
        for k, v in kwargs.items():
            setattr(self, k, v)

def test_extended_device_classification():
    cim = MagicMock()
    
    # Define CIM classes in mock
    cim.Fuse = type("Fuse", (), {})
    cim.Recloser = type("Recloser", (), {})
    cim.PowerTransformer = type("PowerTransformer", (), {})
    cim.RatioTapChanger = type("RatioTapChanger", (), {})
    cim.AssetInfo = type("AssetInfo", (), {})
    cim.Terminal = type("Terminal", (), {})
    cim.ConnectivityNode = type("ConnectivityNode", (), {})
    cim.PowerTransformerEnd = type("PowerTransformerEnd", (), {})
    cim.OperationalLimitSet = type("OperationalLimitSet", (), {})
    cim.CurrentLimit = type("CurrentLimit", (), {})
    
    # Create objects
    fuse = MockCimEntity("FUSE_1", "Main Street Fuse", open=True)
    recloser = MockCimEntity("REC_1", "South Recloser", normalOpen=False)
    
    # Regulator 1: Via RatioTapChanger
    reg1 = MockCimEntity("REG_1", "North Regulator")
    rtc1 = MockCimEntity("RTC_1", "Tap 1")
    pte1 = MockCimEntity("PTE_1", "End 1", PowerTransformer=reg1)
    setattr(rtc1, "TransformerEnd", pte1)
    
    # Regulator 2: Via AssetInfo
    ai2 = MockCimEntity("AI_2", "Regulator Asset Info")
    reg2 = MockCimEntity("REG_2", "Regulator 2", AssetInfo=ai2)
    
    # Operational Limits
    lset = MockCimEntity("LSET_1", "Limit Set 1", Equipment=recloser)
    clim = MockCimEntity("CLIM_1", "Current Limit 1", OperationalLimitSet=lset, value=600.0)
    
    # Normal Transformer
    trans = MockCimEntity("TRANS_1", "Normal Sub Trans")
    
    # Terminals and Connectivity Nodes
    cn1 = MockCimEntity("CN_1", "N1")
    cn2 = MockCimEntity("CN_2", "N2")
    
    term_fuse_1 = MockCimEntity("T_F1", ConductingEquipment=fuse, ConnectivityNode=cn1)
    term_fuse_2 = MockCimEntity("T_F2", ConductingEquipment=fuse, ConnectivityNode=cn2)
    
    term_rec_1 = MockCimEntity("T_R1", ConductingEquipment=recloser, ConnectivityNode=cn1)
    term_rec_2 = MockCimEntity("T_R2", ConductingEquipment=recloser, ConnectivityNode=cn2)
    
    term_reg1_1 = MockCimEntity("T_RG1_1", ConductingEquipment=reg1, ConnectivityNode=cn1)
    term_reg1_2 = MockCimEntity("T_RG1_2", ConductingEquipment=reg1, ConnectivityNode=cn2)
    
    term_reg2_1 = MockCimEntity("T_RG2_1", ConductingEquipment=reg2, ConnectivityNode=cn1)
    term_reg2_2 = MockCimEntity("T_RG2_2", ConductingEquipment=reg2, ConnectivityNode=cn2)
    
    # Graph structure
    graph = {
        cim.Fuse: {"FUSE_1": fuse},
        cim.Recloser: {"REC_1": recloser},
        cim.PowerTransformer: {
            "REG_1": reg1, 
            "REG_2": reg2, 
            "TRANS_1": trans
        },
        cim.RatioTapChanger: {"RTC_1": rtc1},
        cim.AssetInfo: {"AI_2": ai2},
        cim.Terminal: {
            "T_F1": term_fuse_1, "T_F2": term_fuse_2,
            "T_R1": term_rec_1, "T_R2": term_rec_2,
            "T_RG1_1": term_reg1_1, "T_RG1_2": term_reg1_2,
            "T_RG2_1": term_reg2_1, "T_RG2_2": term_reg2_2
        },
        cim.ConnectivityNode: {
            "CN_1": cn1,
            "CN_2": cn2
        },
        cim.OperationalLimitSet: {"LSET_1": lset},
        cim.CurrentLimit: {"CLIM_1": clim},
        cim.PowerTransformerEnd: {
            "PTE_1": pte1
        }
    }
    
    idx = IndexBuilder(cim, graph)
    idx.build()
    
    # Debug print if requested or for troubleshooting
    # print(f"Classes indexed: {set(t[0] for t in idx.equipment_index.values())}")
    # print(f"Equipment types: {idx.equipment_types.keys()}")
    
    # Verify classifications
    assert "FUSE_1" in idx.equipment_types, f"FUSE_1 missing from {idx.equipment_types.keys()}"
    assert idx.equipment_types["FUSE_1"] == "Fuse"
    assert idx.equipment_open["FUSE_1"] is True
    
    assert "REC_1" in idx.equipment_types, f"REC_1 missing from {idx.equipment_types.keys()}"
    assert idx.equipment_types["REC_1"] == "Recloser"
    assert idx.equipment_open["REC_1"] is False
    assert idx.equipment_current_limits.get("REC_1") == 600.0
    
    # REG_1 should be a regulator due to RatioTapChanger
    assert "REG_1" in idx.equipment_types, f"REG_1 missing from {idx.equipment_types.keys()}"
    assert idx.equipment_types["REG_1"] == "Regulator"
    assert idx.equipment_is_regulator["REG_1"] is True
    
    # REG_2 should be a regulator due to AssetInfo name
    assert "REG_2" in idx.equipment_types, f"REG_2 missing from {idx.equipment_types.keys()}"
    assert idx.equipment_types["REG_2"] == "Regulator"
    assert idx.equipment_is_regulator["REG_2"] is True
    
    # TRANS_1 should remain a PowerTransformer
    assert "TRANS_1" in idx.equipment_types
    assert idx.equipment_types["TRANS_1"] == "PowerTransformer"
    assert "REG_1" in idx.transformer_has_tap_changer
    
    # Verify Topology
    topo = TopologyBuilder(cim, graph, idx)
    topo.build()
    
    edges = {e["edge_id"]: e for e in topo.edges}
    assert "FUSE_1" in edges
    assert edges["FUSE_1"]["edge_type"] == "Fuse"
    assert edges["FUSE_1"]["is_open"] is True
    
    assert "REG_1" in edges
    assert edges["REG_1"]["edge_type"] == "Regulator"
    assert "REC_1" in edges
    assert edges["REC_1"]["edge_type"] == "Recloser"
