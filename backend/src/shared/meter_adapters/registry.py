import importlib
import pkgutil
import inspect
import os
import sys
import logging
from pathlib import Path
from typing import List, Dict
from src.shared.meter_data_repository import IMeterDataRepository

logger = logging.getLogger(__name__)

_external_adapters_dir = Path("/data/config/adapters")

# Ensure external dir is in path for dynamic imports
if _external_adapters_dir.exists() and str(_external_adapters_dir) not in sys.path:
    sys.path.append(str(_external_adapters_dir))

def discover_adapters() -> List[Dict[str, str]]:
    """
    Scans the src.shared.meter_adapters package and the external /data/config/adapters
    directory for IMeterDataRepository implementations.
    Returns a list of metadata dictionaries: [{"name": "...", "label": "..."}]
    """
    adapters = []
    
    # 1. Scan Built-ins
    pkg_dir = os.path.dirname(__file__)
    logger.debug(f"Scanning for meter adapters in {pkg_dir}")
    
    for _, module_name, is_pkg in pkgutil.iter_modules([pkg_dir]):
        if module_name == 'registry' or is_pkg:
            continue
            
        try:
            full_module_path = f"src.shared.meter_adapters.{module_name}"
            _find_in_module(full_module_path, module_name, adapters)
        except Exception as e:
            logger.error(f"Failed to load meter adapter module {module_name}: {e}", exc_info=True)

    # 2. Scan Externals
    if _external_adapters_dir.exists():
        for entry in _external_adapters_dir.iterdir():
            if entry.is_file() and entry.suffix == ".py" and not entry.name.startswith("_"):
                module_name = entry.stem
                try:
                    _find_in_module(module_name, module_name, adapters)
                except Exception as e:
                    logger.error(f"Failed to load external meter adapter {module_name}: {e}")

    # Deduplicate by name
    unique_adapters = {a["name"]: a for a in adapters}
    
    # Always ensure DuckDB is present as a fallback
    if "duckdb" not in unique_adapters:
        unique_adapters["duckdb"] = {"name": "duckdb", "label": "DuckDB (Local Parquet)"}
            
    return sorted(list(unique_adapters.values()), key=lambda x: x["label"])

def _find_in_module(module_path: str, module_name: str, results: list):
    module = importlib.import_module(module_path)
    for name, obj in inspect.getmembers(module, inspect.isclass):
        if (issubclass(obj, IMeterDataRepository) and 
            obj is not IMeterDataRepository and
            obj.__module__ == module_path):
            
            adapter_name = getattr(obj, "name", module_name)
            adapter_label = getattr(obj, "label", name)
            
            results.append({
                "name": adapter_name,
                "label": adapter_label
            })
            logger.info(f"Discovered AMI adapter: {adapter_label} ({adapter_name})")
