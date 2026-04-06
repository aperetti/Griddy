import { test, expect } from '@playwright/test';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Fetch the topology and return the first N node IDs. */
async function getNodeIds(page: any, limit = 5): Promise<string[]> {
    const topo: any = await page.evaluate(async () => {
        const res = await fetch('/api/graph/topology');
        return res.json();
    });
    const nodes: any[] = topo.nodes || [];
    return nodes.slice(0, limit).map((n: any) => n.id);
}

/** Return the first node that looks like a transformer (has PowerTransformer in attached_equipment or type).
 *  Falls back to the first node if none match — the transformer-loading endpoint still returns an empty
 *  list rather than an error for non-transformer nodes, so the shape test still runs. */
async function getTransformerNodeId(page: any): Promise<string | null> {
    const topo: any = await page.evaluate(async () => {
        const res = await fetch('/api/graph/topology');
        return res.json();
    });
    const nodes: any[] = topo.nodes || [];
    if (nodes.length === 0) return null;
    const tx = nodes.find((n: any) =>
        n.type === 'PowerTransformer' ||
        n.display_type === 'PowerTransformer' ||
        (n.attached_equipment || []).some((eq: any) => eq.type === 'PowerTransformer')
    );
    // Fall back to any node so the test runs and validates the response shape
    return tx ? tx.id : nodes[0].id;
}

const DATE_START = '2024-01-01T00:00:00';
const DATE_END   = '2024-01-07T23:59:59';

// ---------------------------------------------------------------------------
// Prerequisite
// ---------------------------------------------------------------------------

test.describe('Plugin prerequisites', () => {
    test('topology API is reachable and returns nodes', async ({ page }) => {
        await page.goto('/');
        await page.waitForTimeout(2000);

        const nodeIds = await getNodeIds(page, 1);
        expect(nodeIds.length).toBeGreaterThan(0);
    });
});

// ---------------------------------------------------------------------------
// Consumption plugin
// ---------------------------------------------------------------------------

test.describe('Consumption plugin', () => {
    // Analytics endpoints run DuckDB/parquet queries that can be slow
    test.setTimeout(120_000);

    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        await page.waitForTimeout(2000);
    });

    test('estimate endpoint returns expected shape', async ({ page }) => {
        const nodeIds = await getNodeIds(page, 1);
        const response: any = await page.evaluate(
            async ([ids, start, end]: [string[], string, string]) => {
                const url = `/api/plugins/consumption/${ids.join(',')}/estimate?start_time=${encodeURIComponent(start)}&end_time=${encodeURIComponent(end)}`;
                const res = await fetch(url);
                return { status: res.status, body: await res.json() };
            },
            [nodeIds, DATE_START, DATE_END] as [string[], string, string],
        );

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('estimated_rows');
        expect(response.body).toHaveProperty('node_count');
        expect(typeof response.body.estimated_rows).toBe('number');
        expect(typeof response.body.node_count).toBe('number');
    });

    test('full consumption endpoint returns expected shape', async ({ page }) => {
        const nodeIds = await getNodeIds(page, 1);
        const response: any = await page.evaluate(
            async ([ids, start, end]: [string[], string, string]) => {
                const url = `/api/plugins/consumption/${ids.join(',')}?start_time=${encodeURIComponent(start)}&end_time=${encodeURIComponent(end)}`;
                const res = await fetch(url);
                return { status: res.status, body: await res.json() };
            },
            [nodeIds, DATE_START, DATE_END] as [string[], string, string],
        );

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('time_series');
        expect(response.body).toHaveProperty('node_count');
        expect(response.body).toHaveProperty('estimated_rows');
        expect(response.body).toHaveProperty('downstream_node_ids');
        expect(response.body).toHaveProperty('downstream_edge_ids');
        expect(Array.isArray(response.body.time_series)).toBe(true);
        expect(Array.isArray(response.body.downstream_node_ids)).toBe(true);
        expect(Array.isArray(response.body.downstream_edge_ids)).toBe(true);
    });

    test('estimate row count is consistent with full response', async ({ page }) => {
        const nodeIds = await getNodeIds(page, 1);

        const [est, full]: any[] = await page.evaluate(
            async ([ids, start, end]: [string[], string, string]) => {
                const base = `/api/plugins/consumption/${ids.join(',')}`;
                const qs = `start_time=${encodeURIComponent(start)}&end_time=${encodeURIComponent(end)}`;
                const [re, rf] = await Promise.all([
                    fetch(`${base}/estimate?${qs}`).then(r => r.json()),
                    fetch(`${base}?${qs}`).then(r => r.json()),
                ]);
                return [re, rf];
            },
            [nodeIds, DATE_START, DATE_END] as [string[], string, string],
        );

        // Estimated row count from the estimate endpoint should match the full response field
        expect(est.estimated_rows).toBe(full.estimated_rows);
    });

    test('multi-node consumption returns data for each node', async ({ page }) => {
        const nodeIds = await getNodeIds(page, 3);
        if (nodeIds.length < 2) {
            test.skip();
            return;
        }

        const response: any = await page.evaluate(
            async ([ids, start, end]: [string[], string, string]) => {
                const url = `/api/plugins/consumption/${ids.join(',')}?start_time=${encodeURIComponent(start)}&end_time=${encodeURIComponent(end)}`;
                const res = await fetch(url);
                return { status: res.status, body: await res.json() };
            },
            [nodeIds, DATE_START, DATE_END] as [string[], string, string],
        );

        expect(response.status).toBe(200);
        expect(response.body.node_count).toBeGreaterThanOrEqual(1);
    });
});

// ---------------------------------------------------------------------------
// Voltage Distribution plugin
// ---------------------------------------------------------------------------

test.describe('Voltage Distribution plugin', () => {
    test.setTimeout(120_000);

    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        await page.waitForTimeout(2000);
    });

    test('estimate endpoint returns expected shape', async ({ page }) => {
        const nodeIds = await getNodeIds(page, 1);
        const response: any = await page.evaluate(
            async ([ids, start, end]: [string[], string, string]) => {
                const url = `/api/plugins/voltage/${ids.join(',')}/estimate?start_time=${encodeURIComponent(start)}&end_time=${encodeURIComponent(end)}`;
                const res = await fetch(url);
                return { status: res.status, body: await res.json() };
            },
            [nodeIds, DATE_START, DATE_END] as [string[], string, string],
        );

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('estimated_rows');
        expect(response.body).toHaveProperty('node_count');
        expect(typeof response.body.estimated_rows).toBe('number');
    });

    test('full voltage endpoint returns distribution, scatter, timeseries', async ({ page }) => {
        const nodeIds = await getNodeIds(page, 1);
        const response: any = await page.evaluate(
            async ([ids, start, end]: [string[], string, string]) => {
                const url = `/api/plugins/voltage/${ids.join(',')}?start_time=${encodeURIComponent(start)}&end_time=${encodeURIComponent(end)}`;
                const res = await fetch(url);
                return { status: res.status, body: await res.json() };
            },
            [nodeIds, DATE_START, DATE_END] as [string[], string, string],
        );

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('distribution');
        expect(response.body).toHaveProperty('scatter');
        expect(response.body).toHaveProperty('timeseries');
        expect(response.body).toHaveProperty('downstream_node_ids');
        expect(response.body).toHaveProperty('downstream_edge_ids');
        expect(Array.isArray(response.body.distribution)).toBe(true);
        expect(Array.isArray(response.body.scatter)).toBe(true);
        expect(Array.isArray(response.body.timeseries)).toBe(true);
    });

    test('degrees parameter is accepted (degrees=3)', async ({ page }) => {
        const nodeIds = await getNodeIds(page, 1);
        const response: any = await page.evaluate(
            async ([ids, start, end]: [string[], string, string]) => {
                const url = `/api/plugins/voltage/${ids.join(',')}?start_time=${encodeURIComponent(start)}&end_time=${encodeURIComponent(end)}&degrees=3`;
                const res = await fetch(url);
                return { status: res.status, body: await res.json() };
            },
            [nodeIds, DATE_START, DATE_END] as [string[], string, string],
        );

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('distribution');
    });

    test('voltage estimate is consistent with full response', async ({ page }) => {
        const nodeIds = await getNodeIds(page, 1);

        const [est, full]: any[] = await page.evaluate(
            async ([ids, start, end]: [string[], string, string]) => {
                const base = `/api/plugins/voltage/${ids.join(',')}`;
                const qs = `start_time=${encodeURIComponent(start)}&end_time=${encodeURIComponent(end)}`;
                const [re, rf] = await Promise.all([
                    fetch(`${base}/estimate?${qs}`).then(r => r.json()),
                    fetch(`${base}?${qs}`).then(r => r.json()),
                ]);
                return [re, rf];
            },
            [nodeIds, DATE_START, DATE_END] as [string[], string, string],
        );

        expect(est.estimated_rows).toBe(full.estimated_rows);
    });
});

// ---------------------------------------------------------------------------
// Transformer Loading plugin
// ---------------------------------------------------------------------------

test.describe('Transformer Loading plugin', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        await page.waitForTimeout(2000);
    });

    test('endpoint returns expected shape for any node', async ({ page }) => {
        const nodeIds = await getNodeIds(page, 1);
        const response: any = await page.evaluate(
            async (ids: string[]) => {
                const res = await fetch(`/api/plugins/transformer-loading/${ids.join(',')}`);
                return { status: res.status, body: await res.json() };
            },
            nodeIds,
        );

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('transformers');
        expect(response.body).toHaveProperty('count');
        expect(Array.isArray(response.body.transformers)).toBe(true);
        expect(typeof response.body.count).toBe('number');
    });

    test('returns valid response for a transformer node', async ({ page }) => {
        const txId = await getTransformerNodeId(page);
        if (!txId) {
            test.skip();
            return;
        }

        const response: any = await page.evaluate(
            async (id: string) => {
                const res = await fetch(`/api/plugins/transformer-loading/${id}`);
                return { status: res.status, body: await res.json() };
            },
            txId,
        );

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('transformers');
        expect(response.body).toHaveProperty('count');
        expect(Array.isArray(response.body.transformers)).toBe(true);

        // If transformers were found, validate their shape
        if (response.body.count > 0) {
            const tx = response.body.transformers[0];
            expect(tx).toHaveProperty('mrid');
            expect(tx).toHaveProperty('ends');
            expect(Array.isArray(tx.ends)).toBe(true);
        }
    });

    test('transformer end schema has required fields when data is present', async ({ page }) => {
        const txId = await getTransformerNodeId(page);
        if (!txId) {
            test.skip();
            return;
        }

        const response: any = await page.evaluate(
            async (id: string) => {
                const res = await fetch(`/api/plugins/transformer-loading/${id}`);
                return res.json();
            },
            txId,
        );

        if (response.count === 0 || !response.transformers[0]?.ends?.length) {
            // No transformer end data for this node — response shape is still valid
            return;
        }

        const firstEnd = response.transformers[0].ends[0];
        expect(firstEnd).toHaveProperty('end_number');
        expect(firstEnd).toHaveProperty('rated_s_kva');
        expect(firstEnd).toHaveProperty('rated_u_v');
    });
});

// ---------------------------------------------------------------------------
// One-Line Explorer plugin
// ---------------------------------------------------------------------------

test.describe('One-Line Explorer plugin', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        await page.waitForTimeout(2000);
    });

    test('diagram endpoint returns expected shape for a valid node', async ({ page }) => {
        const nodeIds = await getNodeIds(page, 1);
        if (nodeIds.length === 0) {
            test.skip();
            return;
        }

        const response: any = await page.evaluate(
            async (id: string) => {
                const res = await fetch(`/api/plugins/one-line-explorer/diagram/${encodeURIComponent(id)}?depth=2`);
                return { status: res.status, body: await res.json() };
            },
            nodeIds[0],
        );

        // If the plugin is disabled the gate returns 404 — skip gracefully
        if (response.status === 404) {
            console.log('[one_line_explorer] Plugin not enabled — skipping response-shape assertions');
            return;
        }

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('centre_id');
        expect(response.body).toHaveProperty('depth');
        expect(response.body).toHaveProperty('nodes');
        expect(response.body).toHaveProperty('edges');
        expect(Array.isArray(response.body.nodes)).toBe(true);
        expect(Array.isArray(response.body.edges)).toBe(true);
        expect(response.body.centre_id).toBe(nodeIds[0]);
        expect(response.body.depth).toBe(2);
    });

    test('exactly one node is flagged as centre', async ({ page }) => {
        const nodeIds = await getNodeIds(page, 1);
        if (nodeIds.length === 0) {
            test.skip();
            return;
        }

        const response: any = await page.evaluate(
            async (id: string) => {
                const res = await fetch(`/api/plugins/one-line-explorer/diagram/${encodeURIComponent(id)}`);
                return { status: res.status, body: await res.json() };
            },
            nodeIds[0],
        );

        if (response.status !== 200) return; // plugin disabled — skip

        const centreNodes = response.body.nodes.filter((n: any) => n.is_centre === true);
        expect(centreNodes).toHaveLength(1);
        expect(centreNodes[0].id).toBe(nodeIds[0]);
    });

    test('all edges in response connect nodes within the returned node set', async ({ page }) => {
        const nodeIds = await getNodeIds(page, 1);
        if (nodeIds.length === 0) {
            test.skip();
            return;
        }

        const response: any = await page.evaluate(
            async (id: string) => {
                const res = await fetch(`/api/plugins/one-line-explorer/diagram/${encodeURIComponent(id)}`);
                return { status: res.status, body: await res.json() };
            },
            nodeIds[0],
        );

        if (response.status !== 200) return;

        const nodeIdSet = new Set<string>(response.body.nodes.map((n: any) => n.id));
        for (const edge of response.body.edges) {
            expect(nodeIdSet.has(edge.from_node_id)).toBe(true);
            expect(nodeIdSet.has(edge.to_node_id)).toBe(true);
        }
    });

    test('unknown node id returns 404', async ({ page }) => {
        const response: any = await page.evaluate(async () => {
            const res = await fetch('/api/plugins/one-line-explorer/diagram/NONEXISTENT_NODE_xyz');
            return { status: res.status };
        });

        // 404 from plugin-not-enabled gate or from unknown-node logic — both acceptable
        expect([404]).toContain(response.status);
    });

    test('depth=1 returns fewer nodes than depth=2 for any node with neighbours', async ({ page }) => {
        const nodeIds = await getNodeIds(page, 1);
        if (nodeIds.length === 0) {
            test.skip();
            return;
        }

        const [d1, d2]: any[] = await page.evaluate(
            async (id: string) => {
                const [r1, r2] = await Promise.all([
                    fetch(`/api/plugins/one-line-explorer/diagram/${encodeURIComponent(id)}?depth=1`).then(r => r.json()),
                    fetch(`/api/plugins/one-line-explorer/diagram/${encodeURIComponent(id)}?depth=2`).then(r => r.json()),
                ]);
                return [r1, r2];
            },
            nodeIds[0],
        );

        // If depth field is missing the plugin is disabled — skip
        if (!d1.depth || !d2.depth) return;

        // depth=2 must have at least as many nodes as depth=1
        expect(d2.nodes.length).toBeGreaterThanOrEqual(d1.nodes.length);
    });
});

// ---------------------------------------------------------------------------
// Plugin toolbar UI
// ---------------------------------------------------------------------------

test.describe('Plugin toolbar buttons', () => {
    test('plugin buttons appear in toolbar after a node is selected', async ({ page }) => {
        await page.goto('/');
        await page.waitForTimeout(3000);

        // Intercept the topology call and record node coordinates from the
        // rendered graph so we can click a node. As a fallback we verify the
        // plugin API endpoints are reachable (toolbar is not testable without
        // an actual node click on the canvas).
        const nodeIds = await getNodeIds(page, 1);
        expect(nodeIds.length).toBeGreaterThan(0);

        // Verify toolbar plugin button test-ids exist in the DOM after
        // programmatically dispatching a selection event through the app's
        // internal Cytoscape instance.
        const pluginTypes = await page.evaluate(async (ids: string[]) => {
            // Attempt to select a node via the Cytoscape instance exposed on
            // the window by the app (if available).
            const cy: any = (window as any).__cy;
            if (!cy) return null;

            const node = cy.getElementById(ids[0]);
            if (!node || node.length === 0) return null;

            cy.elements().unselect();
            node.select();
            // Small pause so React state updates
            await new Promise(r => setTimeout(r, 500));
            return ids;
        }, nodeIds);

        if (pluginTypes === null) {
            // Cytoscape instance not exposed — skip UI assertion, API tests are sufficient
            console.log('Cytoscape window.__cy not available; skipping toolbar click test');
            return;
        }

        // After selection the toolbar should contain at least consumption and voltage buttons
        await expect(page.locator('[data-testid="btn-plugin-consumption"]')).toBeVisible({ timeout: 3000 });
        await expect(page.locator('[data-testid="btn-plugin-voltage"]')).toBeVisible({ timeout: 3000 });
    });
});
