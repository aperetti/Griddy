"""Backward-compatibility shim — import from src.shared.cim instead."""
from src.shared.cim import CimModelManager, _mrid_str

__all__ = ["CimModelManager", "_mrid_str"]
