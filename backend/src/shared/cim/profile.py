import logging
import inspect
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
        
        # Mapping of common classes we want to ensure are ALWAYS in the baseline
        self.TARGET_CLASSES = {
            "PowerTransformer", "TransformerTank", "Fuse", "Recloser", 
            "Breaker", "LoadBreakSwitch", "Disconnector", "EnergyConsumer", 
            "EnergySource", "LinearShuntCompensator", "ACLineSegment", 
            "ConnectivityNode", "Asset", "AssetInfo"
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
                        
                        self.schema[name] = {
                            "class": name,
                            "attributes": clean_attrs,
                            "count": 0 # Default for baseline
                        }
                    except Exception:
                        # Skip if class can't be instantiated (rare metadata noise)
                        continue
                
            logger.info("CIM Profile loaded: %d classes parsed.", len(self.schema))
            self._initialized = True
            
        except ImportError as e:
            logger.error("Failed to load CIM profile: %s", e)
        except Exception as e:
            logger.error("Error during CIM profile initialization: %s", e)

    def get_baseline_schema(self) -> Dict[str, Dict[str, Any]]:
        """Returns the full schema metadata extracted from the profile."""
        if not self._initialized:
            self.initialize()
        return self.schema

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
