---
sidebar_position: 5
---

# Data Export

The Griddy platform allows engineers to export analytical data directly from the browser for further processing in Excel, Python, or other power system analysis tools.

## Supported Formats

- **CSV (Comma Separated Values)**: Best for importing into spreadsheet applications like Excel or Google Sheets.
- **JSON (JavaScript Object Notation)**: Best for programmatic use in scripts and external APIs.

## How to Export Data

Exporting is available from any **Analysis Window** (Consumption, Diagnostic, etc.).

1. Open an analysis window for one or more assets.
2. Ensure the data has finished loading (the spinner should be gone).
3. Click the **Download icon** (📥) in the window header.

![Export button in analysis window header](/img/features/export-button.png)

4. Select your desired format from the dropdown menu.
5. The file will be generated and downloaded to your local machine.

## Exported Data Structure

### Time-Series Data (Consumption)
The export contains the raw data points used to generate the charts:
- **Timestamp**: ISO 8601 formatted date and time.
- **Value**: The numerical reading (e.g., kWh).
- **Type**: The reading type (e.g., `Delivered`, `Received`, `Calculated_Net`).
- **Asset ID**: The MRID of the asset the data belongs to.

### Attribute Data (Diagnostic)
When exporting from a diagnostic view, the file captures:
- All CIM attributes currently visible in the table.
- Extended metadata including Connectivity Node relationships and Terminal IDs.

## Privacy and Security
Exported data is generated client-side from the data already queried by your browser. No additional server requests are made during the export process, ensuring that your filtered views are captured exactly as seen on screen.
