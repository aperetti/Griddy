---
title: Creating a Plugin
sidebar_position: 2
---

# Creating a Plugin

This guide walks through building a minimal plugin from scratch. The example queries the CIM graph for a custom equipment type and displays the result in a table.

---

## Prerequisites

- Backend: Python 3.11+, FastAPI, access to the `plugins/` package
- Frontend: TypeScript, React, Mantine v7, Lucide icons

---

## Step 1 — Backend route

Create `backend/plugins/my_analysis/__init__.py` (empty) and `backend/plugins/my_analysis/routes.py`:

```python
from fastapi import APIRouter, HTTPException, Query
from fastapi.concurrency import run_in_threadpool
from plugins.sdk import get_sdk

router = APIRouter(prefix="/api/plugins/my-analysis", tags=["plugins"])
sdk = get_sdk("my_analysis")

_CYPHER = """
MATCH (eq:MyEquipmentClass)
WHERE eq.`IdentifiedObject.mRID` IN $mrids
RETURN eq.`IdentifiedObject.mRID` AS mrid,
       eq.`IdentifiedObject.name`  AS name,
       eq.`MyEquipment.rating`     AS rating
ORDER BY name
"""

def _fetch(node_ids: list[str]) -> dict:
    rows = sdk.cim.run_cypher(_CYPHER, {"mrids": node_ids})
    return {"items": rows, "count": len(rows)}

@router.get("/{node_ids}")
async def get_my_analysis(node_ids: str):
    ids = [i.strip() for i in node_ids.split(",") if i.strip()]
    if not ids:
        raise HTTPException(400, "No node IDs provided")
    return await run_in_threadpool(_fetch, ids)
```

Rules:
- Only import from `plugins.sdk` via `get_sdk("<name>")` — no direct `neo4j`, `duckdb`, or `sqlite3` imports.
- Use `run_in_threadpool` because the SDK calls are synchronous.
- `sdk.cim.run_cypher` rejects write Cypher (CREATE, MERGE, SET, DELETE).

---

## Step 2 — Manifest file

Every plugin requires a `manifest.json` in its backend directory. This file defines the plugin's metadata and required permissions.

Create `backend/plugins/my_analysis/manifest.json`:

```json
{
    "name": "my_analysis",
    "label": "My Analysis",
    "permissions": [
        "cim:read"
    ]
}
```

The `get_sdk` factory reads this file to authorize data access. Available permissions include `cim:read`, `topology:read`, `analytics:consumption`, `analytics:voltage`, and `analytics:load`.

---

## Step 3 — Register the backend route

```python
# backend/plugins/__init__.py
from plugins.my_analysis.routes import router as my_analysis_router

PLUGIN_ROUTERS = [
    ...,
    my_analysis_router,
]
```

That's the only existing file you need to touch on the backend.

---

## Step 4 — Frontend API module

Create `frontend/src/plugins/my_analysis/api.ts`:

```typescript
const API_BASE = '/api/plugins/my-analysis';

export interface MyItem {
    mrid: string;
    name: string | null;
    rating: number | null;
}

export interface MyAnalysisResponse {
    items: MyItem[];
    count: number;
}

export async function fetchMyAnalysis(nodeIds: string[]): Promise<MyAnalysisResponse> {
    const res = await fetch(`${API_BASE}/${nodeIds.join(',')}`);
    if (!res.ok) throw new Error(`my-analysis fetch failed: ${res.status}`);
    return res.json();
}
```

---

## Step 5 — Frontend plugin definition

Create `frontend/src/plugins/my_analysis/index.ts`:

```typescript
import { Cpu } from 'lucide-react';
import { createElement } from 'react';
import type { PluginDefinition } from '../types';
import { fetchMyAnalysis } from './api';
import { MyAnalysisWindow } from './MyAnalysisWindow';

export const myPlugin: PluginDefinition = {
    type: 'my_analysis',
    category: 'node',
    label: 'My Analysis',
    icon: Cpu,
    color: 'grape',

    // Show the button whenever at least one node is selected
    appliesToNodes: (nodes) => nodes.length > 0,

    async handleRun(ctx) {
        const nodeIds = ctx.selectedNodes.map(n => n.id);
        if (nodeIds.length === 0) return;

        const nodeName = nodeIds.length === 1
            ? ctx.selectedNodes[0].name ?? 'Asset'
            : `${nodeIds.length} Assets`;

        const id = `my_analysis-${Date.now()}`;
        ctx.setAnalysisWindows(prev => [...prev, {
            id, type: 'my_analysis', nodeIds, nodeName,
            isOpen: true, isMinimized: false, loading: true, data: [], zIndex: 1000,
        }]);
        ctx.bringWindowToFront(id);

        fetchMyAnalysis(nodeIds)
            .then(resp => ctx.updateWindow(id, { data: resp.items, loading: false }))
            .catch(() => ctx.updateWindow(id, { loading: false }));
    },

    renderWindow(instance, callbacks) {
        return createElement(MyAnalysisWindow, { instance, ...callbacks });
    },
};
```

---

## Step 6 — Window component

Create `frontend/src/plugins/my_analysis/MyAnalysisWindow.tsx`:

```tsx
import { memo } from 'react';
import { Table, Text, Center } from '@mantine/core';
import { AnalysisWindow } from '../../features/analytics/components/AnalysisWindow';
import type { AnalysisInstance } from '../../hooks/useAnalyticsState';
import type { PluginWindowCallbacks } from '../types';
import type { MyItem } from './api';

interface Props extends PluginWindowCallbacks {
    instance: AnalysisInstance;
}

export const MyAnalysisWindow = memo(function MyAnalysisWindow({ instance, onClose, onMinimize }: Props) {
    const items = (instance.data ?? []) as MyItem[];

    return (
        <AnalysisWindow
            isOpen={instance.isOpen}
            onClose={onClose}
            onMinimize={onMinimize}
            isMinimized={instance.isMinimized}
            title={`My Analysis — ${instance.nodeName}`}
            storageKey={`plugin_my_analysis_${instance.id}`}
            zIndex={instance.zIndex ?? 1000}
            loading={instance.loading}
            layoutMode="floating"
            initialWidth={600}
            initialHeight={360}
        >
            {items.length === 0 ? (
                <Center py="xl">
                    <Text c="dimmed" size="sm">No data found.</Text>
                </Center>
            ) : (
                <Table striped withTableBorder fz="xs">
                    <Table.Thead>
                        <Table.Tr>
                            <Table.Th>Name</Table.Th>
                            <Table.Th>Rating</Table.Th>
                        </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                        {items.map(item => (
                            <Table.Tr key={item.mrid}>
                                <Table.Td>{item.name ?? '—'}</Table.Td>
                                <Table.Td>{item.rating ?? '—'}</Table.Td>
                            </Table.Tr>
                        ))}
                    </Table.Tbody>
                </Table>
            )}
        </AnalysisWindow>
    );
});
```

---

## Step 7 — Register the frontend plugin

```typescript
// frontend/src/plugins/index.ts
import { myPlugin } from './my_analysis';

export const pluginRegistry = new Map([
    ...,
    [myPlugin.type, myPlugin],
]);
```

---

## Verification

1. Start the backend: the new route appears in `GET /docs` under the **plugins** tag.
2. Start the frontend dev server.
3. Select a node on the map — the "My Analysis" button (Cpu icon) appears in the toolbar.
4. Click it — the window opens, loads, and displays the table.
5. The window minimizes to the tray and restores correctly.

---

## Advanced patterns

### Capacity gating (large queries)

If your query may return millions of rows, show a warning before running:

```typescript
async handleRun(ctx) {
    // ... create window ...
    const est = await fetchMyEstimate(nodeIds);
    const threshold = Number(ctx.systemConfig['analytics_threshold'] || 2_000_000);
    if (est.estimated_rows > threshold) {
        ctx.updateWindow(id, {
            loading: false, isPaused: true,
            estimatedRows: est.estimated_rows,
            pendingRequest: { nodeIds, start: ctx.dateRange.start, end: ctx.dateRange.end },
        });
    } else {
        // fetch immediately
    }
}
```

Pass `onConfirm` and `isPaused` to your window component to render the confirmation UI.

### Date range access

The global date range is available in `ctx.dateRange`:

```typescript
const { start, end } = ctx.dateRange;
```

### Graph highlighting

After fetching, highlight the downstream nodes on the map:

```typescript
.then(resp => {
    ctx.updateWindow(id, { data: resp.items, loading: false });
    ctx.addHighlightedNodes(resp.downstream_node_ids ?? []);
    ctx.addHighlightedEdges(resp.downstream_edge_ids ?? []);
})
```

### Edge selections

Consumption-style plugins can trigger from edge selections too:

```typescript
appliesToNodes: (nodes, edgeCount = 0) => nodes.length > 0 || edgeCount > 0,

async handleRun(ctx) {
    let nodeIds = ctx.selectedNodes.map(n => n.id);
    if (nodeIds.length === 0 && ctx.selectedEdgeIds.length > 0) {
        nodeIds = ctx.resolveEdgeNodesToNodeIds(ctx.selectedEdgeIds);
    }
    // ...
}
```
