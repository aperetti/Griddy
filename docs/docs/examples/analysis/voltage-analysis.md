---
sidebar_position: 2
---

# Voltage Analysis

The Voltage Analysis tool provides a statistical view of how voltage is behaving downstream of a selected asset. It helps engineers identify **voltage regulation issues**, **phase imbalances**, and **load-dependent voltage sag** that could affect power quality and customer satisfaction.

## Opening the Analysis

1. Click a node on the map (e.g., a **Distribution Transformer**).
2. Click the **√x icon** in the analytics toolbar.
3. The analysis window opens and queries voltage readings for downstream meters.

## Understanding the Charts

![Voltage analysis window showing distribution, stability, and heatmap charts](/img/guide/voltage-analysis.png)

The window contains three charts arranged side-by-side:

---

### 1. Distribution (KDE)

**What it shows:** A Kernel Density Estimation of voltage readings, broken down by phase (A, B, C).

**How to read it:**
- **Phase A** (red), **Phase B** (green), and **Phase C** (blue) each have their own smoothed density curve
- The X-axis shows voltage level (V); the Y-axis shows relative frequency
- **Narrow, tall peaks** indicate tight voltage regulation
- **Wide, flat curves** or **multiple peaks** suggest poor regulation or switching events

**Value it provides:**
- Instantly reveals whether voltage is **within the ANSI C84.1 acceptable range** (114V–126V for 120V service)
- Shows **phase imbalance** — if one phase sits significantly lower or higher than the others, tap or regulator adjustments may be needed
- Detects **bimodal distributions** that could indicate a regulator switching between tap positions or a load pattern that splits into day/night modes

---

### 2. Daily Voltage Stability (Median & 10/90 Bands)

**What it shows:** The daily median voltage for each phase over the selected time range, with P10/P90 bands.

**How to read it:**
- **Red line** = Phase A median, **Orange line** = Phase B median, **Blue line** = Phase C median
- Shaded or implied bands represent the 10th–90th percentile range for each day
- The X-axis is the date; the Y-axis is voltage (V)

**Value it provides:**
- Tracks voltage **trends over time** — is voltage gradually declining as load grows?
- Identifies **specific dates** with abnormal voltage dips that correlate with events (storms, equipment failures)
- Shows the **spread** (P10–P90) — wide bands mean high variability within a day, often caused by load cycling
- Helps prioritize **regulator maintenance** — consistent drift on one phase points to a specific tap changer issue

---

### 3. Voltage vs Loading (Heatmap)

**What it shows:** A 2D density heatmap correlating downstream loading (kWh) with voltage (V).

**How to read it:**
- The X-axis is loading (kWh); the Y-axis is voltage (V)
- **Colors** range from cool (sparse) to warm/hot (dense concentration of readings)
- A downward-sloping pattern (high load → lower voltage) indicates **voltage sag under load**

**Value it provides:**
- Directly answers: **"Does voltage drop when the circuit gets busy?"**
- Quantifies the **voltage regulation slope** — how many volts drop per kWh of additional load
- Identifies whether low voltage complaints are **load-driven** (appearing in the bottom-right of the plot) vs. **systemic** (low voltage at all load levels)
- Helps engineers decide between solutions: **regulator adjustment** (for systemic issues) vs. **conductor upgrades** (for load-dependent sag)

## Filters

Click the **Filters** button in the title bar to adjust:
- **Degrees of Separation** — controls how many hops downstream are included
- **Date Range** — quick-select buttons (1W, 1M, 1Y) or global settings

## Tips

- **Compare phases**: The KDE and daily stability charts make phase-to-phase comparison easy — look for any phase that consistently sits below the others
- **High-load investigation**: When the heatmap shows voltage dropping below 114V at high load, consider conductor re-sizing or capacitor bank installation
- **Drag & resize**: The window can be positioned anywhere and will remember its last location
