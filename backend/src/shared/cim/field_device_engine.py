"""FieldDeviceEngine — runs all registered classifiers and returns a merged map.

Usage::

    engine = FieldDeviceEngine(cim_manager)
    results = engine.run()
    # results: {"<mrid>": {"derived_type": "Recloser", "child_mrids": [...], "classifier_name": "Recloser"}}

The engine delegates all Neo4j I/O to ``CimModelManager.execute_cypher()``.
Classifiers are pulled from the central registry in ``classifiers.py`` — add a new
``FieldDeviceClassifier`` there and it will be picked up automatically here.
"""

import logging
from typing import Any

from src.shared.cim.classifiers import FIELD_DEVICE_CLASSIFIERS, FieldDeviceClassifier

logger = logging.getLogger(__name__)

_MRID_KEY = "IdentifiedObject.mRID"


class FieldDeviceEngine:
    """Runs all ``FIELD_DEVICE_CLASSIFIERS`` against Neo4j and produces a merged map.

    First-match-wins: if an anchor mRID is matched by multiple classifiers (rare but
    possible in unusual CIM data), the classifier that appears earliest in
    ``FIELD_DEVICE_CLASSIFIERS`` takes precedence.
    """

    def __init__(self, cim_manager: Any) -> None:
        """
        Args:
            cim_manager: A ``CimModelManager`` instance exposing ``execute_cypher()``.
        """
        self._manager = cim_manager

    def run(self) -> dict[str, dict]:
        """Execute all classifiers and return a merged classification map.

        Returns:
            ``{mrid: {"derived_type": str, "child_mrids": list[str], "classifier_name": str}}``
        """
        result: dict[str, dict] = {}
        for classifier in FIELD_DEVICE_CLASSIFIERS:
            try:
                matches = self._run_classifier(classifier)
                new_count = 0
                for mrid, entry in matches.items():
                    if mrid not in result:
                        result[mrid] = entry
                        new_count += 1
                logger.info(
                    "FieldDeviceEngine: classifier '%s' matched %d new device(s)",
                    classifier.name,
                    new_count,
                )
            except Exception as exc:
                logger.error(
                    "FieldDeviceEngine: classifier '%s' failed: %s",
                    classifier.name,
                    exc,
                )
        logger.info("FieldDeviceEngine: %d total field device(s) classified", len(result))
        return result

    def _run_classifier(self, classifier: FieldDeviceClassifier) -> dict[str, dict]:
        """Run a single classifier's ``collect_children_query`` and parse results."""
        rows = self._manager.execute_cypher(classifier.collect_children_query)
        out: dict[str, dict] = {}
        for row in rows:
            mrid = row.get("mrid")
            if not mrid:
                continue
            child_mrids = row.get("child_mrids") or []
            # Filter out None values that COLLECT() can produce for unmatched OPTIONAL nodes
            child_mrids = [m for m in child_mrids if m]
            out[mrid] = {
                "derived_type": classifier.derived_type,
                "child_mrids": child_mrids,
                "classifier_name": classifier.name,
            }
        return out
