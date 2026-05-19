import { AlertTriangle as G, Clock as H, Activity as R } from "lucide-react";
import { memo as Y, useRef as E, useEffect as k, createElement as K } from "react";
import { j as o, A as q, g as Q, a as J } from "../../AnalysisWindow-DCpKwrtw.js";
import { Group as f, Text as c, Select as X, Box as g, Stack as S, Paper as Z, Button as _, Grid as h } from "@mantine/core";
import { m as P, r as ee, b as te, d as oe } from "../../perf-B5tCobrD.js";
import { R as w, E as j } from "../../ResizableChartPanel-CM0DGavf.js";
import { S as se } from "../../ScadaLoadingAnimation-CR8nixEL.js";
const z = "/api/plugins/voltage";
function T(e, t, a, r = !1) {
  const s = new URLSearchParams({ start_time: e, end_time: t });
  return a != null && s.set("degrees", String(a)), r && s.set("force", "true"), s.toString();
}
async function L(e, t) {
  const a = await P(`${e}:fetch`, () => fetch(t));
  if (ee(a.headers.get("Server-Timing")), !a.ok) throw new Error(`${e} failed: ${a.status}`);
  return P(`${e}:parse`, () => a.json());
}
async function C(e, t, a, r, s = !1) {
  const i = `${z}/${e.join(",")}?${T(t, a, r, s)}`;
  return L("voltage", i);
}
async function ne(e, t, a, r) {
  const s = `${z}/${e.join(",")}/estimate?${T(t, a, r)}`;
  return L("voltage_estimate", s);
}
function ie(e) {
  return {
    tooltip: { trigger: "axis", axisPointer: { type: "cross" } },
    legend: {
      data: ["Phase A", "Phase B", "Phase C"],
      textStyle: { color: "#A6A7AB", fontSize: 10 },
      top: 0,
      itemWidth: 10
    },
    grid: { left: 10, right: 10, bottom: 20, top: 40, containLabel: !0 },
    xAxis: {
      type: "category",
      data: e.map((t) => t.voltage),
      axisLabel: { color: "#A6A7AB", fontSize: 10 },
      splitLine: { show: !0, lineStyle: { color: "#25262B" } }
    },
    yAxis: {
      type: "value",
      show: !1,
      splitLine: { lineStyle: { color: "#25262B" } }
    },
    series: [
      {
        name: "Phase A",
        type: "line",
        data: e.map((t) => t.phase_a),
        itemStyle: { color: "#fa5252" },
        areaStyle: { opacity: 0.2 },
        showSymbol: !1,
        smooth: !0
      },
      {
        name: "Phase B",
        type: "line",
        data: e.map((t) => t.phase_b),
        itemStyle: { color: "#40c057" },
        areaStyle: { opacity: 0.2 },
        showSymbol: !1,
        smooth: !0
      },
      {
        name: "Phase C",
        type: "line",
        data: e.map((t) => t.phase_c),
        itemStyle: { color: "#228be6" },
        areaStyle: { opacity: 0.2 },
        showSymbol: !1,
        smooth: !0
      }
    ]
  };
}
function ae(e) {
  return {
    tooltip: {
      trigger: "axis",
      backgroundColor: "rgba(26, 27, 30, 0.95)",
      borderColor: "#373A40",
      textStyle: { color: "#C1C2C5" },
      formatter: (t) => {
        const a = t[0].axisValue, r = t.find((d) => d.seriesName === "P10"), s = t.find((d) => d.seriesName === "P90"), i = t.find((d) => d.seriesName === "Median"), n = r?.value || 0, l = r && s ? (n + s.value).toFixed(2) : "N/A";
        return `
                    <div style="font-family: monospace; font-size: 11px;">
                        <div style="margin-bottom: 4px; border-bottom: 1px solid #373A40; padding-bottom: 2px;">${a}</div>
                        <div style="display: flex; justify-content: space-between; gap: 20px;">
                            <span style="color: #A6A7AB">90p:</span>
                            <span style="color: #fff; font-weight: bold;">${l}V</span>
                        </div>
                        <div style="display: flex; justify-content: space-between; gap: 20px;">
                            <span style="color: #fab005">Median:</span>
                            <span style="color: #fff; font-weight: bold;">${i?.value.toFixed(2)}V</span>
                        </div>
                        <div style="display: flex; justify-content: space-between; gap: 20px;">
                            <span style="color: #A6A7AB">10p:</span>
                            <span style="color: #fff; font-weight: bold;">${n.toFixed(2)}V</span>
                        </div>
                    </div>
                `;
      }
    },
    grid: { left: 40, right: 20, bottom: 20, top: 40, containLabel: !0 },
    xAxis: {
      type: "category",
      data: e.map((t) => t.date),
      axisLabel: { color: "#A6A7AB", fontSize: 10 },
      splitLine: { show: !0, lineStyle: { color: "#25262B" } }
    },
    yAxis: {
      type: "value",
      scale: !0,
      axisLabel: { color: "#A6A7AB", fontSize: 10 },
      splitLine: { lineStyle: { color: "#25262B" } }
    },
    series: [
      {
        name: "P10",
        type: "line",
        data: e.map((t) => parseFloat((t.p10 || 0).toFixed(2))),
        lineStyle: { opacity: 0 },
        stack: "confidence-band",
        symbol: "none"
      },
      {
        name: "P90",
        type: "line",
        data: e.map((t) => parseFloat(((t.p90 || 0) - (t.p10 || 0)).toFixed(2))),
        lineStyle: { opacity: 0 },
        stack: "confidence-band",
        areaStyle: { color: "rgba(200, 200, 200, 0.2)" },
        symbol: "none"
      },
      {
        name: "Median",
        type: "line",
        data: e.map((t) => parseFloat((t.p50 || 0).toFixed(2))),
        itemStyle: { color: "#fab005" },
        showSymbol: !1,
        smooth: !0,
        zIndex: 10
      }
    ]
  };
}
function re(e) {
  return {
    tooltip: {
      trigger: "item",
      backgroundColor: "rgba(26, 27, 30, 0.95)",
      borderColor: "#373A40",
      textStyle: { color: "#C1C2C5", fontSize: 11, fontFamily: "monospace" },
      formatter: (t) => {
        const [a, r, s] = t.data;
        return `Loading: ${a.toFixed(1)} kWh<br/>Voltage: ${r.toFixed(1)} V<br/>Occurrences: ${s}`;
      }
    },
    grid: { left: 40, right: 20, bottom: 40, top: 40, containLabel: !0 },
    xAxis: {
      type: "value",
      name: "Loading (kWh)",
      nameLocation: "middle",
      nameGap: 25,
      scale: !0,
      nameTextStyle: { color: "#A6A7AB", fontSize: 10 },
      axisLabel: { color: "#A6A7AB", fontSize: 10, fontFamily: "monospace" },
      splitLine: { lineStyle: { color: "#25262B" } }
    },
    yAxis: {
      type: "value",
      name: "Voltage (V)",
      nameLocation: "middle",
      nameGap: 30,
      scale: !0,
      nameTextStyle: { color: "#A6A7AB", fontSize: 10 },
      axisLabel: { color: "#A6A7AB", fontSize: 10, fontFamily: "monospace" },
      splitLine: { lineStyle: { color: "#25262B" } }
    },
    visualMap: {
      show: !1,
      dimension: 1,
      min: 110,
      max: 130,
      inRange: { color: ["#fa5252", "#fab005", "#40c057", "#fab005", "#fa5252"] }
    },
    series: [
      {
        name: "Density",
        type: "scatter",
        symbolSize: 4,
        symbol: "roundRect",
        itemStyle: { borderRadius: 1, opacity: 0.6 },
        data: e.map((t) => [t.loading, t.voltage, t.count])
      }
    ]
  };
}
function v({ message: e }) {
  return /* @__PURE__ */ o.jsx(g, { style: { height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }, children: /* @__PURE__ */ o.jsx(c, { size: "xs", c: "dimmed", fs: "italic", children: e }) });
}
const le = Y(function({
  isOpen: t,
  onClose: a,
  loading: r,
  data: s,
  scatterData: i,
  timeSeriesData: n,
  estimatedRows: l,
  nodeName: d,
  degrees: p,
  onDegreesChange: I,
  isMinimized: N,
  onMinimize: D,
  isPaused: B,
  onConfirm: M,
  onFocus: $,
  zIndex: F,
  layoutMode: W
}) {
  const u = E(null), x = E(!1), A = d ?? "unknown";
  k(() => {
    const m = s && s.length > 0 || i && i.length > 0 || n && n.length > 0;
    m && u.current === null && (u.current = performance.now(), x.current = !1), m || (u.current = null);
  }, [s, i, n]);
  const b = () => {
    !x.current && u.current !== null && (x.current = !0, te("chart:first_ready", performance.now() - u.current), setTimeout(() => oe("voltage"), 0));
  }, O = () => {
    !s || s.length === 0 || J(s, `voltage_${d?.replace(/\s+/g, "_")}`);
  }, V = () => !s || s.length === 0 ? "" : Q(s), U = /* @__PURE__ */ o.jsxs(f, { gap: "xs", wrap: "wrap", children: [
    /* @__PURE__ */ o.jsx(c, { size: "xs", c: "dimmed", children: "Search Depth:" }),
    /* @__PURE__ */ o.jsx(
      X,
      {
        size: "xs",
        w: 120,
        value: p === null ? "downstream" : p.toString(),
        onChange: (m) => {
          m !== null && I(m === "downstream" ? null : parseInt(m));
        },
        allowDeselect: !1,
        data: [
          { label: "Strictly Downstream", value: "downstream" },
          { label: "1 Degree (Proximal)", value: "1" },
          { label: "2 Degrees", value: "2" },
          { label: "3 Degrees", value: "3" },
          { label: "4 Degrees", value: "4" },
          { label: "5 Degrees", value: "5" },
          { label: "10 Degrees", value: "10" }
        ],
        comboboxProps: { withinPortal: !0, zIndex: 1e5 }
      }
    )
  ] });
  return /* @__PURE__ */ o.jsx(
    q,
    {
      isOpen: t,
      onClose: a,
      onMinimize: D,
      isMinimized: N,
      title: `Voltage Analysis: ${d}`,
      storageKey: "voltageWindowPos",
      zIndex: F ?? 20,
      onFocus: $,
      filterContent: U,
      onExport: O,
      onCopy: V,
      loading: r,
      layoutMode: W,
      children: B ? /* @__PURE__ */ o.jsx(g, { style: { display: "flex", alignItems: "center", justifyContent: "center", height: "100%", padding: "20px" }, children: /* @__PURE__ */ o.jsx(S, { align: "center", gap: "xl", style: { maxWidth: 500 }, children: /* @__PURE__ */ o.jsxs(g, { style: { position: "relative", width: "100%" }, children: [
        /* @__PURE__ */ o.jsx(
          g,
          {
            style: {
              position: "absolute",
              inset: 0,
              backgroundImage: "linear-gradient(rgba(51, 154, 240, 0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(51, 154, 240, 0.05) 1px, transparent 1px)",
              backgroundSize: "15px 15px",
              border: "1px solid rgba(51, 154, 240, 0.2)",
              borderRadius: "8px",
              backgroundColor: "rgba(26, 27, 30, 0.3)"
            }
          }
        ),
        /* @__PURE__ */ o.jsxs(S, { p: "xl", align: "center", gap: "md", style: { position: "relative" }, children: [
          /* @__PURE__ */ o.jsxs(f, { gap: "xs", children: [
            /* @__PURE__ */ o.jsx(G, { size: 18, color: "#fab005" }),
            /* @__PURE__ */ o.jsx(c, { size: "sm", ff: "monospace", fw: 700, c: "blue.4", style: { letterSpacing: "1px" }, children: "DATASET_CAPACITY_WARNING" })
          ] }),
          /* @__PURE__ */ o.jsxs(S, { gap: 4, align: "center", children: [
            /* @__PURE__ */ o.jsx(c, { size: "xs", ff: "monospace", c: "dimmed", children: "ANALYSIS SCOPE" }),
            /* @__PURE__ */ o.jsxs(c, { size: "xl", ff: "monospace", fw: 700, c: "white", children: [
              (l / 1e6).toFixed(1),
              "M READINGS"
            ] })
          ] }),
          /* @__PURE__ */ o.jsx(
            Z,
            {
              withBorder: !0,
              p: "xs",
              bg: "rgba(51, 154, 240, 0.05)",
              style: { borderStyle: "dashed", borderColor: "rgba(51, 154, 240, 0.3)" },
              children: /* @__PURE__ */ o.jsxs(f, { gap: "sm", children: [
                /* @__PURE__ */ o.jsx(H, { size: 14, color: "#339af0" }),
                /* @__PURE__ */ o.jsxs(c, { size: "xs", ff: "monospace", c: "blue.4", children: [
                  "EST. COMPUTE TIME: ",
                  Math.ceil(l / 1e7 * 8),
                  "s"
                ] })
              ] })
            }
          ),
          /* @__PURE__ */ o.jsx(g, { mt: "xs", children: /* @__PURE__ */ o.jsxs(c, { size: "xs", c: "dimmed", ff: "monospace", ta: "center", style: { maxWidth: 350, lineHeight: 1.4 }, children: [
            "SYSTEM IMPACT: MODERATE",
            /* @__PURE__ */ o.jsx("br", {}),
            "LARGE QUERIES MAY TEMPORARILY AFFECT CONCURRENT ANALYTICS PERFORMANCE."
          ] }) }),
          /* @__PURE__ */ o.jsxs(f, { mt: "lg", gap: "md", children: [
            /* @__PURE__ */ o.jsx(_, { variant: "subtle", size: "xs", color: "gray", onClick: a, ff: "monospace", children: "[ ABORT_ADJUST ]" }),
            /* @__PURE__ */ o.jsx(
              _,
              {
                color: "blue",
                size: "sm",
                onClick: M,
                leftSection: /* @__PURE__ */ o.jsx(R, { size: 16 }),
                ff: "monospace",
                variant: "light",
                style: { border: "1px solid rgba(51, 154, 240, 0.4)" },
                children: "EXECUTE_QUERY_PLAN"
              }
            )
          ] })
        ] })
      ] }) }) }) : r ? /* @__PURE__ */ o.jsx(se, { estimatedRows: l }) : s.length === 0 && i.length === 0 ? /* @__PURE__ */ o.jsx(g, { style: { display: "flex", alignItems: "center", justifyContent: "center", height: "100%" }, children: /* @__PURE__ */ o.jsx(c, { c: "dimmed", children: "No distribution data found for this node in the selected date range." }) }) : /* @__PURE__ */ o.jsx(g, { style: { height: "100%", padding: "16px", overflowY: "auto" }, children: /* @__PURE__ */ o.jsxs(h, { gutter: "xl", align: "start", children: [
        /* @__PURE__ */ o.jsx(h.Col, { span: { base: 12, md: 4, lg: 3 }, children: /* @__PURE__ */ o.jsx(
          w,
          {
            title: "VOLTAGE_DISTRIBUTION (KDE)",
            storageKey: `voltage-kde-${A}`,
            defaultHeight: 380,
            children: s.length === 0 ? /* @__PURE__ */ o.jsx(v, { message: "No distribution data" }) : /* @__PURE__ */ o.jsx(
              j,
              {
                notMerge: !0,
                lazyUpdate: !0,
                onChartReady: b,
                style: { height: "100%", width: "100%" },
                option: ie(s)
              },
              `kde-${s.length}`
            )
          }
        ) }),
        /* @__PURE__ */ o.jsx(h.Col, { span: { base: 12, md: 8, lg: 5 }, children: /* @__PURE__ */ o.jsx(
          w,
          {
            title: "VOLTAGE_STABILITY (MEDIAN & 10/90 BANDS)",
            storageKey: `voltage-timeseries-${A}`,
            defaultHeight: 380,
            children: n.length === 0 ? /* @__PURE__ */ o.jsx(v, { message: "No stability data" }) : /* @__PURE__ */ o.jsx(
              j,
              {
                notMerge: !0,
                lazyUpdate: !0,
                onChartReady: b,
                style: { height: "100%", width: "100%" },
                option: ae(n)
              },
              `stability-${n.length}`
            )
          }
        ) }),
        /* @__PURE__ */ o.jsx(h.Col, { span: { base: 12, md: 12, lg: 4 }, children: /* @__PURE__ */ o.jsx(
          w,
          {
            title: "VOLTAGE_VS_LOADING (HEATMAP)",
            storageKey: `voltage-heatmap-${A}`,
            defaultHeight: 380,
            children: i.length === 0 ? /* @__PURE__ */ o.jsx(v, { message: "No correlation data" }) : /* @__PURE__ */ o.jsx(
              j,
              {
                notMerge: !0,
                lazyUpdate: !0,
                onChartReady: b,
                style: { height: "100%", width: "100%" },
                option: re(i)
              },
              `scatter-${i.length}`
            )
          }
        ) })
      ] }) })
    }
  );
}), de = 2e6, y = 5;
async function ce(e, t, a, r, s, i) {
  i.updateWindowProps(e, { loading: !0, isPaused: !1 });
  try {
    const n = await C(t, a, r, s);
    i.updateWindowProps(e, {
      data: n.distribution ?? [],
      scatterData: n.scatter ?? [],
      timeSeriesData: n.timeseries ?? [],
      loading: !1
    }), n.downstream_node_ids?.length && (i.addHighlightedNodes(n.downstream_node_ids), i.selectAndNavigateToNode([...t, ...n.downstream_node_ids])), n.downstream_edge_ids?.length && i.addHighlightedEdges(n.downstream_edge_ids);
  } catch (n) {
    console.error("[voltage] fetch failed", n), i.setAnalysisLoading(e, !1);
  }
}
const xe = {
  type: "voltage",
  category: "node",
  label: "Voltage Distribution",
  description: "Display voltage distributions and timeseries line charts for nodes.",
  permissions: ["cim:read", "topology:read", "analytics:voltage"],
  icon: R,
  color: "cyan",
  appliesToNodes: (e, t = 0) => e.length > 0 || t > 0,
  async handleRun(e) {
    let t = e.selectedNodes.map((l) => l.id);
    if (t.length === 0 && e.selectedEdgeIds.length > 0 && (t = e.resolveEdgeNodesToNodeIds(e.selectedEdgeIds)), t.length === 0) return;
    const a = t.length === 1 ? e.selectedNodes[0]?.name ?? "Selected Asset" : `${t.length} Assets`, r = y, { start: s, end: i } = e.dateRange, n = e.openAnalysisWindow("voltage", a);
    e.updateWindowProps(n, { degrees: r, nodeIds: t, start: s, end: i });
    try {
      const l = await ne(t, s, i, r);
      l.downstream_node_ids?.length && e.addHighlightedNodes(l.downstream_node_ids), l.downstream_edge_ids?.length && e.addHighlightedEdges(l.downstream_edge_ids);
      const d = Number(e.systemConfig.analytics_threshold || de);
      l.estimated_rows > d ? e.updateWindowProps(n, {
        loading: !1,
        isPaused: !0,
        estimatedRows: l.estimated_rows,
        pendingRequest: { nodeIds: t, start: s, end: i, degrees: r }
      }) : await ce(n, t, s, i, r, e);
    } catch (l) {
      console.error("[voltage] estimate failed", l), e.setAnalysisLoading(n, !1);
    }
  },
  renderWindow(e, t) {
    const a = () => {
      const s = e.degrees ?? y, i = e.nodeIds || [], n = e.start || "", l = e.end || "";
      t.updateWindow && (t.updateWindow({ loading: !0, isPaused: !1 }), C(i, n, l, s, !0).then((d) => t.updateWindow({
        data: d.distribution || [],
        scatterData: d.scatter || [],
        timeSeriesData: d.timeseries || [],
        loading: !1,
        pendingRequest: { nodeIds: i, start: n, end: l, degrees: s }
      })).catch(() => t.updateWindow({ loading: !1 })));
    }, r = (s) => {
      const i = s ?? y, n = e.nodeIds || [], l = e.start || "", d = e.end || "";
      t.updateWindow && (t.updateWindow({ loading: !0, degrees: i }), C(n, l, d, i).then((p) => t.updateWindow({
        data: p.distribution || [],
        scatterData: p.scatter || [],
        timeSeriesData: p.timeseries || [],
        loading: !1,
        pendingRequest: { nodeIds: n, start: l, end: d, degrees: i }
      })).catch(() => t.updateWindow({ loading: !1 })));
    };
    return K(le, {
      isOpen: e.isOpen,
      onClose: t.onClose,
      onMinimize: t.onMinimize,
      loading: e.loading,
      data: e.data,
      scatterData: e.scatterData || [],
      timeSeriesData: e.timeSeriesData || [],
      estimatedRows: e.estimatedRows,
      nodeName: e.nodeName,
      degrees: e.degrees ?? y,
      onDegreesChange: r,
      isMinimized: e.isMinimized,
      isPaused: e.isPaused,
      zIndex: e.zIndex ?? 1e3,
      layoutMode: "floating",
      onConfirm: a,
      onFocus: t.onFocus
    });
  }
};
export {
  xe as default,
  xe as voltagePlugin
};
