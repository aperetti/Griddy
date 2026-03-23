# Voltage Map (Heatmap)

The Voltage Map provides a system-wide view of grid health by coloring every node based on its recent voltage performance.

## Using the Map

- **Toggle**: Access the **Voltage Map** from the hamburger menu (☰) in the top-right corner and select **Voltage Map Settings**.
- **Aggregation**: Choose how to summarize the data:
  - **Min**: Highlights the worst-case voltage drops.
  - **Max**: Highlights potential over-voltage issues.
  - **Median**: Shows the typical operating condition.
- **Trace Filter**: Optional. Enter a node ID to only map the subset of nodes downstream of that point.

## Color Coding (pu)

The map uses a 5-tier color scale based on per-unit (pu) voltage (where 120V = 1.0 pu):

| Range (pu) | Color | Status |
| :--- | :--- | :--- |
| **> 1.06** | **Red** | Critical High |
| **1.05 - 1.06** | **Orange** | High Warning |
| **0.95 - 1.05** | **Green** | Normal |
| **0.90 - 0.94** | **Yellow** | Low Warning |
| **< 0.90** | **Purple** | Critical Low |

## Visualization
This system allows operators to instantly spot "clusters" of low or high voltage that might indicate regulator failures or capacitor bank issues.
