import { AlertTriangle as Re, Clock as Ee, Activity as Pe, BarChart3 as ke } from "lucide-react";
import { memo as Me, useState as k, useRef as te, useEffect as oe, useMemo as P, createElement as Ie } from "react";
import { j as t, A as Ne, g as We, a as De } from "../../AnalysisWindow-DCpKwrtw.js";
import { Box as v, Stack as D, Group as M, Text as b, Paper as He, Button as ne, SimpleGrid as se, Slider as re, Select as H } from "@mantine/core";
import { m as le, r as Le, a as L, b as Be, d as $e } from "../../perf-B5tCobrD.js";
import { R as X, E as J, c as Oe } from "../../ResizableChartPanel-CM0DGavf.js";
import { S as Ue } from "../../ScadaLoadingAnimation-CR8nixEL.js";
const ae = "/api/plugins/consumption";
function de(o, n, r = !1) {
  const a = new URLSearchParams({ start_time: o, end_time: n });
  return r && a.set("force", "true"), a.toString();
}
async function ce(o, n) {
  const r = await le(`${o}:fetch`, () => fetch(n));
  if (Le(r.headers.get("Server-Timing")), !r.ok) throw new Error(`${o} failed: ${r.status}`);
  return le(`${o}:parse`, () => r.json());
}
async function ue(o, n, r, a = !1) {
  const e = `${ae}/${o.join(",")}?${de(n, r, a)}`;
  return ce("consumption", e);
}
async function Fe(o, n, r) {
  const a = `${ae}/${o.join(",")}/estimate?${de(n, r)}`;
  return ce("consumption_estimate", a);
}
function Ke(o, n) {
  return {
    tooltip: {
      trigger: "axis",
      backgroundColor: "rgba(26, 27, 30, 0.9)",
      borderColor: "#373A40",
      textStyle: { color: "#C1C2C5", fontSize: 11 }
    },
    useUTC: !0,
    legend: {
      data: ["kWh Delivered", "kWh Received", "Net Consumption", "Temp (24h Avg)"],
      selected: { "kWh Delivered": !1 },
      textStyle: { color: "#A6A7AB", fontSize: 10 },
      top: 0
    },
    grid: { left: 40, right: 40, bottom: 35, top: 45, containLabel: !0 },
    dataZoom: [
      { type: "inside", start: 0, end: 100, xAxisIndex: 0 },
      {
        type: "slider",
        start: 0,
        end: 100,
        height: 15,
        bottom: 10,
        textStyle: { color: "#A6A7AB" },
        borderColor: "#373A40",
        fillerColor: "rgba(51, 154, 240, 0.2)",
        xAxisIndex: 0
      }
    ],
    xAxis: {
      type: "time",
      axisLabel: {
        color: "#A6A7AB",
        fontSize: 10,
        formatter: (r) => new Date(r).toLocaleDateString(void 0, { month: "short", day: "numeric" })
      },
      axisLine: { lineStyle: { color: "#373A40" } },
      splitLine: { show: !1 }
    },
    yAxis: [
      {
        type: "value",
        name: "kWh",
        scale: !0,
        axisLabel: { color: "#A6A7AB", fontSize: 10 },
        splitLine: { lineStyle: { color: "#25262B" } }
      },
      {
        type: "value",
        name: "°C",
        scale: !0,
        axisLabel: { color: "#FA5252", fontSize: 10 },
        splitLine: { show: !1 }
      }
    ],
    series: [
      {
        name: "kWh Delivered",
        type: "line",
        data: o.map((r) => [r[0], r[1]]),
        smooth: !0,
        showSymbol: !1,
        itemStyle: { color: "#339af0" },
        areaStyle: {
          opacity: 0.1,
          color: {
            type: "linear",
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: "#339af0" },
              { offset: 1, color: "rgba(51, 154, 240, 0)" }
            ]
          }
        },
        markLine: {
          symbol: ["none", "none"],
          silent: !0,
          data: n
        }
      },
      {
        name: "kWh Received",
        type: "line",
        data: o.map((r) => [r[0], r[3]]),
        smooth: !0,
        showSymbol: !1,
        itemStyle: { color: "#40c057" },
        areaStyle: {
          opacity: 0.1,
          color: {
            type: "linear",
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: "#40c057" },
              { offset: 1, color: "rgba(64, 192, 87, 0)" }
            ]
          }
        }
      },
      {
        name: "Net Consumption",
        type: "line",
        data: o.map((r) => [r[0], r[4]]),
        smooth: !0,
        showSymbol: !1,
        itemStyle: { color: "#ffd43b" },
        lineStyle: { width: 1.5, type: "solid" }
      },
      {
        name: "Temp (24h Avg)",
        type: "line",
        yAxisIndex: 1,
        data: o.map((r) => [r[0], r[2]]),
        smooth: !0,
        showSymbol: !1,
        itemStyle: { color: "#fa5252" },
        lineStyle: { width: 1, opacity: 0.5 }
      }
    ]
  };
}
function Ye(o) {
  return {
    tooltip: {
      trigger: "axis",
      backgroundColor: "rgba(26, 27, 30, 0.9)",
      borderColor: "#373A40",
      textStyle: { color: "#C1C2C5" }
    },
    grid: { left: 50, right: 30, bottom: 25, top: 40, containLabel: !0 },
    xAxis: {
      type: "category",
      data: Array.from({ length: 24 }, (n, r) => `${r}:00`),
      axisLabel: { color: "#A6A7AB", fontSize: 10 },
      axisLine: { lineStyle: { color: "#373A40" } }
    },
    yAxis: {
      type: "value",
      name: "Avg kWh",
      scale: !0,
      axisLabel: { color: "#A6A7AB", fontSize: 10 },
      splitLine: { lineStyle: { color: "#25262B" } }
    },
    series: [
      {
        name: "Average Load",
        type: "line",
        data: o.map((n) => n.avg),
        itemStyle: { color: "#ffd43b" },
        areaStyle: {
          opacity: 0.2,
          color: {
            type: "linear",
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: "rgba(255, 212, 59, 0.3)" },
              { offset: 1, color: "rgba(255, 212, 59, 0)" }
            ]
          }
        },
        smooth: !0,
        showSymbol: !1
      }
    ]
  };
}
function Ge(o, n, r, a, e, m, f) {
  const C = [
    {
      name: "Summer Points",
      type: "scatter",
      data: o.map((y) => [y.x, y.y]),
      itemStyle: { color: "#fa5252", opacity: 0.5 },
      symbolSize: 6
    },
    {
      name: "Winter Points",
      type: "scatter",
      data: n.map((y) => [y.x, y.y]),
      itemStyle: { color: "#339af0", opacity: 0.5 },
      symbolSize: 6
    },
    {
      name: "Transition Points",
      type: "scatter",
      data: r.map((y) => [y.x, y.y]),
      itemStyle: { color: "#868e96", opacity: 0.5 },
      symbolSize: 6
    }
  ];
  return a && C.push({
    name: "Summer Regression",
    type: "line",
    data: [a.start, a.end],
    itemStyle: { color: "#e03131" },
    showSymbol: !1,
    lineStyle: { width: 2, type: "dashed" },
    smooth: !1
  }), e && C.push({
    name: "Winter Regression",
    type: "line",
    data: [e.start, e.end],
    itemStyle: { color: "#1c7ed6" },
    showSymbol: !1,
    lineStyle: { width: 2, type: "dashed" },
    smooth: !1
  }), a && C.push({
    name: "Summer Target",
    type: "scatter",
    data: [[m, a.slope * m + a.intercept]],
    itemStyle: {
      color: "#e03131",
      borderColor: "#fff",
      borderWidth: 1,
      shadowBlur: 5,
      shadowColor: "rgba(224, 49, 49, 0.8)"
    },
    symbolSize: 12,
    symbol: "diamond",
    label: {
      show: !0,
      formatter: (y) => `Summer: ${y.value[1].toFixed(2)} kWh`,
      position: "top",
      color: "#fff",
      fontSize: 10,
      fontWeight: "bold",
      backgroundColor: "rgba(0,0,0,0.6)",
      padding: [2, 4],
      borderRadius: 2
    }
  }), e && C.push({
    name: "Winter Target",
    type: "scatter",
    data: [[f, e.slope * f + e.intercept]],
    itemStyle: {
      color: "#1c7ed6",
      borderColor: "#fff",
      borderWidth: 1,
      shadowBlur: 5,
      shadowColor: "rgba(28, 126, 214, 0.8)"
    },
    symbolSize: 12,
    symbol: "diamond",
    label: {
      show: !0,
      formatter: (y) => `Winter: ${y.value[1].toFixed(2)} kWh`,
      position: "bottom",
      color: "#fff",
      fontSize: 10,
      fontWeight: "bold",
      backgroundColor: "rgba(0,0,0,0.6)",
      padding: [2, 4],
      borderRadius: 2
    }
  }), {
    tooltip: { trigger: "item", axisPointer: { type: "cross" } },
    grid: { left: 40, right: 20, bottom: 25, top: 10, containLabel: !0 },
    xAxis: {
      type: "value",
      nameTextStyle: { color: "#A6A7AB" },
      axisLabel: { color: "#A6A7AB", fontSize: 10 },
      splitLine: { show: !0, lineStyle: { color: "#25262B" } }
    },
    yAxis: {
      type: "value",
      scale: !0,
      axisLabel: { color: "#A6A7AB", fontSize: 10 },
      splitLine: { lineStyle: { color: "#25262B" } }
    },
    series: C
  };
}
const q = [
  { value: "0", label: "Jan" },
  { value: "1", label: "Feb" },
  { value: "2", label: "Mar" },
  { value: "3", label: "Apr" },
  { value: "4", label: "May" },
  { value: "5", label: "Jun" },
  { value: "6", label: "Jul" },
  { value: "7", label: "Aug" },
  { value: "8", label: "Sep" },
  { value: "9", label: "Oct" },
  { value: "10", label: "Nov" },
  { value: "11", label: "Dec" }
], ie = Array.from({ length: 24 }, (o, n) => ({
  value: n.toString(),
  label: `${n.toString().padStart(2, "0")}:00`
})), Xe = Me(function({
  isOpen: n,
  onClose: r,
  loading: a,
  data: e,
  estimatedRows: m,
  nodeName: f,
  isMinimized: C,
  onMinimize: y,
  isPaused: me,
  onConfirm: he,
  onFocus: pe,
  zIndex: ge,
  layoutMode: fe
}) {
  const [B, ye] = k("0"), [$, xe] = k("23"), [O, Q] = k("0"), [U, Z] = k("11"), [F, be] = k(-5), [K, we] = k(30), Y = f ?? "unknown", I = te(null), G = te(!1);
  oe(() => {
    e && e.length > 0 && I.current === null && (I.current = performance.now(), G.current = !1), (!e || e.length === 0) && (I.current = null);
  }, [e]);
  const Se = () => {
    !e || e.length === 0 || De(e, `consumption_${f?.replace(/\s+/g, "_")}`);
  }, Ae = () => !e || e.length === 0 ? "" : We(e);
  oe(() => {
    if (n && e && e.length > 0) {
      let s = 11, i = 0;
      for (let u = 0; u < e.length; u++) {
        const c = new Date(e[u].timestamp).getUTCMonth();
        c < s && (s = c), c > i && (i = c);
      }
      Q(s.toString()), Z(i.toString());
    }
  }, [n, e]);
  const W = P(() => {
    const s = parseInt(O), i = parseInt(U);
    return e.filter((u) => {
      const l = new Date(u.timestamp).getUTCMonth();
      return s <= i ? l >= s && l <= i : l >= s || l <= i;
    });
  }, [e, O, U]), V = P(() => {
    const s = parseInt(B), i = parseInt($);
    return W.filter((u) => {
      const l = new Date(u.timestamp).getUTCHours();
      return s <= i ? l >= s && l <= i : l >= s || l <= i;
    });
  }, [W, B, $]), N = P(
    () => L("memo:seasonal_regression", () => {
      const s = [], i = [], u = [];
      V.forEach((l) => {
        if (l.temperature != null && l.kwh_delivered != null) {
          const h = new Date(l.timestamp).getUTCMonth(), g = { x: l.temperature, y: l.kwh_delivered };
          h >= 4 && h <= 8 ? s.push(g) : h >= 10 || h <= 2 ? i.push(g) : u.push(g);
        }
      });
      const c = (l) => {
        if (l.length < 2) return null;
        const x = l.length;
        let h = 0, g = 0, w = 0, S = 0, T = l[0].x, d = l[0].x;
        for (const p of l)
          h += p.x, g += p.y, w += p.x * p.y, S += p.x * p.x, p.x < T && (T = p.x), p.x > d && (d = p.x);
        const z = x * S - h * h;
        if (z === 0) return null;
        const _ = (x * w - h * g) / z, A = (g - _ * h) / x;
        return {
          start: [T, _ * T + A],
          end: [d, _ * d + A],
          slope: _,
          intercept: A
        };
      };
      return {
        summer: c(s),
        winter: c(i),
        summerRaw: s,
        winterRaw: i,
        neutralRaw: u
      };
    }),
    [V]
  ), ee = P(
    () => L("memo:smoothed_temp", () => {
      if (e.length === 0) return [];
      const s = 96, i = [];
      let u = 0, c = 0;
      for (let l = 0; l < e.length; l++) {
        if (e[l].temperature != null && (u += e[l].temperature, c++), l >= s) {
          const x = e[l - s].temperature;
          x != null && (u -= x, c--);
        }
        i.push(c > 0 ? u / c : null);
      }
      return i;
    }),
    [e]
  ), ve = P(
    () => L("memo:timeseries_downsample", () => {
      if (e.length === 0) return [];
      const s = new Date(e[0].timestamp).getTime(), u = (new Date(e[e.length - 1].timestamp).getTime() - s) / (1e3 * 60 * 60 * 24);
      if (u <= 90)
        return e.map((d, z) => [
          new Date(d.timestamp).getTime(),
          d.kwh_delivered,
          ee[z],
          d.kwh_received,
          d.net_consumption
        ]);
      const l = (u > 365 ? 3 : 1) * 60 * 60 * 1e3, x = [];
      let h = [], g = [], w = [], S = [], T = Math.floor(s / l) * l;
      if (e.forEach((d, z) => {
        const _ = new Date(d.timestamp).getTime(), A = ee[z];
        if (_ < T + l)
          d.kwh_delivered != null && h.push(d.kwh_delivered), A != null && g.push(A), d.kwh_received != null && w.push(d.kwh_received), d.net_consumption != null && S.push(d.net_consumption);
        else {
          if (h.length > 0 || g.length > 0) {
            const p = h.length > 0 ? h.reduce((R, E) => R + E, 0) / h.length : null, j = g.length > 0 ? g.reduce((R, E) => R + E, 0) / g.length : null, je = w.length > 0 ? w.reduce((R, E) => R + E, 0) / w.length : null, ze = S.length > 0 ? S.reduce((R, E) => R + E, 0) / S.length : null;
            x.push([T, p, j, je, ze]);
          }
          T = Math.floor(_ / l) * l, h = d.kwh_delivered != null ? [d.kwh_delivered] : [], g = A != null ? [A] : [], w = d.kwh_received != null ? [d.kwh_received] : [], S = d.net_consumption != null ? [d.net_consumption] : [];
        }
      }), h.length > 0 || g.length > 0) {
        const d = h.length > 0 ? h.reduce((p, j) => p + j, 0) / h.length : null, z = g.length > 0 ? g.reduce((p, j) => p + j, 0) / g.length : null, _ = w.length > 0 ? w.reduce((p, j) => p + j, 0) / w.length : null, A = S.length > 0 ? S.reduce((p, j) => p + j, 0) / S.length : null;
        x.push([T, d, z, _, A]);
      }
      return x;
    }),
    [e]
  ), Ce = P(
    () => L("memo:hourly_aggregation", () => {
      const s = Array.from({ length: 24 }, () => ({ total: 0, count: 0 }));
      return W.forEach((i) => {
        if (i.kwh_delivered != null) {
          const c = new Date(i.timestamp).getUTCHours();
          c >= 0 && c < 24 && (s[c].total += i.kwh_delivered, s[c].count += 1);
        }
      }), s.map((i, u) => ({
        hour: `${u.toString().padStart(2, "0")}:00`,
        avg: i.count > 0 ? i.total / i.count : 0
      }));
    }),
    [W]
  ), Te = P(() => {
    if (e.length === 0) return [];
    const s = [];
    let i = -1;
    return e.forEach((u) => {
      const c = new Date(u.timestamp), l = c.getUTCMonth(), x = c.getTime();
      i !== -1 && l !== i && s.push({
        xAxis: x,
        label: {
          show: !0,
          position: "end",
          formatter: q[l].label,
          color: "#A6A7AB",
          fontSize: 10,
          backgroundColor: "rgba(26, 27, 30, 0.7)",
          padding: [2, 4],
          borderRadius: 2
        },
        lineStyle: { type: "solid", color: "rgba(255, 255, 255, 0.2)", width: 1 }
      }), i = l;
    }), s;
  }, [e]), _e = /* @__PURE__ */ t.jsxs(M, { gap: "xl", wrap: "wrap", children: [
    /* @__PURE__ */ t.jsxs(M, { gap: "xs", wrap: "wrap", children: [
      /* @__PURE__ */ t.jsx(b, { size: "xs", c: "dimmed", children: "Month Range:" }),
      /* @__PURE__ */ t.jsx(
        H,
        {
          id: "select-month-start",
          data: q,
          value: O,
          onChange: (s) => s && Q(s),
          size: "xs",
          w: 80,
          comboboxProps: { withinPortal: !0, zIndex: 1e5 }
        }
      ),
      /* @__PURE__ */ t.jsx(b, { size: "xs", c: "dimmed", children: "to" }),
      /* @__PURE__ */ t.jsx(
        H,
        {
          id: "select-month-end",
          data: q,
          value: U,
          onChange: (s) => s && Z(s),
          size: "xs",
          w: 80,
          comboboxProps: { withinPortal: !0, zIndex: 1e5 }
        }
      )
    ] }),
    /* @__PURE__ */ t.jsxs(M, { gap: "xs", wrap: "wrap", children: [
      /* @__PURE__ */ t.jsx(b, { size: "xs", c: "dimmed", children: "Time Range (Slicer):" }),
      /* @__PURE__ */ t.jsx(
        H,
        {
          id: "select-hour-start",
          data: ie,
          value: B,
          onChange: (s) => s && ye(s),
          size: "xs",
          w: 90,
          comboboxProps: { withinPortal: !0, zIndex: 1e5 }
        }
      ),
      /* @__PURE__ */ t.jsx(b, { size: "xs", c: "dimmed", children: "to" }),
      /* @__PURE__ */ t.jsx(
        H,
        {
          id: "select-hour-end",
          data: ie,
          value: $,
          onChange: (s) => s && xe(s),
          size: "xs",
          w: 90,
          comboboxProps: { withinPortal: !0, zIndex: 1e5 }
        }
      )
    ] }),
    /* @__PURE__ */ t.jsx(b, { size: "xs", c: "dimmed", style: { fontStyle: "italic" }, children: "*Month slicer affects Daily Profile; Hour slicer affects Correlation" })
  ] });
  return /* @__PURE__ */ t.jsx(
    Ne,
    {
      isOpen: n,
      onClose: r,
      onMinimize: y,
      isMinimized: C,
      title: `Grid Analytics: ${f}`,
      storageKey: "consumptionWindowPos",
      zIndex: ge ?? 1e3,
      onFocus: pe,
      filterContent: _e,
      onExport: Se,
      onCopy: Ae,
      loading: a,
      layoutMode: fe,
      children: me ? /* @__PURE__ */ t.jsx(v, { style: { display: "flex", alignItems: "center", justifyContent: "center", height: "100%", padding: "20px" }, children: /* @__PURE__ */ t.jsx(D, { align: "center", gap: "xl", style: { maxWidth: 500 }, children: /* @__PURE__ */ t.jsxs(v, { style: { position: "relative", width: "100%" }, children: [
        /* @__PURE__ */ t.jsx(
          v,
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
        /* @__PURE__ */ t.jsxs(D, { p: "xl", align: "center", gap: "md", style: { position: "relative" }, children: [
          /* @__PURE__ */ t.jsxs(M, { gap: "xs", children: [
            /* @__PURE__ */ t.jsx(Re, { size: 18, color: "#fab005" }),
            /* @__PURE__ */ t.jsx(b, { size: "sm", ff: "monospace", fw: 700, c: "blue.4", style: { letterSpacing: "1px" }, children: "DATASET_CAPACITY_WARNING" })
          ] }),
          /* @__PURE__ */ t.jsxs(D, { gap: 4, align: "center", children: [
            /* @__PURE__ */ t.jsx(b, { size: "xs", ff: "monospace", c: "dimmed", children: "ANALYSIS SCOPE" }),
            /* @__PURE__ */ t.jsxs(b, { size: "xl", ff: "monospace", fw: 700, c: "white", children: [
              (m / 1e6).toFixed(1),
              "M READINGS"
            ] })
          ] }),
          /* @__PURE__ */ t.jsx(He, { withBorder: !0, p: "xs", bg: "rgba(51, 154, 240, 0.05)", style: { borderStyle: "dashed", borderColor: "rgba(51, 154, 240, 0.3)" }, children: /* @__PURE__ */ t.jsxs(M, { gap: "sm", children: [
            /* @__PURE__ */ t.jsx(Ee, { size: 14, color: "#339af0" }),
            /* @__PURE__ */ t.jsxs(b, { size: "xs", ff: "monospace", c: "blue.4", children: [
              "EST. COMPUTE TIME: ",
              Math.ceil(m / 1e7 * 5),
              "s"
            ] })
          ] }) }),
          /* @__PURE__ */ t.jsx(v, { mt: "xs", children: /* @__PURE__ */ t.jsxs(b, { size: "xs", c: "dimmed", ff: "monospace", ta: "center", style: { maxWidth: 350, lineHeight: 1.4 }, children: [
            "SYSTEM IMPACT: MODERATE",
            /* @__PURE__ */ t.jsx("br", {}),
            "LARGE QUERIES MAY TEMPORARILY AFFECT CONCURRENT ANALYTICS PERFORMANCE."
          ] }) }),
          /* @__PURE__ */ t.jsxs(M, { mt: "lg", gap: "md", children: [
            /* @__PURE__ */ t.jsx(ne, { variant: "subtle", size: "xs", color: "gray", onClick: r, ff: "monospace", children: "[ ABORT_ADJUST ]" }),
            /* @__PURE__ */ t.jsx(
              ne,
              {
                color: "blue",
                size: "sm",
                onClick: he,
                leftSection: /* @__PURE__ */ t.jsx(Pe, { size: 16 }),
                ff: "monospace",
                variant: "light",
                style: { border: "1px solid rgba(51, 154, 240, 0.4)" },
                children: "EXECUTE_QUERY_PLAN"
              }
            )
          ] })
        ] })
      ] }) }) }) : a ? /* @__PURE__ */ t.jsx(Ue, { estimatedRows: m }) : e.length === 0 ? /* @__PURE__ */ t.jsx(v, { style: { display: "flex", alignItems: "center", justifyContent: "center", height: "100%" }, children: /* @__PURE__ */ t.jsx(b, { c: "dimmed", children: "No readings found for this node in the selected date range." }) }) : /* @__PURE__ */ t.jsx(v, { style: { height: "100%", overflowY: "auto", paddingRight: "10px" }, children: /* @__PURE__ */ t.jsxs(D, { gap: "xl", children: [
        /* @__PURE__ */ t.jsx(
          X,
          {
            title: "Consumption Time-Series (Full Period)",
            storageKey: `consumption-ts-${Y}`,
            defaultHeight: 280,
            children: /* @__PURE__ */ t.jsx(
              J,
              {
                style: { height: "100%", width: "100%" },
                option: Ke(ve, Te),
                onChartReady: (s) => {
                  s.group = "consumption-sync", Oe("consumption-sync"), !G.current && I.current !== null && (G.current = !0, Be("chart:first_ready", performance.now() - I.current), setTimeout(() => $e("consumption"), 0));
                }
              }
            )
          }
        ),
        /* @__PURE__ */ t.jsxs(se, { cols: { base: 1, md: 2 }, spacing: "lg", mb: "xl", children: [
          /* @__PURE__ */ t.jsx(
            X,
            {
              title: "Typical Daily Load Profile (Hourly Avg)",
              storageKey: `consumption-daily-${Y}`,
              defaultHeight: 380,
              children: /* @__PURE__ */ t.jsx(
                J,
                {
                  style: { height: "100%", width: "100%" },
                  option: Ye(Ce)
                }
              )
            }
          ),
          /* @__PURE__ */ t.jsx(
            X,
            {
              title: "Load vs Temperature Correlation (Filtered)",
              storageKey: `consumption-corr-${Y}`,
              defaultHeight: 420,
              minHeight: 320,
              children: /* @__PURE__ */ t.jsxs(v, { style: { height: "100%", display: "flex", flexDirection: "column" }, children: [
                /* @__PURE__ */ t.jsxs(se, { cols: 2, mb: "xs", px: "xs", children: [
                  /* @__PURE__ */ t.jsxs(v, { px: "md", children: [
                    /* @__PURE__ */ t.jsxs(b, { size: "xs", fw: 500, c: "blue", mb: 6, children: [
                      "Winter Target: ",
                      F,
                      "°C"
                    ] }),
                    /* @__PURE__ */ t.jsx(
                      re,
                      {
                        value: F,
                        onChange: be,
                        min: -15,
                        max: 40,
                        step: 0.5,
                        marks: [
                          { value: -10, label: "-10" },
                          { value: 0, label: "0" },
                          { value: 10, label: "10" },
                          { value: 20, label: "20" },
                          { value: 30, label: "30" },
                          { value: 40, label: "40" }
                        ],
                        color: "blue",
                        styles: { markLabel: { fontSize: 9, color: "#A6A7AB", marginTop: 5 } }
                      }
                    )
                  ] }),
                  /* @__PURE__ */ t.jsxs(v, { px: "md", children: [
                    /* @__PURE__ */ t.jsxs(b, { size: "xs", fw: 500, c: "red", mb: 6, children: [
                      "Summer Target: ",
                      K,
                      "°C"
                    ] }),
                    /* @__PURE__ */ t.jsx(
                      re,
                      {
                        value: K,
                        onChange: we,
                        min: -15,
                        max: 40,
                        step: 0.5,
                        marks: [
                          { value: -10, label: "-10" },
                          { value: 0, label: "0" },
                          { value: 10, label: "10" },
                          { value: 20, label: "20" },
                          { value: 30, label: "30" },
                          { value: 40, label: "40" }
                        ],
                        color: "red",
                        styles: { markLabel: { fontSize: 9, color: "#A6A7AB", marginTop: 5 } }
                      }
                    )
                  ] })
                ] }),
                /* @__PURE__ */ t.jsx(v, { style: { flex: 1, minHeight: 0 }, children: /* @__PURE__ */ t.jsx(
                  J,
                  {
                    style: { height: "100%", width: "100%" },
                    option: Ge(
                      N.summerRaw,
                      N.winterRaw,
                      N.neutralRaw,
                      N.summer,
                      N.winter,
                      K,
                      F
                    )
                  }
                ) })
              ] })
            }
          )
        ] })
      ] }) })
    }
  );
}), Je = 2e6;
async function qe(o, n, r, a, e) {
  e.updateWindowProps(o, { loading: !0, isPaused: !1 });
  try {
    const m = await ue(n, r, a);
    e.updateAnalysisData(o, m.time_series ?? []), m.downstream_node_ids?.length && (e.addHighlightedNodes(m.downstream_node_ids), e.selectAndNavigateToNode([...n, ...m.downstream_node_ids])), m.downstream_edge_ids?.length && e.addHighlightedEdges(m.downstream_edge_ids);
  } catch (m) {
    console.error("[consumption] fetch failed", m), e.setAnalysisLoading(o, !1);
  }
}
const st = {
  type: "consumption",
  category: "node",
  label: "Consumption History",
  description: "Analyze aggregate smart meter consumption data for downstream grid assets.",
  permissions: ["cim:read", "topology:read", "analytics:consumption"],
  icon: ke,
  color: "blue",
  appliesToNodes: (o, n = 0) => o.length > 0 || n > 0,
  async handleRun(o) {
    let n = o.selectedNodes.map((f) => f.id);
    if (n.length === 0 && o.selectedEdgeIds.length > 0 && (n = o.resolveEdgeNodesToNodeIds(o.selectedEdgeIds)), n.length === 0) return;
    const r = n.length === 1 ? o.selectedNodes[0]?.name ?? "Selected Asset" : `${n.length} Assets`, a = o.openAnalysisWindow("consumption", r), { start: e, end: m } = o.dateRange;
    if (o.updateWindowProps(a, { nodeIds: n, start: e, end: m }), !e || !m) {
      console.error("[consumption] Cannot run analysis: simulation time range is missing.");
      return;
    }
    try {
      const f = await Fe(n, e, m);
      f.downstream_node_ids?.length && o.addHighlightedNodes(f.downstream_node_ids), f.downstream_edge_ids?.length && o.addHighlightedEdges(f.downstream_edge_ids);
      const C = Number(o.systemConfig.analytics_threshold || Je);
      f.estimated_rows > C ? o.updateWindowProps(a, {
        loading: !1,
        isPaused: !0,
        estimatedRows: f.estimated_rows,
        pendingRequest: { nodeIds: n, start: e, end: m }
      }) : await qe(a, n, e, m, o);
    } catch (f) {
      console.error("[consumption] estimate failed", f), o.setAnalysisLoading(a, !1);
    }
  },
  renderWindow(o, n) {
    const r = o.pendingRequest ?? { nodeIds: o.nodeIds, start: "", end: "" }, a = () => {
      n.updateWindow && (n.updateWindow({ loading: !0, isPaused: !1 }), ue(r.nodeIds, r.start, r.end, !0).then((e) => {
        n.updateWindow({ data: e.time_series ?? [], loading: !1 }), e.downstream_node_ids?.length && n.selectAndNavigateToNode && n.selectAndNavigateToNode([...r.nodeIds, ...e.downstream_node_ids]);
      }).catch(() => n.updateWindow({ loading: !1 })));
    };
    return Ie(Xe, {
      isOpen: o.isOpen,
      onClose: n.onClose,
      onMinimize: n.onMinimize,
      loading: o.loading,
      data: o.data,
      estimatedRows: o.estimatedRows,
      nodeName: o.nodeName,
      isMinimized: o.isMinimized,
      isPaused: o.isPaused,
      zIndex: o.zIndex ?? 1e3,
      layoutMode: "floating",
      onConfirm: a,
      onFocus: n.onFocus
    });
  }
};
export {
  st as consumptionPlugin,
  st as default
};
