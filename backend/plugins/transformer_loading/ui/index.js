import { Search as X, Zap as P, ArrowUp as Y, ArrowDown as Z, ArrowUpDown as q } from "lucide-react";
import { memo as A, useMemo as R, useState as J, useCallback as Q, useEffect as ee, createElement as re } from "react";
import { j as e, A as ne } from "../../AnalysisWindow-DCpKwrtw.js";
import { Table as o, Stack as S, Text as h, Badge as v, Group as z, TextInput as oe, Center as se, Box as ie, Select as te, Pagination as ae, UnstyledButton as le } from "@mantine/core";
import { S as de } from "../../ScadaLoadingAnimation-CR8nixEL.js";
import { useDebouncedValue as ce } from "@mantine/hooks";
const me = "/api/plugins/transformer-loading";
async function D(n, r = 100, a = 0, l = "", t = "name", i = "asc") {
  const m = n.length === 0 ? "all" : n.join(","), d = new URLSearchParams({
    limit: r.toString(),
    offset: a.toString(),
    search: l,
    sort_field: t,
    sort_direction: i
  }), u = await fetch(`${me}/${m}?${d.toString()}`);
  if (!u.ok) throw new Error(`Transformer loading fetch failed: ${u.status}`);
  return u.json();
}
function C(n) {
  if (n == null) return "—";
  const r = n / 1e3;
  return r >= 1e3 ? `${(r / 1e3).toFixed(2)} MVA` : `${r.toFixed(1)} kVA`;
}
function he(n) {
  return n == null ? "—" : `${(n / 1e3).toFixed(2)} kV`;
}
function E(n) {
  return n == null ? "—" : `${n} Ω`;
}
function M(n) {
  return n == null ? "gray" : n > 100 ? "red" : n > 80 ? "orange" : "green";
}
function L({ label: n, sortField: r, activeField: a, direction: l, onSort: t }) {
  const i = a === r;
  return /* @__PURE__ */ e.jsx(o.Th, { children: /* @__PURE__ */ e.jsx(le, { onClick: () => t(r), style: { width: "100%" }, children: /* @__PURE__ */ e.jsxs(z, { justify: "space-between", wrap: "nowrap", gap: "xs", children: [
    /* @__PURE__ */ e.jsx(h, { size: "xs", fw: 700, children: n }),
    i ? l === "asc" ? /* @__PURE__ */ e.jsx(Y, { size: 12 }) : /* @__PURE__ */ e.jsx(Z, { size: 12 }) : /* @__PURE__ */ e.jsx(q, { size: 12, style: { opacity: 0.3 } })
  ] }) }) });
}
const fe = A(function({ transformer: r, end: a, isFirst: l, rowCount: t, onSelect: i }) {
  return /* @__PURE__ */ e.jsxs(
    o.Tr,
    {
      onClick: () => i?.(r.mrid),
      style: {
        cursor: i ? "pointer" : "default",
        contentVisibility: "auto",
        containIntrinsicSize: "1px 50px"
      },
      children: [
        l && /* @__PURE__ */ e.jsx(o.Td, { rowSpan: t, children: /* @__PURE__ */ e.jsxs(S, { gap: 2, children: [
          /* @__PURE__ */ e.jsx(h, { size: "sm", fw: 500, children: r.name || "Unknown" }),
          /* @__PURE__ */ e.jsx(h, { size: "xs", c: "dimmed", style: { fontFamily: "monospace" }, children: r.mrid.split("_").pop() })
        ] }) }),
        l && /* @__PURE__ */ e.jsx(o.Td, { rowSpan: t, children: /* @__PURE__ */ e.jsxs(
          v,
          {
            color: M(r.loading_percent),
            variant: "filled",
            size: "sm",
            children: [
              r.loading_percent?.toFixed(1) ?? "—",
              "%"
            ]
          }
        ) }),
        /* @__PURE__ */ e.jsx(o.Td, { ta: "center", children: /* @__PURE__ */ e.jsx(v, { size: "xs", variant: "outline", color: "gray", children: a.end_number ?? "—" }) }),
        /* @__PURE__ */ e.jsx(o.Td, { children: /* @__PURE__ */ e.jsx(v, { color: "yellow", variant: "light", size: "sm", children: C(a.rated_s_kva) }) }),
        /* @__PURE__ */ e.jsx(o.Td, { children: he(a.rated_u_v) }),
        /* @__PURE__ */ e.jsx(o.Td, { c: "blue.3", children: E(a.resistance_ohm) }),
        /* @__PURE__ */ e.jsx(o.Td, { c: "cyan.3", children: E(a.reactance_ohm) }),
        /* @__PURE__ */ e.jsx(o.Td, { c: "dimmed", children: C(a.short_term_s_kva) }),
        /* @__PURE__ */ e.jsx(o.Td, { c: "dimmed", children: C(a.emergency_s_kva) })
      ]
    }
  );
}), xe = A(function({
  instance: r,
  onClose: a,
  onMinimize: l,
  updateWindow: t,
  setNodeAverages: i,
  selectAndNavigateToNode: m
}) {
  const d = r.data ?? [], u = r.totalCount ?? 0, f = r.limit ?? 25, O = r.offset ?? 0, F = R(() => r.nodeIds ?? [], [r.nodeIds]), T = r.loading, b = r.search ?? "", g = r.sortField ?? "name", p = r.sortDirection ?? "asc", [_, U] = J(b), [j] = ce(_, 400), B = Math.ceil(u / f), V = Math.floor(O / f) + 1, w = Q(async (s, x, y, G, N) => {
    t?.({ loading: !0 });
    try {
      const c = await D(F, s, x, y, G, N);
      t?.({
        data: c.transformers,
        totalCount: c.total_count,
        limit: c.limit,
        offset: c.offset,
        search: c.search,
        sortField: c.sort_field,
        sortDirection: c.sort_direction,
        loading: !1
      });
      const I = {};
      c.transformers.forEach((k) => {
        k.loading_percent != null && (I[k.mrid] = k.loading_percent / 100);
      }), i?.(I);
    } catch (c) {
      console.error("Refetch failed", c), t?.({ loading: !1 });
    }
  }, [F, t, i]);
  ee(() => {
    j !== b && !T && w(f, 0, j, g, p);
  }, [j, b, w, f, T]);
  const W = (s) => {
    const x = (s - 1) * f;
    w(f, x, j, g, p);
  }, H = (s) => {
    if (!s) return;
    const x = parseInt(s, 10);
    w(x, 0, j, g, p);
  }, $ = (s) => {
    w(f, 0, j, s, s === g && p === "asc" ? "desc" : "asc");
  }, K = R(() => d.flatMap(
    (s) => s.ends.length > 0 ? s.ends.map((x, y) => /* @__PURE__ */ e.jsx(
      fe,
      {
        transformer: s,
        end: x,
        isFirst: y === 0,
        rowCount: s.ends.length,
        onSelect: m
      },
      `${s.mrid}-${y}`
    )) : [
      /* @__PURE__ */ e.jsxs(
        o.Tr,
        {
          onClick: () => m?.(s.mrid),
          style: { cursor: m ? "pointer" : "default" },
          children: [
            /* @__PURE__ */ e.jsx(o.Td, { children: /* @__PURE__ */ e.jsxs(S, { gap: 2, children: [
              /* @__PURE__ */ e.jsx(h, { size: "sm", fw: 500, children: s.name || "Unknown" }),
              /* @__PURE__ */ e.jsx(h, { size: "xs", c: "dimmed", style: { fontFamily: "monospace" }, children: s.mrid.split("_").pop() })
            ] }) }),
            /* @__PURE__ */ e.jsx(o.Td, { children: /* @__PURE__ */ e.jsxs(
              v,
              {
                color: M(s.loading_percent),
                variant: "filled",
                size: "sm",
                children: [
                  s.loading_percent?.toFixed(1) ?? "—",
                  "%"
                ]
              }
            ) }),
            /* @__PURE__ */ e.jsx(o.Td, { colSpan: 7, children: /* @__PURE__ */ e.jsx(h, { size: "xs", c: "dimmed", fs: "italic", children: "No winding data available" }) })
          ]
        },
        s.mrid
      )
    ]
  ), [d, m]);
  return /* @__PURE__ */ e.jsx(
    ne,
    {
      isOpen: r.isOpen,
      onClose: a,
      onMinimize: l,
      isMinimized: r.isMinimized,
      title: `Transformer Overload — ${r.nodeName}`,
      storageKey: `plugin_transformer_loading_${r.id}`,
      zIndex: r.zIndex ?? 1e3,
      loading: T,
      layoutMode: "floating",
      initialWidth: 900,
      initialHeight: 550,
      children: /* @__PURE__ */ e.jsxs(S, { gap: "xs", style: { height: "100%", position: "relative" }, children: [
        /* @__PURE__ */ e.jsx(z, { px: "md", pt: "xs", justify: "space-between", children: /* @__PURE__ */ e.jsx(
          oe,
          {
            placeholder: "Search by name or mRID...",
            size: "xs",
            leftSection: /* @__PURE__ */ e.jsx(X, { size: 14 }),
            value: _,
            onChange: (s) => U(s.currentTarget.value),
            style: { width: 250 }
          }
        ) }),
        T && d.length === 0 ? /* @__PURE__ */ e.jsx(de, {}) : d.length === 0 ? /* @__PURE__ */ e.jsx(se, { py: "xl", children: /* @__PURE__ */ e.jsxs(S, { align: "center", gap: "xs", children: [
          /* @__PURE__ */ e.jsx(P, { size: 28, color: "var(--mantine-color-yellow-5)" }),
          /* @__PURE__ */ e.jsx(h, { c: "dimmed", size: "sm", children: _ ? `No results for "${_}"` : "No transformer data found for selection." })
        ] }) }) : /* @__PURE__ */ e.jsxs(e.Fragment, { children: [
          /* @__PURE__ */ e.jsx(ie, { style: { flex: 1, overflowY: "auto" }, children: /* @__PURE__ */ e.jsxs(o, { striped: !0, highlightOnHover: !0, withTableBorder: !0, withColumnBorders: !0, fz: "xs", stickyHeader: !0, children: [
            /* @__PURE__ */ e.jsx(o.Thead, { children: /* @__PURE__ */ e.jsxs(o.Tr, { children: [
              /* @__PURE__ */ e.jsx(
                L,
                {
                  label: "Transformer",
                  sortField: "name",
                  activeField: g,
                  direction: p,
                  onSort: $
                }
              ),
              /* @__PURE__ */ e.jsx(
                L,
                {
                  label: "Load (%)",
                  sortField: "load",
                  activeField: g,
                  direction: p,
                  onSort: $
                }
              ),
              /* @__PURE__ */ e.jsx(o.Th, { ta: "center", children: "End" }),
              /* @__PURE__ */ e.jsx(o.Th, { children: "Rated S" }),
              /* @__PURE__ */ e.jsx(o.Th, { children: "Rated U" }),
              /* @__PURE__ */ e.jsx(o.Th, { children: "R (Ω)" }),
              /* @__PURE__ */ e.jsx(o.Th, { children: "X (Ω)" }),
              /* @__PURE__ */ e.jsx(o.Th, { children: "ShortTermS" }),
              /* @__PURE__ */ e.jsx(o.Th, { children: "EmergencyS" })
            ] }) }),
            /* @__PURE__ */ e.jsx(o.Tbody, { children: K })
          ] }) }),
          /* @__PURE__ */ e.jsxs(z, { justify: "space-between", px: "md", py: 10, style: { borderTop: "1px solid var(--mantine-color-dark-4)" }, children: [
            /* @__PURE__ */ e.jsxs(z, { gap: "xs", children: [
              /* @__PURE__ */ e.jsx(h, { size: "xs", c: "dimmed", children: "Show" }),
              /* @__PURE__ */ e.jsx(
                te,
                {
                  size: "xs",
                  value: f.toString(),
                  onChange: H,
                  comboboxProps: { zIndex: (r.zIndex ?? 1e3) + 500 },
                  data: [
                    { value: "10", label: "10" },
                    { value: "25", label: "25" },
                    { value: "50", label: "50" },
                    { value: "100", label: "100" },
                    { value: "250", label: "250" }
                  ],
                  style: { width: 80 }
                }
              ),
              /* @__PURE__ */ e.jsxs(h, { size: "xs", c: "dimmed", children: [
                "per page (Total: ",
                u,
                ")"
              ] })
            ] }),
            /* @__PURE__ */ e.jsx(
              ae,
              {
                size: "sm",
                total: B,
                value: V,
                onChange: W,
                withEdges: !0
              }
            )
          ] })
        ] })
      ] })
    }
  );
}), Te = {
  type: "transformer_loading",
  category: "system",
  label: "Transformer Overload",
  description: "Monitor grid-wide transformer loading and identify overloaded assets.",
  permissions: ["cim:read", "transformer:loading"],
  icon: P,
  color: "yellow",
  appliesToNodes: () => !0,
  handleRun(n) {
    const r = n.selectedNodes.map((i) => i.id), l = r.length === 0 ? "Global Overload Report" : r.length === 1 ? n.selectedNodes[0].name ?? "Transformer" : `${r.length} Transformers`, t = n.openAnalysisWindow("transformer_loading", l);
    n.updateWindowProps(t, { nodeIds: r }), D(r, 25, 0).then((i) => {
      n.updateWindowProps(t, {
        data: i.transformers,
        totalCount: i.total_count,
        limit: i.limit,
        offset: i.offset,
        loading: !1
      });
      const m = {};
      i.transformers.forEach((d) => {
        d.loading_percent != null && (m[d.mrid] = d.loading_percent / 100);
      }), n.setNodeAverages(m);
    }).catch((i) => {
      console.error("[transformer_loading] report failed", i), n.setAnalysisLoading(t, !1);
    });
  },
  renderWindow(n, r) {
    return re(xe, { instance: n, ...r });
  }
};
export {
  Te as default,
  Te as transformerLoadingPlugin
};
