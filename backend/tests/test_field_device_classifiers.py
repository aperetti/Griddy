"""Unit tests for the FieldDevice classification engine.

Tests cover:
1. Classifier registry completeness and structural validity
2. CypherRuleBuilder integration — field_device_classifier leaf type
3. FieldDeviceEngine result merging (first-match-wins)
4. API classifier listing (no Neo4j required)
"""

import pytest
from unittest.mock import MagicMock
from src.shared.cim.classifiers import (
    FIELD_DEVICE_CLASSIFIERS,
    CLASSIFIER_BY_NAME,
    FieldDeviceClassifier,
)
from src.shared.cim.field_device_engine import FieldDeviceEngine
from src.grid.cypher_builder import CypherRuleBuilder


# ── Registry tests ────────────────────────────────────────────────────────────

def test_classifier_registry_not_empty():
    assert len(FIELD_DEVICE_CLASSIFIERS) > 0


def test_classifier_names_unique():
    names = [c.name for c in FIELD_DEVICE_CLASSIFIERS]
    assert len(names) == len(set(names)), "Classifier names must be unique"


def test_classifier_by_name_matches_list():
    for c in FIELD_DEVICE_CLASSIFIERS:
        assert CLASSIFIER_BY_NAME[c.name] is c


@pytest.mark.parametrize("classifier", FIELD_DEVICE_CLASSIFIERS)
def test_classifier_required_fields(classifier: FieldDeviceClassifier):
    assert classifier.name
    assert classifier.derived_type
    assert classifier.target_cim_class
    assert classifier.exists_pattern
    assert classifier.collect_children_query


@pytest.mark.parametrize("classifier", FIELD_DEVICE_CLASSIFIERS)
def test_collect_children_query_has_required_columns(classifier: FieldDeviceClassifier):
    """The collect_children_query must return 'mrid' and 'child_mrids' columns."""
    q = classifier.collect_children_query
    assert "AS mrid" in q, f"{classifier.name}: missing 'AS mrid' in collect_children_query"
    assert "AS child_mrids" in q, f"{classifier.name}: missing 'AS child_mrids' in collect_children_query"


@pytest.mark.parametrize("classifier", FIELD_DEVICE_CLASSIFIERS)
def test_exists_pattern_references_n(classifier: FieldDeviceClassifier):
    """The exists_pattern must reference 'n' as the anchor variable."""
    assert "(n)" in classifier.exists_pattern, (
        f"{classifier.name}: exists_pattern must reference anchor variable 'n'"
    )


# ── Specific classifiers ──────────────────────────────────────────────────────

def test_recloser_classifier_present():
    assert "Recloser" in CLASSIFIER_BY_NAME


def test_voltage_regulator_classifier_present():
    assert "VoltageRegulator" in CLASSIFIER_BY_NAME


def test_automated_switch_classifier_present():
    assert "AutomatedSwitch" in CLASSIFIER_BY_NAME


def test_capacitor_bank_classifier_present():
    assert "CapacitorBank" in CLASSIFIER_BY_NAME


def test_recloser_target_class():
    assert CLASSIFIER_BY_NAME["Recloser"].target_cim_class == "ProtectedSwitch"


def test_voltage_regulator_target_class():
    assert CLASSIFIER_BY_NAME["VoltageRegulator"].target_cim_class == "PowerTransformer"


def test_automated_switch_target_class():
    assert CLASSIFIER_BY_NAME["AutomatedSwitch"].target_cim_class == "Switch"


def test_capacitor_bank_target_class():
    assert CLASSIFIER_BY_NAME["CapacitorBank"].target_cim_class == "ShuntCompensator"


# ── CypherRuleBuilder integration ────────────────────────────────────────────

def test_field_device_classifier_leaf_recloser():
    builder = CypherRuleBuilder()
    conditions = {
        "target_class": "ProtectedSwitch",
        "conditions": [
            {"type": "field_device_classifier", "classifier_name": "Recloser"}
        ],
    }
    query, params, warnings = builder.build_rule_query(conditions, "ProtectedSwitch")
    assert warnings == [], f"Unexpected warnings: {warnings}"
    assert "EXISTS" in query
    assert "HAS_PROTECTION" in query
    assert "RecloseSequence" in query
    assert "MATCH (n:ProtectedSwitch)" in query
    assert "AS mrid" in query


def test_field_device_classifier_leaf_voltage_regulator():
    builder = CypherRuleBuilder()
    conditions = {
        "target_class": "PowerTransformer",
        "conditions": [
            {"type": "field_device_classifier", "classifier_name": "VoltageRegulator"}
        ],
    }
    query, params, warnings = builder.build_rule_query(conditions, "PowerTransformer")
    assert warnings == []
    assert "RatioTapChanger" in query


def test_field_device_classifier_unknown_name_produces_warning():
    builder = CypherRuleBuilder()
    conditions = {
        "target_class": "Switch",
        "conditions": [
            {"type": "field_device_classifier", "classifier_name": "NonExistentDevice"}
        ],
    }
    query, params, warnings = builder.build_rule_query(conditions, "Switch")
    assert any("NonExistentDevice" in w for w in warnings)


def test_field_device_classifier_class_mismatch_produces_warning():
    """Using a classifier against a mismatched CIM class should warn but not crash."""
    builder = CypherRuleBuilder()
    conditions = {
        "target_class": "Switch",  # Wrong class for Recloser (expects ProtectedSwitch)
        "conditions": [
            {"type": "field_device_classifier", "classifier_name": "Recloser"}
        ],
    }
    query, params, warnings = builder.build_rule_query(conditions, "Switch")
    assert any("target_class" in w or "ProtectedSwitch" in w for w in warnings)
    # Query should still be generated
    assert "EXISTS" in query


def test_field_device_classifier_combined_with_property_condition():
    """Classifier condition can be ANDed with standard property conditions."""
    builder = CypherRuleBuilder()
    conditions = {
        "target_class": "ProtectedSwitch",
        "logical_op": "AND",
        "conditions": [
            {"type": "field_device_classifier", "classifier_name": "Recloser"},
            {"path": "IdentifiedObject.name", "op": "contains", "value": "RC"},
        ],
    }
    query, params, warnings = builder.build_rule_query(conditions, "ProtectedSwitch")
    assert warnings == []
    assert "EXISTS" in query
    assert "CONTAINS" in query


# ── FieldDeviceEngine tests ───────────────────────────────────────────────────

def _make_mock_manager(responses: dict[str, list[dict]]) -> MagicMock:
    """Create a mock CimModelManager whose execute_cypher returns per-query responses.

    ``responses`` maps a substring of the query to the rows to return.
    If no substring matches, returns [].
    """
    manager = MagicMock()

    def _execute_cypher(query, params=None):
        for substring, rows in responses.items():
            if substring in query:
                return rows
        return []

    manager.execute_cypher.side_effect = _execute_cypher
    return manager


def test_field_device_engine_basic():
    mock_manager = _make_mock_manager({
        "ProtectedSwitch": [
            {"mrid": "mrid-recloser-1", "child_mrids": ["mrid-pe-1", "mrid-rs-1"]},
        ],
    })
    engine = FieldDeviceEngine(mock_manager)
    results = engine.run()
    assert "mrid-recloser-1" in results
    assert results["mrid-recloser-1"]["derived_type"] == "Recloser"
    assert "mrid-pe-1" in results["mrid-recloser-1"]["child_mrids"]


def test_field_device_engine_first_match_wins():
    """If same mRID matches two classifiers, the first in FIELD_DEVICE_CLASSIFIERS wins."""
    # Both ProtectedSwitch and Switch queries return the same mRID
    mock_manager = _make_mock_manager({
        "ProtectedSwitch": [{"mrid": "mrid-shared", "child_mrids": []}],
        "Switch": [{"mrid": "mrid-shared", "child_mrids": []}],
    })
    engine = FieldDeviceEngine(mock_manager)
    results = engine.run()
    assert results["mrid-shared"]["classifier_name"] == "Recloser"


def test_field_device_engine_filters_none_child_mrids():
    """OPTIONAL MATCH can produce None entries in child_mrids — engine must strip them."""
    mock_manager = _make_mock_manager({
        "ShuntCompensator": [
            {"mrid": "mrid-cap-1", "child_mrids": ["mrid-rc-1", None, None]},
        ],
    })
    engine = FieldDeviceEngine(mock_manager)
    results = engine.run()
    assert results["mrid-cap-1"]["child_mrids"] == ["mrid-rc-1"]


def test_field_device_engine_skips_rows_without_mrid():
    mock_manager = _make_mock_manager({
        "ProtectedSwitch": [
            {"mrid": None, "child_mrids": []},
            {"mrid": "", "child_mrids": []},
            {"mrid": "mrid-valid", "child_mrids": []},
        ],
    })
    engine = FieldDeviceEngine(mock_manager)
    results = engine.run()
    assert len(results) == 1
    assert "mrid-valid" in results


def test_field_device_engine_handles_execute_cypher_exception(caplog):
    """Engine should log and continue if a classifier's query raises."""
    manager = MagicMock()
    manager.execute_cypher.side_effect = Exception("Neo4j unavailable")
    engine = FieldDeviceEngine(manager)
    import logging
    with caplog.at_level(logging.ERROR):
        results = engine.run()
    assert results == {}
    assert any("failed" in r.message for r in caplog.records)


# ── API classifier listing ────────────────────────────────────────────────────

def test_classifier_listing_api_format():
    """Verify the data shape returned by the /classifiers endpoint logic."""
    from src.shared.cim.classifiers import FIELD_DEVICE_CLASSIFIERS
    listing = [
        {
            "name": c.name,
            "derived_type": c.derived_type,
            "target_cim_class": c.target_cim_class,
            "description": c.description,
        }
        for c in FIELD_DEVICE_CLASSIFIERS
    ]
    assert len(listing) == len(FIELD_DEVICE_CLASSIFIERS)
    for item in listing:
        assert "name" in item
        assert "derived_type" in item
        assert "target_cim_class" in item
        assert "description" in item
