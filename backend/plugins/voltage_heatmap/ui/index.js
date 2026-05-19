import { AlertCircle as y, Map as u, CheckCircle2 as j } from "lucide-react";
import { createElement as x } from "react";
import { j as t, A as _ } from "../../AnalysisWindow-DCpKwrtw.js";
import { Box as z, LoadingOverlay as M, Stack as m, Alert as h, Text as d, Button as p, Group as P, Badge as A } from "@mantine/core";
async function f(e, a, s, n = "avg", o = !1) {
  const i = e ? `/${e}` : "", r = await fetch(
    `/api/plugins/voltage_heatmap${i}?start_time=${a}&end_time=${s}&agg=${n}${o ? "&force=true" : ""}`
  );
  if (!r.ok) {
    const c = await r.json().catch(() => ({ detail: "Unknown error" }));
    throw new Error(c.detail || "Failed to fetch voltage map");
  }
  return r.json();
}
async function C(e, a, s, n = "avg") {
  const o = e ? `/${e}` : "", i = await fetch(
    `/api/plugins/voltage_heatmap${o}/estimate?start_time=${a}&end_time=${s}&agg=${n}`
  );
  if (!i.ok)
    throw new Error("Failed to fetch estimate");
  return i.json();
}
const V = ({
  isOpen: e,
  onClose: a,
  onMinimize: s,
  loading: n,
  data: o,
  estimatedRows: i,
  nodeName: l,
  isMinimized: r,
  isPaused: c,
  zIndex: v,
  onConfirm: g,
  onFocus: w
}) => /* @__PURE__ */ t.jsx(
  _,
  {
    title: `Voltage Heat Map: ${l}`,
    isOpen: e,
    isMinimized: r,
    onClose: a,
    onMinimize: s,
    onFocus: w,
    zIndex: v,
    storageKey: "voltage_heatmap_window",
    children: /* @__PURE__ */ t.jsxs(z, { p: "md", pos: "relative", style: { minHeight: 120 }, children: [
      /* @__PURE__ */ t.jsx(M, { visible: n, zIndex: 1001 }),
      c ? /* @__PURE__ */ t.jsxs(m, { gap: "md", children: [
        /* @__PURE__ */ t.jsx(
          h,
          {
            icon: /* @__PURE__ */ t.jsx(y, { size: 18 }),
            title: "Large Data Set",
            color: "orange",
            children: /* @__PURE__ */ t.jsxs(d, { size: "sm", children: [
              "This heat map will process approximately",
              " ",
              /* @__PURE__ */ t.jsx("strong", { children: i.toLocaleString() }),
              " rows of voltage data. This may take a few moments to aggregate and render across the map."
            ] })
          }
        ),
        /* @__PURE__ */ t.jsx(
          p,
          {
            onClick: g,
            variant: "light",
            color: "orange",
            fullWidth: !0,
            leftSection: /* @__PURE__ */ t.jsx(u, { size: 16 }),
            children: "Process and Visualize"
          }
        )
      ] }) : o ? /* @__PURE__ */ t.jsxs(m, { gap: "sm", children: [
        /* @__PURE__ */ t.jsxs(P, { justify: "space-between", children: [
          /* @__PURE__ */ t.jsx(d, { size: "sm", c: "dimmed", children: "Status:" }),
          /* @__PURE__ */ t.jsx(A, { color: "green", variant: "light", leftSection: /* @__PURE__ */ t.jsx(j, { size: 12 }), children: "Active on Map" })
        ] }),
        /* @__PURE__ */ t.jsx(d, { size: "sm", fw: 500, children: "Summary:" }),
        /* @__PURE__ */ t.jsxs(d, { size: "xs", c: "dimmed", children: [
          "Calculated averages for ",
          o.node_count,
          " nodes. The map colors have been updated to reflect the voltage levels relative to the configured scale."
        ] }),
        /* @__PURE__ */ t.jsx(h, { color: "blue", variant: "light", py: "xs", children: /* @__PURE__ */ t.jsx(d, { size: "xs", children: "Use the Voltage Scale panel on the left to adjust thresholds and interpret the map coloring." }) }),
        /* @__PURE__ */ t.jsx(
          p,
          {
            variant: "outline",
            color: "blue",
            onClick: g,
            size: "xs",
            mt: "xs",
            children: "Refresh Data"
          }
        )
      ] }) : /* @__PURE__ */ t.jsx(d, { size: "sm", c: "dimmed", fs: "italic", ta: "center", py: "xl", children: n ? "Crunching numbers..." : "No data loaded yet." })
    ] })
  }
), W = 5e6;
async function $(e, a, s, n, o) {
  o.updateWindowProps(e, { loading: !0, isPaused: !1 });
  try {
    const i = await f(a, s, n, "avg", !0);
    o.updateAnalysisData(e, i), o.setNodeAverages(i.node_voltages), o.setVoltageScale({
      criticalHigh: 1.1,
      highWarning: 1.06,
      lowWarning: 0.94,
      criticalLow: 0.9,
      baseVoltage: 230
    });
  } catch (i) {
    console.error("[voltage_heatmap] fetch failed", i), o.setAnalysisLoading(e, !1);
  }
}
const L = {
  type: "voltage_heatmap",
  category: "system",
  label: "Voltage Heat Map",
  description: "Visualize average voltage distributions across the entire map or a selected branch.",
  permissions: ["analytics:voltage", "topology:read"],
  icon: u,
  color: "orange",
  appliesToNodes: (e, a = 0) => !0,
  // Heatmap can run with no selection (entire grid)
  async handleRun(e) {
    const a = e.selectedNodes.map((r) => r.id), s = a.length === 1 ? a[0] : null, n = s ? e.selectedNodes[0]?.name ?? "Branch" : "Entire Grid", o = e.openAnalysisWindow("voltage_heatmap", n), { start: i, end: l } = e.dateRange;
    if (!i || !l) {
      console.error("[voltage_heatmap] Cannot run analysis: simulation time range is missing.");
      return;
    }
    try {
      const r = await C(s, i, l), c = Number(e.systemConfig.analytics_threshold || W);
      r.estimated_rows > c ? e.updateWindowProps(o, {
        loading: !1,
        isPaused: !0,
        estimatedRows: r.estimated_rows,
        pendingRequest: { nodeId: s, start: i, end: l }
      }) : await $(o, s, i, l, e);
    } catch (r) {
      console.error("[voltage_heatmap] estimate failed", r), e.setAnalysisLoading(o, !1);
    }
  },
  renderWindow(e, a) {
    const s = e.pendingRequest ?? { nodeId: e.nodeId, start: "", end: "" }, n = () => {
      a.updateWindow?.({ loading: !0, isPaused: !1 }), f(s.nodeId, s.start, s.end, "avg", !0).then((o) => {
        a.updateWindow?.({ data: o, loading: !1 }), a.setNodeAverages?.(o.node_voltages), a.setVoltageScale?.({
          criticalHigh: 1.1,
          highWarning: 1.06,
          lowWarning: 0.94,
          criticalLow: 0.9,
          baseVoltage: 230
        });
      });
    };
    return x(V, {
      isOpen: e.isOpen,
      onClose: () => {
        a.onClose();
      },
      onMinimize: a.onMinimize,
      loading: e.loading,
      data: e.data,
      estimatedRows: e.estimatedRows,
      nodeName: e.nodeName,
      isMinimized: e.isMinimized,
      isPaused: e.isPaused,
      zIndex: e.zIndex ?? 1e3,
      onConfirm: n,
      onFocus: a.onFocus
    });
  }
};
export {
  L as default,
  L as voltageHeatMapPlugin
};
