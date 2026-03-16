---
sidebar_position: 4
---

# Diagnostic View

The Diagnostic View provides deep insight into the **CIM (Common Information Model)** properties and the **Topology** of any asset in the grid. It is the primary tool for engineers to verify model data integrity and explore electrical relationships.

## Opening the Diagnostic View

1. Select a node on the map.
2. Click the **database icon** (🗄️) in the analytics toolbar.
3. The Diagnostic window opens with two primary tabs: **Attributes** and **Topology**.

## Attributes Tab

The Attributes tab displays the raw data stored in the CIM model for the selected equipment.

![Diagnostic attributes view showing CIM properties](/img/features/diagnostic-attributes.png)

### Key Model Identifiers
- **MRID**: The globally unique Master Resource Identifier for the asset.
- **CIM Class**: The specific class of the equipment (e.g., `PowerTransformer`, `ACLineSegment`, `ConnectivityNode`).
- **Model ID**: The source network model this asset originated from.

### Technical Parameters
Depending on the equipment type, you will see specific electrical parameters:
- **Transformers**: kVA ratings, primary/secondary voltages.
- **Lines**: Resistance (r), Reactance (x), and Length.
- **Regulators**: Tap changer settings and voltage regulation targets.

---

## Topology Tab (Neighborhood Explorer)

The Topology tab provides a tree-based view of all electrically connected neighbors.

![Diagnostic topology view showing neighbor nodes](/img/features/diagnostic-topology.png)

### Navigating the Tree
- **Direct Connections**: Shows assets directly connected to the current node's terminals.
- **Node Classification**: Neighbors are tagged with their CIM type (e.g., `LOADBREAKSWITCH`, `SYNCHRONOUSMACHINE`).
- **Interactive Tracing**: Click any neighbor in the list to "re-center" the diagnostic view on that node, allowing you to walk through the circuit topology step-by-step.

### Use Cases
- **Connectivity Validation**: Verify that switch states and terminal connections are modeled correctly.
- **Equipment Identification**: Quickly identify what equipment is isolating a specific section of the grid.
- **Trace Analysis**: Manual verification of radial or looped configurations.
