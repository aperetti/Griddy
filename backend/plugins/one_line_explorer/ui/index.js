import { Minus as ye, GitBranch as _e, Zap as be, X as je, AlertTriangle as we, Network as Se } from "lucide-react";
import { useState as W, useEffect as oe, useRef as H, useLayoutEffect as ve, useCallback as O, createElement as ke } from "react";
import { j as n, A as Ce } from "../../AnalysisWindow-DCpKwrtw.js";
import { ActionIcon as $e, ScrollArea as Le, Loader as pe, Text as Y, Badge as D, Stack as ee, Box as te, Alert as Te, Group as Re } from "@mantine/core";
import { createPortal as Me } from "react-dom";
const ze = "/api/plugins/one-line-explorer";
async function Ee(e, t = 2) {
  const i = new URLSearchParams({ depth: String(t) }), s = await fetch(`${ze}/diagram/${encodeURIComponent(e)}?${i}`);
  if (!s.ok) {
    const c = await s.text();
    throw new Error(`[one_line_explorer] ${s.status} ${c}`);
  }
  return s.json();
}
async function Pe(e) {
  const t = await fetch(`/api/cim/node/${encodeURIComponent(e)}`);
  if (!t.ok)
    throw new Error(`[one_line_explorer] Failed to fetch node attributes: ${t.status}`);
  return t.json();
}
async function Ie(e) {
  const t = await fetch(`/api/cim/equipment/${encodeURIComponent(e)}`);
  if (!t.ok) {
    const i = await fetch(`/api/cim/properties/${encodeURIComponent(e)}`);
    if (i.ok) return i.json();
    throw new Error(`[one_line_explorer] Failed to fetch equipment attributes: ${t.status}`);
  }
  return t.json();
}
const F = 220, N = 18, ne = 80, Be = 110, K = 52, ge = /* @__PURE__ */ new Set([
  "Breaker",
  "LoadBreakSwitch",
  "Fuse",
  "Disconnector",
  "Recloser"
]), Ae = /* @__PURE__ */ new Set([
  "PowerTransformer",
  "Regulator",
  "TransformerTank"
]);
function De(e) {
  return e.edge_type === "LoadBreakSwitch" ? e.is_open ? "#51cf66" : "#fa5252" : ge.has(e.edge_type) ? e.is_open ? "#fa5252" : "#51cf66" : Ae.has(e.edge_type) ? "#fd7e14" : e.edge_type === "ACLineSegment" ? "#868e96" : "#4dabf7";
}
function We(e) {
  return e.is_centre ? "#ffd43b" : e.node_role === "upstream" ? "#15aabf" : e.node_type === "Substation" ? "#f59f00" : "#4c6ef5";
}
const Ne = {
  PowerTransformer: "Transformer",
  Regulator: "Regulator",
  TransformerTank: "Transformer",
  Breaker: "Breaker",
  CircuitBreaker: "Breaker",
  Recloser: "Recloser",
  Fuse: "Fuse",
  Disconnector: "Disconnector",
  LoadBreakSwitch: "Load Break Switch",
  ACLineSegment: "Line Segment"
};
function me(e) {
  return Ne[e.edge_type] ?? e.edge_type;
}
function xe(e) {
  const t = [];
  return e.transformer_kva != null && t.push(`${e.transformer_kva} kVA`), e.customer_count != null && e.customer_count > 0 && t.push(`${e.customer_count} cust`), e.length_m != null && t.push(`${Math.round(e.length_m)} m`), e.is_open && t.push("OPEN"), t.join(" · ");
}
function Ve(e) {
  const t = xe(e), i = me(e);
  return t ? `${i} ${t}` : i;
}
const de = /* @__PURE__ */ new Set(["PowerTransformer", "TransformerTank"]);
function Oe(e) {
  const { nodes: t, edges: i, centre_id: s, source_path: c } = e;
  if (t.length <= 3) return e;
  const l = new Set(t.map((d) => d.id)), f = new Map(t.map((d) => [d.id, /* @__PURE__ */ new Set()]));
  for (const d of i)
    !l.has(d.from_node_id) || !l.has(d.to_node_id) || (f.get(d.from_node_id).add(d.to_node_id), f.get(d.to_node_id).add(d.from_node_id));
  const g = new Map(t.map((d) => [d.id, d])), _ = /* @__PURE__ */ new Map();
  for (const d of i)
    _.set(`${d.from_node_id}|${d.to_node_id}`, d), _.set(`${d.to_node_id}|${d.from_node_id}`, d);
  const b = (d) => {
    const y = [];
    for (const r of f.get(d) ?? []) {
      const u = _.get(`${d}|${r}`);
      !u || !de.has(u.edge_type) || (f.get(r)?.size ?? 0) === 1 && y.push({ edge: u, leafId: r });
    }
    return y;
  }, B = /* @__PURE__ */ new Set(["EnergySource", "Capacitor"]), j = (d) => {
    const y = g.get(d);
    if (!y || y.is_centre || y.node_type === "Substation" || y.attached_equipment.some((u) => B.has(u.type))) return !1;
    let r = 0;
    for (const u of f.get(d) ?? []) {
      const h = _.get(`${d}|${u}`);
      if (h?.edge_type === "ACLineSegment") {
        r++;
        continue;
      }
      if (!h || ge.has(h.edge_type) || h.edge_type === "Regulator") return !1;
      if (!(de.has(h.edge_type) && (f.get(u)?.size ?? 0) === 1))
        return !1;
    }
    return r === 2;
  }, $ = (d) => {
    const y = g.get(d);
    return y ? y.attached_equipment.reduce((r, u) => r + (u.customer_count ?? 0), 0) : 0;
  }, S = /* @__PURE__ */ new Set(), M = /* @__PURE__ */ new Set(), z = [], E = /* @__PURE__ */ new Set();
  for (const d of t)
    if (!j(d.id))
      for (const y of f.get(d.id) ?? []) {
        if (!j(y) || E.has(y)) continue;
        const r = _.get(`${d.id}|${y}`);
        if (!r || r.edge_type !== "ACLineSegment") continue;
        const u = [], h = [r], T = [];
        let L = !0, o = d.id, a = y, m = 0;
        for (; j(a); ) {
          T.push(...b(a)), m += $(a);
          const x = [...f.get(a) ?? []].filter((R) => _.get(`${a}|${R}`)?.edge_type === "ACLineSegment").find((R) => R !== o);
          if (!x) {
            L = !1;
            break;
          }
          const I = _.get(`${a}|${x}`);
          if (!I) break;
          u.push(a), E.add(a), h.push(I), o = a, a = x;
        }
        if (!L || u.length === 0) continue;
        const v = a;
        if (_.has(`${d.id}|${v}`)) continue;
        for (const w of u) S.add(w);
        for (const w of h) M.add(w.id);
        for (const { edge: w, leafId: x } of T)
          M.add(w.id), S.add(x);
        const C = h.reduce((w, x) => w + (x.length_m ?? 0), 0), k = T.reduce((w, { edge: x }) => w + (x.transformer_kva ?? 0), 0);
        z.push({
          id: `virt_${d.id}_${v}`,
          from_node_id: d.id,
          to_node_id: v,
          edge_type: "ACLineSegment",
          name: h[0]?.name ?? "",
          phases: h[0]?.phases ?? ["A", "B", "C"],
          is_open: h.some((w) => w.is_open),
          transformer_kva: k > 0 ? Math.round(k) : null,
          length_m: C > 0 ? Math.round(C) : null,
          customer_count: m > 0 ? m : null
        });
      }
  if (S.size === 0) return e;
  const P = c.filter((d) => !S.has(d));
  return {
    ...e,
    source_path: P.length > 0 ? P : [s],
    nodes: t.filter((d) => !S.has(d.id)),
    edges: [
      ...i.filter((d) => !M.has(d.id)),
      ...z
    ]
  };
}
function Fe(e) {
  const t = Oe(e), { nodes: i, edges: s, centre_id: c, source_path: l } = t;
  if (i.length === 0)
    return { nodes: [], edges: [], totalWidth: 0, totalHeight: 0 };
  const f = l && l.length > 1 ? l[0] : c, g = new Map(i.map((r) => [r.id, []]));
  for (const r of s)
    g.get(r.from_node_id)?.push(r.to_node_id), g.get(r.to_node_id)?.push(r.from_node_id);
  const _ = /* @__PURE__ */ new Map([[f, null]]), b = new Map(i.map((r) => [r.id, []])), B = /* @__PURE__ */ new Map([[f, 0]]), j = [f];
  for (let r = 0; r < j.length; r++) {
    const u = j[r];
    for (const h of g.get(u) ?? [])
      _.has(h) || (_.set(h, u), B.set(h, B.get(u) + 1), b.get(u).push(h), j.push(h));
  }
  const $ = /* @__PURE__ */ new Map();
  for (let r = j.length - 1; r >= 0; r--) {
    const u = j[r], h = b.get(u);
    if (h.length === 0)
      $.set(u, F);
    else {
      const T = h.reduce((L, o) => L + $.get(o), 0) + ne * (h.length - 1);
      $.set(u, Math.max(T, F));
    }
  }
  const S = /* @__PURE__ */ new Map();
  S.set(f, K + $.get(f) / 2);
  for (const r of j) {
    const u = b.get(r);
    if (u.length === 0) continue;
    const h = S.get(r), T = u.reduce((o, a) => o + $.get(a), 0) + ne * (u.length - 1);
    let L = h - T / 2;
    for (const o of u) {
      const a = $.get(o);
      S.set(o, L + a / 2), L += a + ne;
    }
  }
  const M = /* @__PURE__ */ new Map();
  for (const r of i)
    M.set(r.id, K + (B.get(r.id) ?? 0) * (N + Be));
  const z = Math.max(...i.map((r) => S.get(r.id) + F / 2)) + K, E = Math.max(...i.map((r) => M.get(r.id) + N)) + K + 40, P = i.map((r) => ({
    id: r.id,
    data: r,
    cx: S.get(r.id),
    y: M.get(r.id),
    width: F,
    height: N,
    fill: We(r)
  })), d = [], y = /* @__PURE__ */ new Set();
  for (const r of s) {
    if (y.has(r.id)) continue;
    y.add(r.id);
    const u = S.get(r.from_node_id) ?? 0, h = M.get(r.from_node_id) ?? 0, T = S.get(r.to_node_id) ?? 0, L = M.get(r.to_node_id) ?? 0;
    let o, a, m, v, C;
    if (Math.abs(h - L) < 1) {
      const x = h + N + 36;
      o = [
        `M ${u} ${h + N}`,
        `V ${x}`,
        `H ${T}`,
        `V ${L + N}`
      ].join(" "), v = (u + T) / 2, C = x, a = v + 24, m = x;
    } else {
      let x = u, I = h, R = T, X = L;
      h > L && ([x, I, R, X] = [T, L, u, h]);
      const U = I + N, A = X;
      o = [
        `M ${x} ${U}`,
        `H ${R}`,
        `V ${A}`
      ].join(" "), v = R, C = (U + A) / 2, a = R + 24, m = C;
    }
    const k = i.find((x) => x.id === r.from_node_id), w = i.find((x) => x.id === r.to_node_id);
    d.push({
      id: r.id,
      data: r,
      path: o,
      labelX: a,
      labelY: m,
      symbolX: v,
      symbolY: C,
      typeLabel: me(r),
      detailLabel: xe(r),
      label: Ve(r),
      color: De(r),
      dashed: r.is_open,
      fromKv: k?.base_voltage_kv ?? null,
      toKv: w?.base_voltage_kv ?? null
    });
  }
  return { nodes: P, edges: d, totalWidth: z, totalHeight: E };
}
function Ye(e, t = 2) {
  const [i, s] = W(null), [c, l] = W(!1), [f, g] = W(null);
  return oe(() => {
    if (!e) {
      s(null);
      return;
    }
    let _ = !1;
    return l(!0), g(null), Ee(e, t).then((b) => {
      _ || s(Fe(b));
    }).catch((b) => {
      _ || g(b.message ?? "Failed to load diagram");
    }).finally(() => {
      _ || l(!1);
    }), () => {
      _ = !0;
    };
  }, [e, t]), { layout: i, loading: c, error: f };
}
const V = "#0a0a0a";
function Xe({ x: e, y: t, color: i, fromKv: s, toKv: c }) {
  const f = s != null && c != null ? Math.max(s, c) : s ?? c, g = s != null && c != null ? Math.min(s, c) : null;
  return /* @__PURE__ */ n.jsxs("g", { children: [
    /* @__PURE__ */ n.jsx("rect", { x: e - 10 - 2, y: t - 20 - 2, width: 24, height: 44, fill: V }),
    /* @__PURE__ */ n.jsx("circle", { cx: e, cy: t - 10, r: 10, fill: "none", stroke: i, strokeWidth: 1.8 }),
    /* @__PURE__ */ n.jsx("circle", { cx: e, cy: t + 10, r: 10, fill: "none", stroke: i, strokeWidth: 1.8 }),
    f != null && /* @__PURE__ */ n.jsxs(
      "text",
      {
        x: e + 10 + 14,
        y: t - 10,
        fontSize: 7,
        fill: "#91a7ff",
        dominantBaseline: "middle",
        fontWeight: 600,
        children: [
          f,
          " kV"
        ]
      }
    ),
    g != null && g !== f && /* @__PURE__ */ n.jsxs(
      "text",
      {
        x: e + 10 + 14,
        y: t + 10,
        fontSize: 7,
        fill: "#91a7ff",
        dominantBaseline: "middle",
        fontWeight: 600,
        children: [
          g,
          " kV"
        ]
      }
    )
  ] });
}
function Ue({ x: e, y: t, color: i }) {
  return /* @__PURE__ */ n.jsxs("g", { children: [
    /* @__PURE__ */ n.jsx("rect", { x: e - 7 - 1, y: t - 7 - 1, width: 16, height: 16, fill: V }),
    /* @__PURE__ */ n.jsx("rect", { x: e - 7, y: t - 7, width: 14, height: 14, fill: i })
  ] });
}
function He({ x: e, y: t, color: i }) {
  return /* @__PURE__ */ n.jsxs("g", { children: [
    /* @__PURE__ */ n.jsx("rect", { x: e - 7 - 1, y: t - 7 - 1, width: 16, height: 16, fill: V }),
    /* @__PURE__ */ n.jsx("rect", { x: e - 7, y: t - 7, width: 14, height: 14, fill: i }),
    /* @__PURE__ */ n.jsx(
      "path",
      {
        d: `M ${e - 4} ${t + 3} A 4 4 0 0 0 ${e + 4} ${t + 3}`,
        fill: "none",
        stroke: V,
        strokeWidth: 1.2
      }
    )
  ] });
}
function Ke({ x: e, y: t, color: i }) {
  return /* @__PURE__ */ n.jsxs("g", { children: [
    /* @__PURE__ */ n.jsx("rect", { x: e - 8 - 1, y: t - 16 - 1, width: 18, height: 34, fill: V }),
    /* @__PURE__ */ n.jsx("rect", { x: e - 8, y: t - 16, width: 16, height: 32, fill: V, stroke: i, strokeWidth: 1.5 }),
    /* @__PURE__ */ n.jsx(
      "path",
      {
        d: `M ${e} ${t - 6} Q ${e + 5} ${t - 2} ${e} ${t + 2} Q ${e - 5} ${t + 6} ${e} ${t + 6}`,
        fill: "none",
        stroke: i,
        strokeWidth: 1.2
      }
    )
  ] });
}
function qe({ x: e, y: t, isOpen: i, color: s }) {
  return /* @__PURE__ */ n.jsxs("g", { children: [
    /* @__PURE__ */ n.jsx("rect", { x: e - 14, y: t - 16, width: 28, height: 32, fill: V }),
    /* @__PURE__ */ n.jsx("circle", { cx: e, cy: t - 12, r: 2.5, fill: s }),
    /* @__PURE__ */ n.jsx("circle", { cx: e, cy: t + 12, r: 2.5, fill: s }),
    i ? /* @__PURE__ */ n.jsx(
      "line",
      {
        x1: e,
        y1: t - 10,
        x2: e + 12,
        y2: t - 10 + 12 * 0.6,
        stroke: s,
        strokeWidth: 2
      }
    ) : /* @__PURE__ */ n.jsx(
      "line",
      {
        x1: e,
        y1: t - 10,
        x2: e,
        y2: t + 10,
        stroke: s,
        strokeWidth: 2
      }
    )
  ] });
}
function Ge({ x: e, y: t, isOpen: i, color: s }) {
  return /* @__PURE__ */ n.jsxs("g", { children: [
    /* @__PURE__ */ n.jsx("rect", { x: e - 10, y: t - 16, width: 20, height: 32, fill: V }),
    /* @__PURE__ */ n.jsx("circle", { cx: e, cy: t - 12, r: 2.5, fill: s }),
    /* @__PURE__ */ n.jsx("circle", { cx: e, cy: t + 12, r: 2.5, fill: s }),
    /* @__PURE__ */ n.jsx("rect", { x: e - 7, y: t - 8, width: 14, height: 16, fill: V, stroke: s, strokeWidth: 1.2 }),
    i ? /* @__PURE__ */ n.jsx("line", { x1: e - 4, y1: t + 5, x2: e + 4, y2: t - 5, stroke: s, strokeWidth: 1.5 }) : /* @__PURE__ */ n.jsx("line", { x1: e, y1: t - 5, x2: e, y2: t + 5, stroke: s, strokeWidth: 1.5 })
  ] });
}
function Qe({ x: e, y: t, color: i }) {
  return /* @__PURE__ */ n.jsx("line", { x1: e - 6, y1: t - 4, x2: e + 6, y2: t + 4, stroke: i, strokeWidth: 1.5 });
}
const Ze = /* @__PURE__ */ new Set(["PowerTransformer", "Regulator", "TransformerTank"]);
function Je({ edge: e }) {
  const { symbolX: t, symbolY: i, color: s, data: c } = e, l = c.edge_type;
  return Ze.has(l) ? /* @__PURE__ */ n.jsx(Xe, { x: t, y: i, color: s, fromKv: e.fromKv, toKv: e.toKv }) : l === "Recloser" ? /* @__PURE__ */ n.jsx(He, { x: t, y: i, color: s }) : l === "Breaker" || l === "CircuitBreaker" ? /* @__PURE__ */ n.jsx(Ue, { x: t, y: i, color: s }) : l === "Fuse" ? /* @__PURE__ */ n.jsx(Ke, { x: t, y: i, color: s }) : l === "Disconnector" ? /* @__PURE__ */ n.jsx(qe, { x: t, y: i, isOpen: c.is_open, color: s }) : l === "LoadBreakSwitch" ? /* @__PURE__ */ n.jsx(Ge, { x: t, y: i, isOpen: c.is_open, color: s }) : l === "ACLineSegment" ? /* @__PURE__ */ n.jsx(Qe, { x: t, y: i, color: s }) : null;
}
const ue = {
  mrid: "MRID",
  node_id: "Node ID",
  cim_class: "CIM Class",
  base_voltage_kv: "Base Voltage",
  rated_s_kva: "Rated S",
  rated_u_kv: "Rated U",
  r_ohm_per_km: "R (Ω/km)",
  x_ohm_per_km: "X (Ω/km)",
  b_us_per_km: "B (µS/km)",
  length_m: "Length",
  is_open: "State",
  is_fuse: "Fuse",
  is_recloser: "Recloser",
  is_disconnector: "Disconnector",
  customer_count: "Customers",
  aliasName: "Alias",
  description: "Description",
  latitude: "Latitude",
  longitude: "Longitude",
  active_power_w: "Active Power",
  reactive_power_var: "Reactive Power",
  p_mw: "Active Power",
  q_mvar: "Reactive Power",
  voltage_pu: "Voltage (p.u.)",
  angle_deg: "Voltage Angle",
  step: "Current Step",
  neutralStep: "Neutral Step",
  lowStep: "Lower Limit",
  highStep: "Upper Limit",
  neutralU: "Neutral Voltage",
  stepVoltageIncrement: "Step Increment",
  targetValue: "Set Point",
  targetDeadband: "Bandwidth",
  lineDropR: "LDC R-Setting",
  lineDropX: "LDC X-Setting",
  lineDropCompensation: "LDC Enabled",
  timeDelay: "Time Delay",
  discrete: "Discrete Control",
  mode: "Control Mode",
  monitoredPhase: "Monitored Phase"
};
function re(e) {
  return ue[e] ? ue[e] : e.replace(/_/g, " ").replace(/\b\w/g, (t) => t.toUpperCase());
}
function et(e, t) {
  return e === "base_voltage_kv" || e === "rated_u_kv" ? `${t} kV` : e === "rated_s_kva" ? `${t.toLocaleString()} kVA` : e === "length_m" ? `${t.toLocaleString()} m` : e === "active_power_w" || e === "p_mw" ? `${t} W` : e === "reactive_power_var" || e === "q_mvar" ? `${t} VAr` : e === "step" || e === "neutralStep" || e === "lowStep" || e === "highStep" ? t.toString() : e === "stepVoltageIncrement" ? `${t}%` : e === "neutralU" || e === "targetValue" ? `${t} V` : e === "targetDeadband" ? `${t} V` : e === "lineDropR" || e === "lineDropX" ? `${t} Ω` : e === "timeDelay" ? `${t} s` : Number.isInteger(t) ? t.toLocaleString() : parseFloat(t.toPrecision(6)).toString();
}
function ie(e, t) {
  return t == null ? "—" : typeof t == "boolean" ? t ? "Yes" : "No" : typeof t == "number" ? et(e, t) : Array.isArray(t) ? t.length === 0 ? "—" : t.every((i) => typeof i == "string" || typeof i == "number") ? t.join(", ") : JSON.stringify(t) : String(t);
}
const p = {
  card: {
    width: 380,
    background: "rgba(22, 23, 26, 0.98)",
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: 8,
    boxShadow: "0 8px 32px rgba(0,0,0,0.7)",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    fontFamily: "inherit"
  },
  header: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "8px 10px 8px 12px",
    borderBottom: "1px solid rgba(255,255,255,0.09)",
    background: "rgba(255,255,255,0.03)",
    flexShrink: 0
  },
  headerIcon: {
    flexShrink: 0,
    opacity: 0.6
  },
  headerTitle: {
    flex: 1,
    minWidth: 0,
    overflow: "hidden",
    whiteSpace: "nowrap",
    textOverflow: "ellipsis",
    fontSize: 13,
    fontWeight: 600,
    color: "#c1c2c5"
  },
  headerSub: {
    fontSize: 10,
    color: "#868e96",
    marginTop: 1
  },
  body: {
    padding: "6px 0"
  },
  section: {
    padding: "4px 12px 8px"
  },
  sectionLabel: {
    fontSize: 10,
    fontWeight: 700,
    color: "#5c5f66",
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    marginBottom: 4,
    marginTop: 4
  },
  divider: {
    borderTop: "1px solid rgba(255,255,255,0.06)",
    margin: "4px 0"
  },
  row: {
    display: "grid",
    gridTemplateColumns: "110px 1fr",
    columnGap: 8,
    padding: "3px 12px",
    alignItems: "baseline"
  },
  rowKey: {
    fontSize: 11,
    color: "#5c5f66",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis"
  },
  rowVal: {
    fontSize: 12,
    color: "#c1c2c5",
    wordBreak: "break-word"
  },
  eqCard: {
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.07)",
    borderRadius: 5,
    padding: "5px 8px",
    marginBottom: 4,
    display: "flex",
    alignItems: "center",
    gap: 6
  },
  eqName: {
    fontSize: 12,
    color: "#c1c2c5",
    flex: 1,
    minWidth: 0,
    overflow: "hidden",
    whiteSpace: "nowrap",
    textOverflow: "ellipsis"
  },
  terminalRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: 4,
    marginTop: 2
  }
}, tt = /* @__PURE__ */ new Set([
  "name",
  "model_id",
  "terminals",
  "connected_equipment",
  "RatioTapChanger",
  "PhaseTapChanger",
  "TapChangerControl",
  "RegulatingControl",
  "display_class",
  "hierarchy",
  "transformerends"
]);
function nt({ container: e }) {
  return /* @__PURE__ */ n.jsxs("div", { style: p.row, children: [
    /* @__PURE__ */ n.jsx("span", { style: p.rowKey, children: "Container" }),
    /* @__PURE__ */ n.jsxs("span", { style: { ...p.rowVal, display: "flex", alignItems: "center", gap: 4 }, children: [
      /* @__PURE__ */ n.jsx("span", { children: e.name || "—" }),
      /* @__PURE__ */ n.jsx(D, { size: "xs", variant: "outline", color: "gray", style: { flexShrink: 0 }, children: e.class })
    ] })
  ] });
}
function ot({ terminals: e }) {
  return !e || e.length === 0 ? null : /* @__PURE__ */ n.jsxs(n.Fragment, { children: [
    /* @__PURE__ */ n.jsx("div", { style: p.divider }),
    /* @__PURE__ */ n.jsxs("div", { style: p.section, children: [
      /* @__PURE__ */ n.jsx("div", { style: p.sectionLabel, children: "Terminals" }),
      e.map((t, i) => /* @__PURE__ */ n.jsxs("div", { style: { marginBottom: 4 }, children: [
        /* @__PURE__ */ n.jsxs("div", { style: { fontSize: 10, color: "#5c5f66", marginBottom: 2 }, children: [
          "T",
          i + 1,
          " — ",
          /* @__PURE__ */ n.jsx("span", { style: { color: "#868e96", fontFamily: "monospace", fontSize: 10 }, children: typeof t.connectivity_node == "string" ? t.connectivity_node.slice(0, 20) + (t.connectivity_node.length > 20 ? "…" : "") : "?" })
        ] }),
        /* @__PURE__ */ n.jsxs("div", { style: p.terminalRow, children: [
          (t.phases ?? []).map((s) => /* @__PURE__ */ n.jsx(D, { size: "xs", variant: "light", color: "blue", children: s }, s)),
          (!t.phases || t.phases.length === 0) && /* @__PURE__ */ n.jsx("span", { style: { fontSize: 10, color: "#5c5f66" }, children: "no phases" })
        ] })
      ] }, i))
    ] })
  ] });
}
function rt({ data: e }) {
  const t = e.TapChangerControl || {}, s = { ...e.RegulatingControl || {}, ...t }, c = Object.entries(s).filter(([l]) => !["mrid", "name", "cim_class", "class", "uri", "uuid"].includes(l));
  return c.length === 0 ? null : /* @__PURE__ */ n.jsxs("div", { style: { padding: "8px 12px", borderTop: "1px solid rgba(255,255,255,0.08)", background: "rgba(0,0,0,0.15)" }, children: [
    /* @__PURE__ */ n.jsx("div", { style: { fontSize: 10, color: "#5c5f66", textTransform: "uppercase", marginBottom: 6, fontWeight: 600, letterSpacing: "0.02em" }, children: "Regulator Control Settings" }),
    c.map(([l, f]) => /* @__PURE__ */ n.jsxs("div", { style: { display: "flex", justifyContent: "space-between", marginBottom: 2 }, children: [
      /* @__PURE__ */ n.jsx("span", { style: { fontSize: 11, color: "#888" }, children: re(l) }),
      /* @__PURE__ */ n.jsx("span", { style: { fontSize: 11, color: "#ccc", fontFamily: "monospace" }, children: ie(l, f) })
    ] }, l))
  ] });
}
function it({ equipment: e }) {
  return !e || e.length === 0 ? null : /* @__PURE__ */ n.jsxs(n.Fragment, { children: [
    /* @__PURE__ */ n.jsx("div", { style: p.divider }),
    /* @__PURE__ */ n.jsxs("div", { style: p.section, children: [
      /* @__PURE__ */ n.jsxs("div", { style: p.sectionLabel, children: [
        "Connected Equipment (",
        e.length,
        ")"
      ] }),
      e.map((t) => /* @__PURE__ */ n.jsxs("div", { style: p.eqCard, children: [
        /* @__PURE__ */ n.jsx(D, { size: "xs", variant: "light", color: "indigo", style: { flexShrink: 0 }, children: t.cim_class }),
        /* @__PURE__ */ n.jsx("span", { style: p.eqName, children: t.name || t.mrid?.slice(0, 16) + "…" }),
        t.base_voltage_kv != null && /* @__PURE__ */ n.jsxs("span", { style: { fontSize: 10, color: "#868e96", flexShrink: 0 }, children: [
          t.base_voltage_kv,
          " kV"
        ] }),
        t.rated_s_kva != null && /* @__PURE__ */ n.jsxs("span", { style: { fontSize: 10, color: "#868e96", flexShrink: 0 }, children: [
          t.rated_s_kva,
          " kVA"
        ] }),
        t.length_m != null && /* @__PURE__ */ n.jsxs("span", { style: { fontSize: 10, color: "#868e96", flexShrink: 0 }, children: [
          t.length_m,
          " m"
        ] })
      ] }, t.mrid))
    ] })
  ] });
}
function he({ data: e, label: t }) {
  if (!e) return null;
  const i = Object.entries(e).filter(([s]) => s !== "mrid" && s !== "name");
  return /* @__PURE__ */ n.jsxs(n.Fragment, { children: [
    /* @__PURE__ */ n.jsx("div", { style: p.divider }),
    /* @__PURE__ */ n.jsxs("div", { style: p.section, children: [
      /* @__PURE__ */ n.jsx("div", { style: p.sectionLabel, children: t }),
      /* @__PURE__ */ n.jsx("div", { style: {
        background: "rgba(255,255,255,0.03)",
        borderRadius: 4,
        padding: "4px 0",
        border: "1px solid rgba(255,255,255,0.05)"
      }, children: i.map(([s, c]) => /* @__PURE__ */ n.jsxs("div", { style: p.row, children: [
        /* @__PURE__ */ n.jsx("span", { style: p.rowKey, children: re(s) }),
        /* @__PURE__ */ n.jsx("span", { style: p.rowVal, children: ie(s, c) })
      ] }, s)) })
    ] })
  ] });
}
function st({ edge: e }) {
  const t = e.data, i = [];
  return t.length_m != null && i.push(["Total Length", `${t.length_m.toLocaleString()} m`]), t.transformer_kva != null && i.push(["Combined kVA", `${t.transformer_kva.toLocaleString()} kVA`]), t.customer_count != null && i.push(["Customers", t.customer_count.toLocaleString()]), t.phases?.length && i.push(["Phases", t.phases.join(", ")]), i.push(["State", t.is_open ? "OPEN" : "Closed"]), /* @__PURE__ */ n.jsxs("div", { style: p.body, children: [
    /* @__PURE__ */ n.jsx("div", { style: { padding: "6px 12px 4px", ...p.sectionLabel }, children: "Collapsed Segment Summary" }),
    i.map(([s, c]) => /* @__PURE__ */ n.jsxs("div", { style: p.row, children: [
      /* @__PURE__ */ n.jsx("span", { style: p.rowKey, children: s }),
      /* @__PURE__ */ n.jsx("span", { style: {
        ...p.rowVal,
        color: s === "State" && t.is_open ? "#ff6b6b" : p.rowVal.color
      }, children: c })
    ] }, s)),
    /* @__PURE__ */ n.jsx("div", { style: { padding: "6px 12px 4px" }, children: /* @__PURE__ */ n.jsx(Y, { size: "xs", c: "dimmed", style: { fontStyle: "italic" }, children: "This segment represents multiple collapsed buses. Individual CIM attributes are not available for virtual segments." }) })
  ] });
}
function lt({ id: e, type: t, anchorEl: i, onClose: s, virtualEdge: c }) {
  const [l, f] = W(null), [g, _] = W(!1), [b, B] = W(null);
  if (oe(() => {
    if (!e || !t || c) {
      f(null);
      return;
    }
    let r = !1;
    return _(!0), B(null), (async () => {
      try {
        const h = t === "node" ? await Pe(e) : await Ie(e);
        r || f(h);
      } catch (h) {
        r || B(h.message || "Failed to fetch attributes");
      } finally {
        r || _(!1);
      }
    })(), () => {
      r = !0;
    };
  }, [e, t, c]), !i || !e) return null;
  const j = i.getBoundingClientRect(), $ = 380, S = j.left, M = Math.min(S, window.innerWidth - $ - 12), z = j.bottom + 6, E = c ? c.data.name || "Collapsed Segment" : l?.name || (t === "node" ? "Bus" : "Equipment"), P = c ? "Virtual · ACLineSegment" : l?.display_class ?? (l?.RatioTapChanger || l?.TapChangerControl ? "Regulator" : l?.cim_class ?? (t === "node" ? "ConnectivityNode" : null)), d = l ? Object.entries(l).filter(([r, u]) => !(tt.has(r) || r === "container" || typeof u == "object" && u !== null)) : [], y = /* @__PURE__ */ n.jsxs(
    "div",
    {
      style: { position: "fixed", top: z, left: M, zIndex: 1e4, ...p.card },
      onMouseDown: (r) => r.stopPropagation(),
      onPointerDown: (r) => r.stopPropagation(),
      onPointerUp: (r) => r.stopPropagation(),
      onClick: (r) => r.stopPropagation(),
      children: [
        /* @__PURE__ */ n.jsxs("div", { style: p.header, children: [
          /* @__PURE__ */ n.jsx("span", { style: p.headerIcon, children: c ? /* @__PURE__ */ n.jsx(ye, { size: 14, color: "#868e96" }) : t === "node" ? /* @__PURE__ */ n.jsx(_e, { size: 14, color: "#4dabf7" }) : /* @__PURE__ */ n.jsx(be, { size: 14, color: "#ffd43b" }) }),
          /* @__PURE__ */ n.jsxs("div", { style: { flex: 1, minWidth: 0 }, children: [
            /* @__PURE__ */ n.jsx("div", { style: p.headerTitle, children: E }),
            P && /* @__PURE__ */ n.jsx("div", { style: p.headerSub, children: P })
          ] }),
          /* @__PURE__ */ n.jsx($e, { size: "sm", variant: "subtle", color: "gray", onClick: s, children: /* @__PURE__ */ n.jsx(je, { size: 14 }) })
        ] }),
        /* @__PURE__ */ n.jsx(Le.Autosize, { mah: 420, type: "auto", children: c ? /* @__PURE__ */ n.jsx(st, { edge: c }) : /* @__PURE__ */ n.jsxs("div", { style: p.body, children: [
          g && /* @__PURE__ */ n.jsx("div", { style: { display: "flex", justifyContent: "center", padding: 24 }, children: /* @__PURE__ */ n.jsx(pe, { size: "sm", color: "blue" }) }),
          b && /* @__PURE__ */ n.jsx("div", { style: { padding: "8px 12px" }, children: /* @__PURE__ */ n.jsx(Y, { size: "xs", c: "red", children: b }) }),
          !g && !b && l && /* @__PURE__ */ n.jsxs(n.Fragment, { children: [
            d.map(([r, u]) => /* @__PURE__ */ n.jsxs("div", { style: p.row, children: [
              /* @__PURE__ */ n.jsx("span", { style: p.rowKey, children: re(r) }),
              /* @__PURE__ */ n.jsx("span", { style: {
                ...p.rowVal,
                ...typeof u == "boolean" ? { color: u ? "#51cf66" : "#ff6b6b" } : {}
              }, children: ie(r, u) })
            ] }, r)),
            l.container && /* @__PURE__ */ n.jsx(nt, { container: l.container }),
            l.terminals && /* @__PURE__ */ n.jsx(ot, { terminals: l.terminals }),
            /* @__PURE__ */ n.jsx(rt, { data: l }),
            l.RatioTapChanger && /* @__PURE__ */ n.jsx(he, { data: l.RatioTapChanger, label: "Ratio Tap Changer" }),
            l.PhaseTapChanger && /* @__PURE__ */ n.jsx(he, { data: l.PhaseTapChanger, label: "Phase Tap Changer" }),
            l.connected_equipment && /* @__PURE__ */ n.jsx(it, { equipment: l.connected_equipment })
          ] }),
          !g && !b && !l && /* @__PURE__ */ n.jsx("div", { style: { padding: "8px 12px" }, children: /* @__PURE__ */ n.jsx(Y, { size: "xs", c: "dimmed", children: "No data available." }) })
        ] }) })
      ]
    }
  );
  return Me(y, document.body);
}
const at = "#0a0a0a", ct = 2, q = 0.08, G = 6;
function fe(e, t, i, s) {
  const c = Math.min(e / i, t / s) * 0.9, l = Math.max(q, Math.min(G, c)), f = Math.max(0, (e - i * l) / 2), g = Math.max(0, (t - s * l) / 2);
  return { scale: l, tx: f, ty: g };
}
function dt({ layout: e }) {
  const { nodes: t, edges: i, totalWidth: s, totalHeight: c } = e, l = H(null), [f, g] = W(0), [_, b] = W(0), [B, j] = W(1), [$, S] = W(null);
  ve(() => {
    if (s === 0 || c === 0) return;
    const o = l.current;
    if (!o) return;
    const { offsetWidth: a, offsetHeight: m } = o;
    if (a === 0 || m === 0) return;
    const v = fe(a, m, s, c);
    g(v.tx), b(v.ty), j(v.scale);
  }, [s, c]);
  const M = O(() => {
    const o = l.current;
    if (!o) return;
    const a = fe(o.offsetWidth, o.offsetHeight, s, c);
    g(a.tx), b(a.ty), j(a.scale);
  }, [s, c]);
  oe(() => {
    const o = l.current;
    if (!o) return;
    const a = (m) => {
      m.preventDefault();
      const v = m.deltaY < 0 ? 1.12 : 1 / 1.12, C = o.getBoundingClientRect(), k = m.clientX - C.left, w = m.clientY - C.top;
      j((x) => {
        const I = Math.max(q, Math.min(G, x * v));
        return g((R) => k - (k - R) * (I / x)), b((R) => w - (w - R) * (I / x)), I;
      });
    };
    return o.addEventListener("wheel", a, { passive: !1 }), () => o.removeEventListener("wheel", a);
  }, []);
  const z = H(/* @__PURE__ */ new Map()), E = H(!1), P = H(null), d = O((o) => {
    o.currentTarget.setPointerCapture(o.pointerId), o.stopPropagation(), E.current = !1, P.current = o.target, z.current.set(o.pointerId, { x: o.clientX, y: o.clientY });
  }, []), y = O((o) => {
    const a = z.current.get(o.pointerId);
    if (!a) return;
    o.stopPropagation();
    const m = { x: o.clientX, y: o.clientY };
    !E.current && Math.hypot(m.x - a.x, m.y - a.y) > 4 && (E.current = !0);
    const v = Array.from(z.current.keys());
    if (v.length === 1)
      g((C) => C + m.x - a.x), b((C) => C + m.y - a.y);
    else if (v.length >= 2) {
      const C = v.find((A) => A !== o.pointerId), k = z.current.get(C), w = Math.hypot(a.x - k.x, a.y - k.y), x = Math.hypot(m.x - k.x, m.y - k.y);
      if (w > 1) {
        const A = x / w, se = l.current;
        if (se) {
          const le = se.getBoundingClientRect(), ae = (m.x + k.x) / 2 - le.left, ce = (m.y + k.y) / 2 - le.top;
          j((Q) => {
            const Z = Math.max(q, Math.min(G, Q * A));
            return g((J) => ae - (ae - J) * (Z / Q)), b((J) => ce - (ce - J) * (Z / Q)), Z;
          });
        }
      }
      const I = (a.x + k.x) / 2, R = (a.y + k.y) / 2, X = (m.x + k.x) / 2, U = (m.y + k.y) / 2;
      g((A) => A + X - I), b((A) => A + U - R);
    }
    z.current.set(o.pointerId, m);
  }, []), r = O((o) => {
    z.current.delete(o.pointerId);
    try {
      o.target.releasePointerCapture(o.pointerId);
    } catch {
    }
    if (!E.current && P.current) {
      const a = P.current.closest?.("[data-clickable]");
      a && a.dispatchEvent(new MouseEvent("click", { bubbles: !0, clientX: o.clientX, clientY: o.clientY }));
    }
    P.current = null;
  }, []), u = O(() => j((o) => Math.min(G, o * 1.3)), []), h = O(() => j((o) => Math.max(q, o / 1.3)), []), T = O((o, a) => {
    E.current || (o.stopPropagation(), S({ id: a, type: "node", anchorEl: o.currentTarget }));
  }, []), L = O((o, a) => {
    E.current || (o.stopPropagation(), S({
      id: a.id,
      type: "equipment",
      anchorEl: o.currentTarget,
      virtualEdge: a.id.startsWith("virt_") ? a : void 0
    }));
  }, []);
  return /* @__PURE__ */ n.jsxs(
    "div",
    {
      ref: l,
      style: {
        width: "100%",
        height: "100%",
        overflow: "hidden",
        background: at,
        cursor: "grab",
        position: "relative",
        touchAction: "none",
        userSelect: "none"
      },
      onPointerDown: d,
      onPointerMove: y,
      onPointerUp: r,
      onPointerCancel: r,
      children: [
        /* @__PURE__ */ n.jsx("svg", { width: "100%", height: "100%", style: { display: "block" }, children: /* @__PURE__ */ n.jsxs("g", { transform: `translate(${f},${_}) scale(${B})`, children: [
          i.map((o) => /* @__PURE__ */ n.jsx(
            "path",
            {
              d: o.path,
              fill: "none",
              stroke: o.color,
              strokeWidth: ct,
              strokeDasharray: o.dashed ? "6 4" : void 0
            },
            `wire-${o.id}`
          )),
          i.map((o) => /* @__PURE__ */ n.jsx(
            "g",
            {
              onClick: (a) => L(a, o),
              style: { cursor: "pointer" },
              "data-clickable": "true",
              children: /* @__PURE__ */ n.jsx(Je, { edge: o })
            },
            `sym-grp-${o.id}`
          )),
          i.map((o) => /* @__PURE__ */ n.jsxs("g", { children: [
            /* @__PURE__ */ n.jsx(
              "text",
              {
                x: o.labelX,
                y: o.labelY,
                fontSize: 10,
                fontWeight: 600,
                fill: "#c1c2c5",
                dominantBaseline: "middle",
                children: o.typeLabel
              }
            ),
            o.detailLabel && /* @__PURE__ */ n.jsx(
              "text",
              {
                x: o.labelX,
                y: o.labelY + 12,
                fontSize: 8,
                fill: "#868e96",
                dominantBaseline: "middle",
                children: o.detailLabel
              }
            )
          ] }, `lbl-${o.id}`)),
          t.map((o) => /* @__PURE__ */ n.jsxs(
            "g",
            {
              onClick: (a) => T(a, o.id),
              style: { cursor: "pointer" },
              "data-clickable": "true",
              children: [
                /* @__PURE__ */ n.jsx(
                  "rect",
                  {
                    x: o.cx - F / 2,
                    y: o.y,
                    width: o.width,
                    height: o.height,
                    fill: o.fill,
                    rx: 1
                  }
                ),
                /* @__PURE__ */ n.jsx(
                  "text",
                  {
                    x: o.cx + 30,
                    y: o.y - 6,
                    textAnchor: "start",
                    fontSize: 10,
                    fontWeight: o.data.is_centre ? 700 : 400,
                    fill: o.data.is_centre ? "#ffd43b" : "#c1c2c5",
                    children: o.data.name
                  }
                ),
                o.data.base_voltage_kv != null && /* @__PURE__ */ n.jsxs(
                  "text",
                  {
                    x: o.cx + 30,
                    y: o.y + N + 12,
                    textAnchor: "start",
                    fontSize: 9,
                    fill: "#868e96",
                    children: [
                      o.data.base_voltage_kv,
                      " kV"
                    ]
                  }
                ),
                o.data.attached_equipment.length > 0 && /* @__PURE__ */ n.jsxs(
                  "text",
                  {
                    x: o.cx + F / 2 + 4,
                    y: o.y + N / 2,
                    fontSize: 8,
                    fill: "#94d82d",
                    dominantBaseline: "middle",
                    children: [
                      o.data.attached_equipment.length,
                      " eq"
                    ]
                  }
                )
              ]
            },
            o.id
          ))
        ] }) }),
        /* @__PURE__ */ n.jsx("div", { style: {
          position: "absolute",
          bottom: 12,
          right: 12,
          display: "flex",
          flexDirection: "column",
          gap: 4,
          zIndex: 10
        }, children: [
          { label: "+", title: "Zoom in", onClick: u },
          { label: "−", title: "Zoom out", onClick: h },
          { label: "⊡", title: "Fit to view", onClick: M }
        ].map(({ label: o, title: a, onClick: m }) => /* @__PURE__ */ n.jsx(
          "button",
          {
            title: a,
            onClick: m,
            style: {
              width: 36,
              height: 36,
              background: "rgba(30,30,30,0.85)",
              border: "1px solid rgba(255,255,255,0.15)",
              color: "#c1c2c5",
              borderRadius: 6,
              cursor: "pointer",
              fontSize: 18,
              lineHeight: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              userSelect: "none"
            },
            children: o
          },
          o
        )) }),
        /* @__PURE__ */ n.jsx(
          lt,
          {
            id: $?.id ?? null,
            type: $?.type ?? null,
            anchorEl: $?.anchorEl ?? null,
            virtualEdge: $?.virtualEdge,
            onClose: () => S(null)
          }
        )
      ]
    }
  );
}
const ut = ({
  instance: e,
  onClose: t,
  onMinimize: i,
  onFocus: s
}) => {
  const c = e.nodeIds?.[0] ?? null, { layout: l, loading: f, error: g } = Ye(c);
  return /* @__PURE__ */ n.jsx(
    Ce,
    {
      isOpen: !0,
      title: e.nodeName || "One-Line Diagram",
      storageKey: `one-line-explorer-${e.id}`,
      onClose: () => t(e.id),
      onMinimize: () => i(e.id),
      onFocus: () => s(e.id),
      zIndex: e.zIndex,
      contentStyle: { overflow: "hidden", padding: 0 },
      children: /* @__PURE__ */ n.jsxs(ee, { style: { height: "100%", flex: 1, minHeight: 0 }, gap: 0, children: [
        /* @__PURE__ */ n.jsxs(te, { style: { flex: 1, position: "relative", minHeight: 0 }, children: [
          f && /* @__PURE__ */ n.jsxs(ee, { align: "center", justify: "center", h: "100%", gap: "xs", style: { opacity: 0.6 }, children: [
            /* @__PURE__ */ n.jsx(pe, { size: "sm", color: "blue" }),
            /* @__PURE__ */ n.jsx(Y, { size: "xs", c: "dimmed", children: "Building one-line diagram…" })
          ] }),
          g && !f && /* @__PURE__ */ n.jsx(te, { p: "md", children: /* @__PURE__ */ n.jsx(Te, { icon: /* @__PURE__ */ n.jsx(we, { size: 14 }), color: "red", variant: "light", children: /* @__PURE__ */ n.jsx(Y, { size: "xs", children: g }) }) }),
          !f && !g && l && l.nodes.length > 0 && /* @__PURE__ */ n.jsx(dt, { layout: l }),
          !f && !g && (!l || l.nodes.length === 0) && c && /* @__PURE__ */ n.jsx(ee, { align: "center", justify: "center", h: "100%", gap: "xs", style: { opacity: 0.5 }, children: /* @__PURE__ */ n.jsx(Y, { size: "xs", c: "dimmed", children: "No connectivity data found for this node." }) })
        ] }),
        /* @__PURE__ */ n.jsx(
          te,
          {
            px: "xs",
            py: 4,
            style: { borderTop: "1px solid rgba(255,255,255,0.06)", background: "rgba(0,0,0,0.2)" },
            children: /* @__PURE__ */ n.jsxs(Re, { gap: 6, wrap: "wrap", children: [
              /* @__PURE__ */ n.jsx(D, { color: "yellow", size: "xs", variant: "dot", children: "Selected bus" }),
              /* @__PURE__ */ n.jsx(D, { color: "cyan", size: "xs", variant: "dot", children: "Upstream path" }),
              /* @__PURE__ */ n.jsx(D, { color: "orange", size: "xs", variant: "dot", children: "Substation bus" }),
              /* @__PURE__ */ n.jsx(D, { color: "blue", size: "xs", variant: "dot", children: "Bus" }),
              /* @__PURE__ */ n.jsx(D, { color: "orange", size: "xs", variant: "outline", children: "Transformer ○○" }),
              /* @__PURE__ */ n.jsx(D, { color: "green", size: "xs", variant: "outline", children: "Breaker ■" }),
              /* @__PURE__ */ n.jsx(D, { color: "red", size: "xs", variant: "outline", children: "Open switch" })
            ] })
          }
        )
      ] })
    }
  );
}, xt = {
  type: "one_line_explorer",
  category: "node",
  label: "One-Line Diagram",
  description: "Render a one-line connectivity diagram for the selected node or edge endpoint (2-depth neighbourhood, ConnectivityNodes as bus bars).",
  icon: Se,
  color: "teal",
  // Show when exactly 1 node is selected, or when exactly 1 edge is selected (no nodes)
  appliesToNodes: (e, t = 0) => e.length === 1 || e.length === 0 && t === 1,
  handleRun(e) {
    let t = null, i = "Unknown";
    if (e.selectedNodes.length === 1) {
      const c = e.selectedNodes[0];
      t = c.id, i = c.name || c.id;
    } else e.selectedEdgeIds.length > 0 && (t = e.resolveEdgeNodesToNodeIds([e.selectedEdgeIds[0]])[0] ?? null, i = `Edge ${e.selectedEdgeIds[0].length > 12 ? `${e.selectedEdgeIds[0].slice(0, 8)}…` : e.selectedEdgeIds[0]}`);
    const s = e.openAnalysisWindow(
      "one_line_explorer",
      `One-Line: ${i}`
    );
    e.updateWindowProps(s, {
      nodeIds: t ? [t] : [],
      loading: !1
    });
  },
  renderWindow(e, t) {
    return ke(ut, {
      instance: e,
      onClose: t.onClose,
      onMinimize: t.onMinimize,
      onFocus: t.onFocus
    });
  }
};
export {
  xt as default,
  xt as oneLineExplorerPlugin
};
