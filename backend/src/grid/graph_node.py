"""Graph node model for traversal."""
from typing import List, Optional
from pydantic import BaseModel, Field


class GraphNode(BaseModel):
    """Represents a node in the graph engine.

    Built from the in-memory CIM-Graph model at startup.  The
    ``attached_equipment`` list contains inline CIM detail for loads,
    sources, and capacitors connected at this connectivity node.
    """
    id: str = Field(..., description="Unique node ID (ConnectivityNode mRID)")
    type: str = Field(..., description="Derived node type (Bus or Substation)")
    name: str = Field("Unknown", description="CIM IdentifiedObject.name")
    phases: List[str] = Field(
        default_factory=lambda: ["A", "B", "C"],
        description="Phase codes extracted from CIM (e.g. ['A','B','C'])",
    )
    children: List[str] = Field(default_factory=list, description="Downstream node IDs")
    parents: List[str] = Field(default_factory=list, description="Upstream node IDs")
    latitude: Optional[float] = Field(None, description="Latitude for spatial stitching")
    longitude: Optional[float] = Field(None, description="Longitude for spatial stitching")
    attached_equipment: List[dict] = Field(
        default_factory=list,
        description="Equipment attached at this connectivity node (loads, sources, capacitors) with inline CIM detail",
    )
    base_voltage_kv: Optional[float] = Field(
        None, description="Nominal voltage (kV) from VoltageLevel / BaseVoltage",
    )
