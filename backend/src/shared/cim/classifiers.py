"""Field Device Classifier Registry.

This is the **only file that needs to change** when a new logical FieldDevice type
is added to the grid model. Each ``FieldDeviceClassifier`` is a pure data object:

- ``name``               — human-readable label (used as a key in rule conditions)
- ``derived_type``       — string tag written to matched nodes, e.g. "Recloser"
- ``target_cim_class``   — CIM label of the anchor node in Neo4j
- ``exists_pattern``     — Cypher fragment used inside EXISTS { ... }; references `n`
                           as the anchor node variable
- ``collect_children_query`` — complete Cypher query returning:
                           * ``mrid``        (anchor IdentifiedObject.mRID)
                           * ``child_mrids`` (COLLECT of all sub-component mRIDs)
                           Used by FieldDeviceEngine to store cluster membership for
                           auditability (recommended by CIM data-integrity best practice).
- ``description``        — plain-English explanation for the rule editor UI

──────────────────────────────────────────────────────────────────────────────────
HOW TO ADD A NEW DEVICE TYPE
──────────────────────────────────────────────────────────────────────────────────
1. Define a new ``FieldDeviceClassifier`` instance below.
2. Append it to ``FIELD_DEVICE_CLASSIFIERS``.
3. Done — no other files need to change.

The ``exists_pattern`` must be a valid Cypher path pattern that can be dropped
verbatim into:
    EXISTS { <exists_pattern> }
where ``n`` is already bound to a node of type ``target_cim_class``.

The ``collect_children_query`` must end with:
    RETURN n.`IdentifiedObject.mRID` AS mrid,
           collect(<child_var>.`IdentifiedObject.mRID`) AS child_mrids
"""

from dataclasses import dataclass, field


@dataclass(frozen=True)
class FieldDeviceClassifier:
    """Declarative specification of a logical FieldDevice cluster type."""

    name: str
    """Human-readable name used as the classifier key, e.g. 'Recloser'."""

    derived_type: str
    """Tag applied to matched anchor mRIDs, e.g. 'Recloser'."""

    target_cim_class: str
    """CIM label of the anchor node in Neo4j, e.g. 'ProtectedSwitch'."""

    exists_pattern: str
    """Cypher path fragment for EXISTS subquery. References 'n' as the anchor."""

    collect_children_query: str
    """Full Cypher query returning mrid + child_mrids for cluster membership."""

    description: str = ""
    """Plain-English description for the rule editor UI."""


# ── Classifier Definitions ────────────────────────────────────────────────────

_RECLOSER = FieldDeviceClassifier(
    name="Recloser",
    derived_type="Recloser",
    target_cim_class="ProtectedSwitch",
    exists_pattern=(
        "(n)-[:HAS_PROTECTION]->(pe:ProtectionEquipment)"
        "-[:HAS_SEQUENCE]->(rs:RecloseSequence)"
    ),
    collect_children_query="""\
MATCH (n:ProtectedSwitch)-[:HAS_PROTECTION]->(pe:ProtectionEquipment)
      -[:HAS_SEQUENCE]->(rs:RecloseSequence)
RETURN n.`IdentifiedObject.mRID` AS mrid,
       collect(pe.`IdentifiedObject.mRID`) + collect(rs.`IdentifiedObject.mRID`) AS child_mrids
""",
    description=(
        "A ProtectedSwitch linked to a ProtectionEquipment node that has at least one "
        "RecloseSequence, indicating automatic reclosing capability. "
        "Differentiates a Recloser from a plain Breaker."
    ),
)

_VOLTAGE_REGULATOR = FieldDeviceClassifier(
    name="VoltageRegulator",
    derived_type="VoltageRegulator",
    target_cim_class="PowerTransformer",
    exists_pattern=(
        "(n)-[:HAS_END]->(pte:PowerTransformerEnd)"
        "-[:HAS_TAP]->(rtc:RatioTapChanger)"
    ),
    collect_children_query="""\
MATCH (n:PowerTransformer)-[:HAS_END]->(pte:PowerTransformerEnd)
      -[:HAS_TAP]->(rtc:RatioTapChanger)
OPTIONAL MATCH (rtc)-[:HAS_CONTROL]->(tcc:TapChangerControl)
RETURN n.`IdentifiedObject.mRID` AS mrid,
       collect(pte.`IdentifiedObject.mRID`)
       + collect(rtc.`IdentifiedObject.mRID`)
       + collect(tcc.`IdentifiedObject.mRID`) AS child_mrids
""",
    description=(
        "A PowerTransformer whose PowerTransformerEnd has a RatioTapChanger, "
        "indicating voltage regulation capability (step voltage regulator or LTC). "
        "Optionally linked to a TapChangerControl for SCADA telemetry."
    ),
)

_AUTOMATED_SWITCH = FieldDeviceClassifier(
    name="AutomatedSwitch",
    derived_type="AutomatedSwitch",
    target_cim_class="Switch",
    exists_pattern=(
        "(n)-[:HAS_TERMINAL]->(t:Terminal)"
        "-[:HAS_MEASUREMENT]->(m:Measurement)"
    ),
    collect_children_query="""\
MATCH (n:Switch)-[:HAS_TERMINAL]->(t:Terminal)-[:HAS_MEASUREMENT]->(m:Measurement)
RETURN n.`IdentifiedObject.mRID` AS mrid,
       collect(t.`IdentifiedObject.mRID`) + collect(m.`IdentifiedObject.mRID`) AS child_mrids
""",
    description=(
        "A Switch that has at least one Terminal with an associated Measurement node "
        "(Discrete or Analog), indicating telemetry/SCADA integration. "
        "Flagged as Automated for FLISR analysis."
    ),
)

_CAPACITOR_BANK = FieldDeviceClassifier(
    name="CapacitorBank",
    derived_type="CapacitorBank",
    target_cim_class="ShuntCompensator",
    exists_pattern=(
        "(n)-[:HAS_CONTROL]->(rc:RegulatingControl)"
    ),
    collect_children_query="""\
MATCH (n:ShuntCompensator)
OPTIONAL MATCH (n)-[:HAS_CONTROL]->(rc:RegulatingControl)
WITH n, rc
WHERE rc IS NOT NULL
RETURN n.`IdentifiedObject.mRID` AS mrid,
       collect(rc.`IdentifiedObject.mRID`) AS child_mrids
""",
    description=(
        "A ShuntCompensator (capacitor bank) that has an associated RegulatingControl node, "
        "indicating it is a switched (rather than fixed) capacitor bank. "
        "Fixed banks have no RegulatingControl."
    ),
)


# ── Public Registry ───────────────────────────────────────────────────────────

FIELD_DEVICE_CLASSIFIERS: list[FieldDeviceClassifier] = [
    _RECLOSER,
    _VOLTAGE_REGULATOR,
    _AUTOMATED_SWITCH,
    _CAPACITOR_BANK,
]
"""Ordered list of all registered FieldDevice classifiers.

Order matters: when a single anchor node matches multiple classifiers the FIRST
matching classifier wins (e.g. a ProtectedSwitch that is also a Recloser is tagged
'Recloser', not 'Switch').
"""

# Fast lookup by name for CypherRuleBuilder
CLASSIFIER_BY_NAME: dict[str, FieldDeviceClassifier] = {
    c.name: c for c in FIELD_DEVICE_CLASSIFIERS
}
