"""Unit tests for transformer phase extraction logic."""
from unittest.mock import MagicMock
from src.shared.cim.indexes import IndexBuilder
from src.shared.cim.helpers import _mrid_str

def test_power_transformer_phase_extraction():
    """Verify that IndexBuilder extracts phases from PowerTransformerEnd."""
    cim = MagicMock()
    # Mock CIM classes
    pt_cls = type("PowerTransformer", (), {})
    pte_cls = type("PowerTransformerEnd", (), {})
    cim.PowerTransformer = pt_cls
    cim.PowerTransformerEnd = pte_cls
    
    # Build a mock graph
    # PT1 has one end PTE1 with Phase A and Neutral
    pt1 = MagicMock(mRID="_pt1")
    pte1 = MagicMock(mRID="_pte1")
    pte1.endNumber = 1
    pte1.phases = "PhaseCode.AN"
    pte1.PowerTransformer = pt1
    pte1.TransformerTank = None
    
    graph = {
        pt_cls: {"_pt1": pt1},
        pte_cls: {"_pte1": pte1},
    }
    
    idx = IndexBuilder(cim, graph)
    
    # Execute phase indexing
    idx._build_phase_index()
    
    # PT1 mRID is normalized to PT1
    assert "PT1" in idx.eq_phases
    assert idx.eq_phases["PT1"] == ["A", "N"]
    assert idx.equipment_is_single_phase["PT1"] is True

def test_transformer_tank_phase_extraction():
    """Verify that IndexBuilder extracts phases from TransformerTankEnd."""
    cim = MagicMock()
    # Mock CIM classes
    tt_cls = type("TransformerTank", (), {})
    tte_cls = type("TransformerTankEnd", (), {})
    cim.TransformerTank = tt_cls
    cim.TransformerTankEnd = tte_cls
    
    # Build a mock graph
    # Tank1 has one end TTE1 with Phase B
    tank1 = MagicMock(mRID="_tank1")
    tte1 = MagicMock(mRID="_tte1")
    tte1.endNumber = 1
    tte1.phases = "PhaseCode.B"
    tte1.PowerTransformer = None
    tte1.TransformerTank = tank1
    
    graph = {
        tt_cls: {"_tank1": tank1},
        tte_cls: {"_tte1": tte1},
    }
    
    idx = IndexBuilder(cim, graph)
    
    # Execute phase indexing
    idx._build_phase_index()
    
    assert "TANK1" in idx.eq_phases
    # Note: Sorting might apply: A, B, C, N...
    assert idx.eq_phases["TANK1"] == ["B"]
    assert idx.equipment_is_single_phase["TANK1"] is True

def test_transformer_phase_sorting():
    """Ensure phases are sorted correctly for transformers."""
    cim = MagicMock()
    pt_cls = type("PowerTransformer", (), {})
    pte_cls = type("PowerTransformerEnd", (), {})
    cim.PowerTransformer = pt_cls
    cim.PowerTransformerEnd = pte_cls
    
    # 3-phase transformer on ends
    pt1 = MagicMock(mRID="_pt_3ph")
    pte1 = MagicMock(mRID="_pte_3ph", endNumber=1, phases="PhaseCode.ABC")
    pte1.PowerTransformer = pt1
    pte1.TransformerTank = None
    
    graph = {
        pt_cls: {"_pt_3ph": pt1},
        pte_cls: {"_pte_3ph": pte1},
    }
    
    idx = IndexBuilder(cim, graph)
    idx._build_phase_index()
    
    assert idx.eq_phases["PT_3PH"] == ["A", "B", "C"]
    assert idx.equipment_is_single_phase["PT_3PH"] is False

def test_line_phase_regression():
    """Verify that IndexBuilder doesn't crash on standard phase objects (regression test)."""
    cim = MagicMock()
    # Mock classes
    line_cls = type("ACLineSegment", (), {})
    lp_cls = type("ACLineSegmentPhase", (), {})
    cim.ACLineSegment = line_cls
    cim.ACLineSegmentPhase = lp_cls
    
    # Mock objects
    l1 = MagicMock(mRID="_line1")
    lp1 = MagicMock(mRID="_lp1", phase="PhaseCode.A")
    lp1.ACLineSegment = l1
    
    graph = {
        line_cls: {"_line1": l1},
        lp_cls: {"_lp1": lp1},
    }
    
    idx = IndexBuilder(cim, graph)
    # This was previously crashing with NameError: name 'pc' is not defined
    idx._build_phase_index()
    
    assert idx.eq_phases["LINE1"] == ["A"]

def test_transformer_tank_to_parent_mapping():
    """Verify that phases from TransformerTankEnd are propagated to the parent PowerTransformer."""
    cim = MagicMock()
    # Mock classes
    pt_cls = type("PowerTransformer", (), {})
    tank_cls = type("TransformerTank", (), {})
    end_cls = type("TransformerTankEnd", (), {})
    cim.PowerTransformer = pt_cls
    cim.TransformerTank = tank_cls
    cim.TransformerTankEnd = end_cls
    
    # Mock objects hierarchy: PT_1 -> Tank_1 -> End_1
    pt1 = MagicMock(mRID="_pt1")
    tank1 = MagicMock(mRID="_tank1")
    tank1.PowerTransformer = pt1
    end1 = MagicMock(mRID="_end1", endNumber=1, phases="PhaseCode.A")
    end1.PowerTransformer = None
    end1.TransformerTank = tank1
    
    graph = {
        pt_cls: {"_pt1": pt1},
        tank_cls: {"_tank1": tank1},
        end_cls: {"_end1": end1},
    }
    
    idx = IndexBuilder(cim, graph)
    idx._build_phase_index()
    
    # Verify both the tank and the parent transformer have the phase
    assert idx.eq_phases["TANK1"] == ["A"]
    assert idx.eq_phases["PT1"] == ["A"]
    assert idx.equipment_is_single_phase["PT1"] is True

def test_transformer_ordered_phases():
    """Verify that phases are extracted from orderedPhases attribute."""
    cim = MagicMock()
    tank_cls = type("TransformerTank", (), {})
    end_cls = type("TransformerTankEnd", (), {})
    cim.TransformerTank = tank_cls
    cim.TransformerTankEnd = end_cls
    
    tank1 = MagicMock(mRID="_tank_ordered")
    end1 = MagicMock(mRID="_end_ordered", endNumber=1, phases=None, orderedPhases="PhaseCode.CN")
    end1.PowerTransformer = None
    end1.TransformerTank = tank1
    
    graph = {
        tank_cls: {"_tank_ordered": tank1},
        end_cls: {"_end_ordered": end1},
    }
    
    idx = IndexBuilder(cim, graph)
    idx._build_phase_index()
    
    assert idx.eq_phases["TANK_ORDERED"] == ["C", "N"]

def test_transformer_voltage_priority():
    """Verify that the end with higher voltage is preferred over endNumber=1."""
    cim = MagicMock()
    pt_cls = type("PowerTransformer", (), {})
    pte_cls = type("PowerTransformerEnd", (), {})
    cim.PowerTransformer = pt_cls
    cim.PowerTransformerEnd = pte_cls
    
    pt1 = MagicMock(mRID="_pt_volt")
    
    # End 1: Low Voltage (0.24 kV)
    end1 = MagicMock(mRID="_end1", endNumber=1, phases="PhaseCode.B", ratedU=0.24)
    end1.PowerTransformer = pt1
    
    # End 2: High Voltage (7.2 kV) - Should be preferred
    end2 = MagicMock(mRID="_end2", endNumber=2, phases="PhaseCode.A", ratedU=7.2)
    end2.PowerTransformer = pt1
    
    graph = {
        pt_cls: {"_pt_volt": pt1},
        pte_cls: {"_end1": end1, "_end2": end2},
    }
    
    idx = IndexBuilder(cim, graph)
    idx._build_phase_index()
    
    # Should pick Phase A (from the 7.2kV end)
    assert idx.eq_phases["PT_VOLT"] == ["A"]
