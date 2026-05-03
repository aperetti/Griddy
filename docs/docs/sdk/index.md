---
title: Plugin SDK Overview
sidebar_position: 1
---

# Plugin SDK

Griddy's plugin system lets you extend the application with new analysis screens without touching the core codebase. A plugin is a pair of files — one backend route and one frontend definition — that together add a toolbar button, a floating analysis window, and the API endpoint that powers it.

The built-in **Consumption Analysis**, **Voltage Distribution**, and **Transformer Loading** screens are all plugins.

---

## How it works

```
User clicks toolbar button
        │
        ▼
plugin.handleRun(ctx)          ← creates the AnalysisInstance, calls /api/plugins/<name>/
        │
        ▼
plugin.renderWindow(instance)  ← renders a floating window from AnalysisWindow
        │
        ▼
Backend plugin route           ← calls get_sdk("<name>"), never opens its own DB connection
        │
        ▼
PluginSDK (sdk.cim / sdk.topology / sdk.analytics)
        │
        ▼
Shared infrastructure (Neo4j CIM registry, NetworkX engine, AMI Data Adapters)
```

The SDK enforces one important rule: **plugins never create database connections**. All data access flows through `sdk.cim`, `sdk.topology`, or `sdk.analytics`, which delegate to the shared infrastructure that the rest of the application already manages.

---

## Plugin structure

```text
backend/plugins/[name]/
    __init__.py        ← empty package marker
    manifest.json      ← required: plugin name and permissions
    routes.py          ← FastAPI router, imports get_sdk

frontend/src/plugins/[name]/
    api.ts             ← typed fetch functions
    index.ts           ← PluginDefinition export
    [Window].tsx       ← optional: custom window component
```

One line in each registry file activates a plugin:

```python
# backend/plugins/__init__.py
from plugins.my_plugin.routes import router as my_plugin_router
PLUGIN_ROUTERS = [..., my_plugin_router]
```

```typescript
// frontend/src/plugins/index.ts
import { myPlugin } from './my_plugin';
export const pluginRegistry = new Map([..., [myPlugin.type, myPlugin]]);
```

---

## When to write a plugin

A plugin is the right choice when you need to:

- Run a CIM or time-series query against the selected nodes and display the result in a floating window
- Add a toolbar button that appears only for certain node types or selections
- Package backend + frontend together as a self-contained feature

For simple UI changes that don't require a backend query, use the existing component system instead.

---

## Further reading

- [Creating a Plugin](./installation.md) — step-by-step walkthrough
- [SDK API Reference](./api-reference.md) — full method signatures for `sdk.cim`, `sdk.topology`, `sdk.analytics`, and the TypeScript contracts
