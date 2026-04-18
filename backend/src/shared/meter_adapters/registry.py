import importlib
import pkgutil
import inspect
import os
import logging
from typing import List, Dict
from src.shared.meter_data_repository import IMeterDataRepository

logger = logging.getLogger(__name__)

def discover_adapters() -> List[Dict[str, str]]:
    """
    Scans the src.shared.meter_adapters package for IMeterDataRepository implementations.
    Returns a list of metadata dictionaries: [{"name": "...", "label": "..."}]
    """
    adapters = []
    
    # Get the directory of the current file
    pkg_dir = os.path.dirname(__file__)
    logger.debug(f"Scanning for meter adapters in {pkg_dir}")
    
    for _, module_name, is_pkg in pkgutil.iter_modules([pkg_dir]):
        if module_name == 'registry' or is_pkg:
            continue
            
        try:
            # Full module path relative to backend root
            full_module_path = f"src.shared.meter_adapters.{module_name}"
            module = importlib.import_module(full_module_path)
            
            # Use inspect to find classes that implement the interface
            # but were actually DEFINED in that module (avoiding re-discovery of imported base classes)
            for name, obj in inspect.getmembers(module, inspect.isclass):
                if (issubclass(obj, IMeterDataRepository) and 
                    obj is not IMeterDataRepository and
                    obj.__module__ == full_module_path):
                    
                    adapter_name = getattr(obj, "name", module_name)
                    adapter_label = getattr(obj, "label", name)
                    
                    adapters.append({
                        "name": adapter_name,
                        "label": adapter_label
                    })
                    logger.info(f"Discovered AMI adapter: {adapter_label} ({adapter_name})")
        except Exception as e:
            logger.error(f"Failed to load meter adapter module {module_name}: {e}", exc_info=True)
            
    # Deduplicate by name
    unique_adapters = {a["name"]: a for a in adapters}
    
    # Always ensure DuckDB is present as a fallback
    if "duckdb" not in unique_adapters:
        unique_adapters["duckdb"] = {"name": "duckdb", "label": "DuckDB (Local Parquet)"}
            
    return sorted(list(unique_adapters.values()), key=lambda x: x["label"])
