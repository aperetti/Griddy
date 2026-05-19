import { AlertCircle as y, Zap as f, CheckCircle2 as P, Activity as w } from "lucide-react";
import { createElement as C } from "react";
import { j as s, A as R } from "../../AnalysisWindow-DCpKwrtw.js";
import { Box as j, LoadingOverlay as E, Stack as c, Alert as u, Text as r, Button as g, Paper as N, Group as M, Badge as k } from "@mantine/core";
const z = "/api/plugins/load_heatmap";
async function D(e, a, n, o = "mean") {
  const t = new URLSearchParams({
    start_time: a,
    end_time: n,
    agg: o
  });
  e && t.append("node_id", e);
  const i = await fetch(`${z}/estimate?${t.toString()}`);
  if (!i.ok)
    throw new Error(`Failed to fetch load map estimate: ${i.statusText}`);
  return i.json();
}
async function _(e, a, n, o = "mean") {
  const t = new URLSearchParams({
    start_time: a,
    end_time: n,
    agg: o
  });
  e && t.append("node_id", e);
  const i = await fetch(`${z}/map?${t.toString()}`);
  if (!i.ok) {
    const d = await i.json();
    throw new Error(d.detail || `Failed to fetch load map: ${i.statusText}`);
  }
  return i.json();
}
const H = ({
  isOpen: e,
  onClose: a,
  onMinimize: n,
  loading: o,
  data: t,
  estimatedRows: i,
  nodeName: d,
  isMinimized: l,
  isPaused: m,
  zIndex: L,
  onConfirm: p,
  onFocus: A,
  startTime: v,
  endTime: S
}) => {
  const T = t?.start_time || v, b = t?.end_time || S, x = (h) => {
    if (!h) return "N/A";
    try {
      return new Date(h).toLocaleDateString(void 0, {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit"
      });
    } catch {
      return h;
    }
  };
  return /* @__PURE__ */ s.jsx(
    R,
    {
      title: `Network Load: ${d}`,
      isOpen: e,
      isMinimized: l,
      onClose: a,
      onMinimize: n,
      onFocus: A,
      zIndex: L,
      storageKey: "load_heatmap_window",
      children: /* @__PURE__ */ s.jsxs(j, { p: "md", pos: "relative", style: { height: "100%", minHeight: l ? 0 : 320, display: "flex", flexDirection: "column" }, children: [
        /* @__PURE__ */ s.jsx(
          E,
          {
            visible: o,
            zIndex: 1001,
            overlayProps: { blur: 1, color: "rgba(0,0,0,0.4)", opacity: 0.6 },
            loaderProps: { color: "blue", size: "md" }
          }
        ),
        m ? /* @__PURE__ */ s.jsxs(c, { gap: "md", py: "xl", children: [
          /* @__PURE__ */ s.jsx(
            u,
            {
              icon: /* @__PURE__ */ s.jsx(y, { size: 18 }),
              title: "Large Data Set",
              color: "blue",
              variant: "light",
              children: /* @__PURE__ */ s.jsxs(r, { size: "sm", children: [
                "This heatmap will process approximately",
                " ",
                /* @__PURE__ */ s.jsx(r, { component: "span", fw: 700, children: i.toLocaleString() }),
                " rows of edge load data. This may take a few moments to aggregate and render across the map."
              ] })
            }
          ),
          /* @__PURE__ */ s.jsx(
            g,
            {
              onClick: p,
              variant: "filled",
              color: "blue",
              size: "md",
              fullWidth: !0,
              leftSection: /* @__PURE__ */ s.jsx(f, { size: 16 }),
              children: "Process and Visualize"
            }
          )
        ] }) : t ? /* @__PURE__ */ s.jsxs(c, { gap: "md", children: [
          /* @__PURE__ */ s.jsxs(N, { withBorder: !0, p: "sm", bg: "rgba(255,255,255,0.03)", style: { borderStyle: "dashed" }, children: [
            /* @__PURE__ */ s.jsxs(M, { justify: "space-between", mb: "xs", children: [
              /* @__PURE__ */ s.jsx(r, { size: "xs", c: "dimmed", tt: "uppercase", lts: "1px", fw: 700, children: "Active Layer" }),
              /* @__PURE__ */ s.jsx(k, { color: "green", variant: "filled", size: "sm", radius: "xs", leftSection: /* @__PURE__ */ s.jsx(P, { size: 12 }), children: "Live Map" })
            ] }),
            /* @__PURE__ */ s.jsxs(c, { gap: 4, children: [
              /* @__PURE__ */ s.jsx(r, { size: "sm", fw: 600, children: "Network Analysis Complete" }),
              /* @__PURE__ */ s.jsxs(r, { size: "xs", c: "dimmed", children: [
                "Processed ",
                t.edge_count || "0",
                " branches for ",
                d,
                ". Heatmap weights applied to map geometry."
              ] })
            ] })
          ] }),
          t?.warning && /* @__PURE__ */ s.jsx(u, { icon: /* @__PURE__ */ s.jsx(y, { size: 14 }), title: "Calculation Note", color: "orange", variant: "light", children: t.warning }),
          /* @__PURE__ */ s.jsx(u, { color: "indigo", variant: "light", py: "xs", icon: /* @__PURE__ */ s.jsx(w, { size: 14 }), children: /* @__PURE__ */ s.jsxs(c, { gap: 4, children: [
            /* @__PURE__ */ s.jsxs(r, { size: "xs", children: [
              "Color scale: ",
              /* @__PURE__ */ s.jsx(r, { component: "span", c: "green", fw: 700, children: "Green (Low)" }),
              " → ",
              /* @__PURE__ */ s.jsx(r, { component: "span", c: "orange", fw: 700, children: "Yellow" }),
              " → ",
              /* @__PURE__ */ s.jsx(r, { component: "span", c: "red", fw: 700, children: "Red (High)" })
            ] }),
            /* @__PURE__ */ s.jsxs(r, { size: "xs", c: "dimmed", children: [
              "Period: ",
              /* @__PURE__ */ s.jsx(r, { component: "span", fw: 600, c: "indigo", children: x(T) }),
              " to ",
              /* @__PURE__ */ s.jsx(r, { component: "span", fw: 600, c: "indigo", children: x(b) })
            ] })
          ] }) }),
          /* @__PURE__ */ s.jsx(
            g,
            {
              variant: "outline",
              color: "indigo",
              onClick: p,
              size: "xs",
              mt: "xs",
              leftSection: /* @__PURE__ */ s.jsx(f, { size: 14 }),
              children: "Refresh Load Statistics"
            }
          )
        ] }) : /* @__PURE__ */ s.jsxs(c, { justify: "center", align: "center", style: { flex: 1 }, py: "xl", children: [
          /* @__PURE__ */ s.jsx(j, { style: { opacity: 0.3 }, children: /* @__PURE__ */ s.jsx(w, { size: 48 }) }),
          /* @__PURE__ */ s.jsx(r, { size: "sm", c: "dimmed", fs: "italic", children: o ? "Crunching numbers..." : "Initialize Analysis to begin heatmap generation." }),
          !o && /* @__PURE__ */ s.jsx(g, { size: "xs", variant: "subtle", onClick: p, color: "blue", children: "Force Initialize" })
        ] })
      ] })
    }
  );
}, W = 5e6;
async function F(e, a, n, o, t) {
  t.setAnalysisLoading(e, !0);
  try {
    const i = await _(a, n, o, "mean");
    t.updateAnalysisData(e, i), t.setEdgeAverages(i.edge_loads), t.setAnalysisLoading(e, !1);
  } catch (i) {
    console.error("[load_heatmap] fetch failed", i), t.setAnalysisLoading(e, !1);
  }
}
const q = {
  type: "load_heatmap",
  category: "system",
  label: "Network Load Heatmap",
  description: "Visualize average power load/current distributions across the network edges.",
  permissions: ["analytics:load", "topology:read"],
  icon: f,
  color: "indigo",
  appliesToNodes: (e, a = 0) => !0,
  // Load heatmap can run for entire grid or selection
  async handleRun(e) {
    const a = e.selectedNodes.map((l) => l.id), n = a.length === 1 ? a[0] : null, o = n ? e.selectedNodes[0]?.name ?? "Branch" : "Entire Grid", t = e.openAnalysisWindow("load_heatmap", o), { start: i, end: d } = e.dateRange;
    if (!i || !d) {
      console.error("[load_heatmap] Cannot run analysis: simulation time range is missing or uninitialized.");
      return;
    }
    try {
      const l = await D(n, i, d), m = Number(e.systemConfig.analytics_threshold || W);
      e.updateWindowProps(t, {
        startTime: i,
        endTime: d
      }), l.estimated_rows > m ? e.updateWindowProps(t, {
        loading: !1,
        isPaused: !0,
        estimatedRows: l.estimated_rows,
        pendingRequest: { nodeId: n, start: i, end: d }
      }) : await F(t, n, i, d, e);
    } catch (l) {
      console.error("[load_heatmap] estimate failed", l), e.setAnalysisLoading(t, !1);
    }
  },
  renderWindow(e, a) {
    const n = () => {
      a.updateWindow?.({ loading: !0, isPaused: !1 });
      const o = e.pendingRequest ?? { nodeId: e.nodeId, start: e.startTime, end: e.endTime };
      _(o.nodeId, o.start, o.end, "mean").then((t) => {
        a.updateWindow?.({ data: t, loading: !1 });
      });
    };
    return C(H, {
      isOpen: e.isOpen,
      onClose: a.onClose,
      onMinimize: a.onMinimize,
      loading: e.loading,
      data: e.data,
      estimatedRows: e.estimatedRows,
      nodeName: e.nodeName,
      isMinimized: e.isMinimized,
      isPaused: e.isPaused,
      zIndex: e.zIndex ?? 1e3,
      onConfirm: n,
      onFocus: a.onFocus,
      startTime: e.startTime,
      endTime: e.endTime
    });
  }
};
export {
  q as default,
  q as loadHeatMapPlugin
};
