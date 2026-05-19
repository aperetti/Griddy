let t = null;
const i = [];
function s() {
  if (t !== null) return t;
  if (typeof window > "u")
    return t = !1, !1;
  try {
    if (new URLSearchParams(window.location.search).get("perf") === "1")
      return t = !0, !0;
    t = window.localStorage?.getItem("perf") === "1";
  } catch {
    t = !1;
  }
  return t;
}
function a() {
  return typeof performance < "u" ? performance.now() : Date.now();
}
function c(n, e, r = "fe") {
  if (s()) {
    i.push({ label: n, durationMs: e, source: r });
    try {
      typeof performance < "u" && r === "fe" && performance.measure(n, { start: a() - e, duration: e });
    } catch {
    }
  }
}
async function y(n, e) {
  if (!s()) return e();
  const r = a();
  try {
    return await e();
  } finally {
    c(n, a() - r);
  }
}
function b(n, e) {
  if (!s()) return e();
  const r = a();
  try {
    return e();
  } finally {
    c(n, a() - r);
  }
}
function g(n, e) {
  c(n, e);
}
function w(n) {
  if (!(!s() || !n))
    for (const e of n.split(",")) {
      const r = e.trim();
      if (!r) continue;
      const o = r.split(";").map((f) => f.trim()), u = o[0];
      let l = 0;
      for (const f of o.slice(1)) {
        const [d, p] = f.split("=");
        if (d === "dur" && p) {
          const m = parseFloat(p);
          Number.isNaN(m) || (l = m);
        }
      }
      u && c(`be:${u}`, l, "be");
    }
}
function _(n) {
  if (!s()) return [];
  const e = i.slice();
  if (i.length = 0, e.length === 0) return e;
  const r = n ? `[perf:${n}]` : "[perf]";
  try {
    console.groupCollapsed(`${r} ${e.length} spans`), console.table(e.map((o) => ({ phase: o.label, ms: o.durationMs.toFixed(2), src: o.source }))), console.groupEnd();
  } catch {
  }
  return e;
}
function h() {
  return s();
}
function S() {
  return i.slice();
}
const $ = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  _internal_buffer: S,
  _internal_isEnabled: h,
  dump: _,
  mark: g,
  measureAsync: y,
  measureSync: b,
  recordServerTiming: w
}, Symbol.toStringTag, { value: "Module" }));
export {
  b as a,
  g as b,
  _ as d,
  y as m,
  $ as p,
  w as r
};
