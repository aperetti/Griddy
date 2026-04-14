import logging
import inspect
import sys
import typing
from typing import Dict, List, Set, Any, Optional
import os

logger = logging.getLogger(__name__)

class CimProfileService:
    """Provides metadata about the CIM profile (statically extracted from cimgraph).
    
    Populated at server startup to ensure the UI has a baseline schema
    even if no grid models are loaded yet.
    """
    
    _instance: Optional["CimProfileService"] = None

    def __init__(self, profile_name: str = "cimhub_2023"):
        self.profile_name = profile_name
        self.classes: Dict[str, Any] = {} # class_name -> class_obj
        self.schema: Dict[str, Dict[str, Any]] = {} # baseline schema for UI
        self._initialized = False
        # class_name -> set of adjacent class names (forward + reverse UML associations)
        self._adjacency: Dict[str, Set[str]] = {}
        
        # Mapping of common classes we want to ensure are ALWAYS in the baseline
        self.TARGET_CLASSES = {
            "PowerTransformer", "TransformerTank", "Fuse", "Recloser",
            "Breaker", "LoadBreakSwitch", "Disconnector", "EnergyConsumer",
            "EnergySource", "LinearShuntCompensator", "ACLineSegment",
            "ConnectivityNode", "Terminal", "Asset", "AssetInfo"
        }

    @classmethod
    def get_instance(cls) -> "CimProfileService":
        if cls._instance is None:
            profile = os.getenv("CIMG_CIM_PROFILE", "cimhub_2023")
            cls._instance = CimProfileService(profile)
        return cls._instance

    def initialize(self):
        """Pre-scans the CIM profile library to build the static metadata cache."""
        if self._initialized:
            return
            
        logger.info("Initializing CIM Profile Service (profile: %s)...", self.profile_name)
        
        try:
            # Import cimgraph to ensure environment is setup
            import cimgraph.data_profile.cimhub_2023 as profile
            
            # Extract all classes from the profile module
            for name, obj in inspect.getmembers(profile):
                if inspect.isclass(obj):
                    try:
                        self.classes[name] = obj
                        
                        # Use an instance to extract attributes
                        inst = obj()
                        attrs = dir(inst)
                        
                        # Filter for useful attributes (exclude noise)
                        clean_attrs = sorted([
                            a for a in attrs 
                            if not a.startswith("_") 
                            and a not in {"to_dict", "to_json", "uri", "uuid", "mRID"}
                        ])
                        
                        # Ensure mRID is always top of the list
                        clean_attrs = ["mRID"] + clean_attrs

                        # Store as objects (same shape as manager.get_cim_schema)
                        # so ConnectivityNode / Terminal / etc. work in the frontend
                        attr_objects = [
                            {"name": a, "type": "string", "is_complex": False}
                            for a in clean_attrs
                        ]

                        self.schema[name] = {
                            "class": name,
                            "attributes": attr_objects,
                            "count": 0 # Default for baseline
                        }
                    except Exception:
                        # Skip if class can't be instantiated (rare metadata noise)
                        continue
                
            logger.info("CIM Profile loaded: %d classes parsed.", len(self.schema))
            self._build_adjacency_index()
            self._initialized = True
            
        except ImportError as e:
            logger.error("Failed to load CIM profile: %s", e)
        except Exception as e:
            logger.error("Error during CIM profile initialization: %s", e)

    def _build_adjacency_index(self) -> None:
        """Build forward + reverse UML association index from cimgraph type hints.

        Only considers classes that subclass IdentifiedObject (actual graph nodes),
        which excludes CIMUnit quantity types and enums.
        """
        node_classes: Set[str] = {
            name for name, cls in self.classes.items()
            if any(c.__name__ == "IdentifiedObject" for c in getattr(cls, "__mro__", []))
        }

        # Forward: class → classes it directly references
        forward: Dict[str, Set[str]] = {name: set() for name in node_classes}
        for name, cls in self.classes.items():
            if name not in node_classes:
                continue
            try:
                module = sys.modules.get(cls.__module__)
                globalns = vars(module) if module else {}
                
                # Standard resolution
                hints = typing.get_type_hints(cls, globalns=globalns)
                
                # Fallback for shadowed types (e.g. RatioTapChanger: Optional[RatioTapChanger])
                # which can resolve to NoneType in some environments.
                raw_annos = getattr(cls, "__annotations__", {})
                
                import re

                for fname, ftype in hints.items():
                    if fname.startswith("_"):
                        continue
                    
                    targets = []
                    for arg in (typing.get_args(ftype) or [ftype]):
                        ref_name = getattr(arg, "__name__", None)
                        if ref_name and ref_name != "NoneType":
                            targets.append(ref_name)
                    
                    # If no valid targets found via get_type_hints, check raw annotation string
                    if not targets and fname in raw_annos:
                        raw_val = str(raw_annos[fname])
                        # Match the last word before optional closing brackets/spaces
                        match = re.search(r"(\w+)[\]\s]*$", raw_val)
                        if match:
                            targets.append(match.group(1))

                    for ref_name in targets:
                        if ref_name and ref_name in node_classes and ref_name != name:
                            forward[name].add(ref_name)
                            # Also expand to subclasses: if PEC references PowerElectronicsUnit,
                            # include BatteryUnit/PhotoVoltaicUnit etc. (polymorphic subtypes)
                            for sub_name, sub_cls in self.classes.items():
                                if sub_name not in node_classes or sub_name == name:
                                    continue
                                if any(c.__name__ == ref_name for c in sub_cls.__mro__[1:]):
                                    forward[name].add(sub_name)
            except Exception:
                continue

        # Build symmetric adjacency (A adjacent B ↔ B adjacent A)
        self._adjacency = {name: set() for name in node_classes}
        for name, targets in forward.items():
            for target in targets:
                self._adjacency[name].add(target)
                self._adjacency.setdefault(target, set()).add(name)

        logger.info("CIM adjacency index built: %d node classes.", len(self._adjacency))

    def get_adjacent_classes(self, class_name: str) -> List[str]:
        """Return CIM classes adjacent to class_name via UML associations.

        Uses the pre-built schema index so this is O(1) after initialization.
        Returns an empty list for unknown classes.
        """
        if not self._initialized:
            self.initialize()
        return sorted(self._adjacency.get(class_name, set()))

    def get_baseline_schema(self) -> Dict[str, Dict[str, Any]]:
        """Returns the full schema metadata extracted from the profile."""
        if not self._initialized:
            self.initialize()
        return self.schema

    def get_conducting_equipment_classes(self) -> List[str]:
        """Return all CIM classes that are subclasses of ConductingEquipment in the profile.

        These are the classes that connect to the grid topology via Terminal nodes
        and are valid as the first user-defined hop after ConnectivityNode → Terminal.
        """
        if not self._initialized:
            self.initialize()
        result = []
        for name, cls_obj in self.classes.items():
            try:
                mro_names = {c.__name__ for c in cls_obj.__mro__}
                if "ConductingEquipment" in mro_names and name != "ConductingEquipment":
                    result.append(name)
            except Exception:
                continue
        return sorted(result)

    def get_rootable_classes(self) -> List[str]:
        """Return all CIM classes that can have a Location relationship.
        
        In the CIM profile, these are typically subclasses of PowerSystemResource.
        Used to populate the starting class list for display rules.
        """
        if not self._initialized:
            self.initialize()
        result = []
        for name, cls_obj in self.classes.items():
            try:
                mro_names = {c.__name__ for c in cls_obj.__mro__}
                if "PowerSystemResource" in mro_names and name != "PowerSystemResource":
                    result.append(name)
            except Exception:
                continue
        return sorted(result)

    def get_static_connections(self, class_name: str) -> List[str]:
        """Returns types that are commonly associated with the given class.
        
        Baseline assumptions for target display rules (connectivity-based).
        """
        # If the class name is missing or unknown, return default
        if not class_name or class_name not in self.schema:
            return ["ConnectivityNode"]
            
        # Target connectivity: ACLineSegment connects to equipment
        if class_name == "ACLineSegment":
            return sorted([
                "ConnectivityNode", "Fuse", "Breaker", "Disconnector", 
                "Recloser", "LoadBreakSwitch", "PowerTransformer", 
                "EnergyConsumer", "LinearShuntCompensator", "Capacitor"
            ])
            
        # Transformers have Tank, Ends, and adjacent nodes
        if class_name == "PowerTransformer":
            return sorted(["ConnectivityNode", "TransformerTank", "PowerTransformerEnd", "Asset"])
            
        # Default fallback
        return sorted(["ConnectivityNode", "Asset"])
