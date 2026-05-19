import ke, { memo as mt, useCallback as Ne, useMemo as Ct, PureComponent as bt, createElement as Ie, useState as de, useRef as Ye } from "react";
import { Paper as Dt, Box as pe, Group as $e, Title as Ot, Button as Mt, ActionIcon as se, Tooltip as ge, Collapse as jt } from "@mantine/core";
import { ChevronUp as At, ChevronDown as Nt, Filter as Be, Check as Wt, Copy as kt, Download as Ht, Maximize2 as Lt, PinOff as Ft, Pin as It, X as Yt } from "lucide-react";
import wt, { flushSync as St } from "react-dom";
import { useWindowEvent as $t, useDebouncedCallback as Bt } from "@mantine/hooks";
function Ut(r) {
  return r && r.__esModule && Object.prototype.hasOwnProperty.call(r, "default") ? r.default : r;
}
var ve = { exports: {} }, le = {};
var Ue;
function qt() {
  if (Ue) return le;
  Ue = 1;
  var r = /* @__PURE__ */ Symbol.for("react.transitional.element"), i = /* @__PURE__ */ Symbol.for("react.fragment");
  function t(e, o, n) {
    var s = null;
    if (n !== void 0 && (s = "" + n), o.key !== void 0 && (s = "" + o.key), "key" in o) {
      n = {};
      for (var a in o)
        a !== "key" && (n[a] = o[a]);
    } else n = o;
    return o = n.ref, {
      $$typeof: r,
      type: e,
      key: s,
      ref: o !== void 0 ? o : null,
      props: n
    };
  }
  return le.Fragment = i, le.jsx = t, le.jsxs = t, le;
}
var ue = {};
var qe;
function Xt() {
  return qe || (qe = 1, process.env.NODE_ENV !== "production" && (function() {
    function r(l) {
      if (l == null) return null;
      if (typeof l == "function")
        return l.$$typeof === N ? null : l.displayName || l.name || null;
      if (typeof l == "string") return l;
      switch (l) {
        case y:
          return "Fragment";
        case R:
          return "Profiler";
        case x:
          return "StrictMode";
        case P:
          return "Suspense";
        case u:
          return "SuspenseList";
        case j:
          return "Activity";
      }
      if (typeof l == "object")
        switch (typeof l.tag == "number" && console.error(
          "Received an unexpected object in getComponentNameFromType(). This is likely a bug in React. Please file an issue."
        ), l.$$typeof) {
          case v:
            return "Portal";
          case S:
            return l.displayName || "Context";
          case g:
            return (l._context.displayName || "Context") + ".Consumer";
          case f:
            var z = l.render;
            return l = l.displayName, l || (l = z.displayName || z.name || "", l = l !== "" ? "ForwardRef(" + l + ")" : "ForwardRef"), l;
          case h:
            return z = l.displayName || null, z !== null ? z : r(l.type) || "Memo";
          case T:
            z = l._payload, l = l._init;
            try {
              return r(l(z));
            } catch {
            }
        }
      return null;
    }
    function i(l) {
      return "" + l;
    }
    function t(l) {
      try {
        i(l);
        var z = !1;
      } catch {
        z = !0;
      }
      if (z) {
        z = console;
        var O = z.error, D = typeof Symbol == "function" && Symbol.toStringTag && l[Symbol.toStringTag] || l.constructor.name || "Object";
        return O.call(
          z,
          "The provided key is an unsupported type %s. This value must be coerced to a string before using it here.",
          D
        ), i(l);
      }
    }
    function e(l) {
      if (l === y) return "<>";
      if (typeof l == "object" && l !== null && l.$$typeof === T)
        return "<...>";
      try {
        var z = r(l);
        return z ? "<" + z + ">" : "<...>";
      } catch {
        return "<...>";
      }
    }
    function o() {
      var l = W.A;
      return l === null ? null : l.getOwner();
    }
    function n() {
      return Error("react-stack-top-frame");
    }
    function s(l) {
      if ($.call(l, "key")) {
        var z = Object.getOwnPropertyDescriptor(l, "key").get;
        if (z && z.isReactWarning) return !1;
      }
      return l.key !== void 0;
    }
    function a(l, z) {
      function O() {
        I || (I = !0, console.error(
          "%s: `key` is not a prop. Trying to access it will result in `undefined` being returned. If you need to access the same value within the child component, you should pass it as a different prop. (https://react.dev/link/special-props)",
          z
        ));
      }
      O.isReactWarning = !0, Object.defineProperty(l, "key", {
        get: O,
        configurable: !0
      });
    }
    function b() {
      var l = r(this.type);
      return A[l] || (A[l] = !0, console.error(
        "Accessing element.ref was removed in React 19. ref is now a regular prop. It will be removed from the JSX Element type in a future release."
      )), l = this.props.ref, l !== void 0 ? l : null;
    }
    function c(l, z, O, D, Y, k) {
      var M = O.ref;
      return l = {
        $$typeof: _,
        type: l,
        key: z,
        props: O,
        _owner: D
      }, (M !== void 0 ? M : null) !== null ? Object.defineProperty(l, "ref", {
        enumerable: !1,
        get: b
      }) : Object.defineProperty(l, "ref", { enumerable: !1, value: null }), l._store = {}, Object.defineProperty(l._store, "validated", {
        configurable: !1,
        enumerable: !1,
        writable: !0,
        value: 0
      }), Object.defineProperty(l, "_debugInfo", {
        configurable: !1,
        enumerable: !1,
        writable: !0,
        value: null
      }), Object.defineProperty(l, "_debugStack", {
        configurable: !1,
        enumerable: !1,
        writable: !0,
        value: Y
      }), Object.defineProperty(l, "_debugTask", {
        configurable: !1,
        enumerable: !1,
        writable: !0,
        value: k
      }), Object.freeze && (Object.freeze(l.props), Object.freeze(l)), l;
    }
    function E(l, z, O, D, Y, k) {
      var M = z.children;
      if (M !== void 0)
        if (D)
          if (G(M)) {
            for (D = 0; D < M.length; D++)
              d(M[D]);
            Object.freeze && Object.freeze(M);
          } else
            console.error(
              "React.jsx: Static children should always be an array. You are likely explicitly calling React.jsxs or React.jsxDEV. Use the Babel transform instead."
            );
        else d(M);
      if ($.call(z, "key")) {
        M = r(l);
        var L = Object.keys(z).filter(function(B) {
          return B !== "key";
        });
        D = 0 < L.length ? "{key: someKey, " + L.join(": ..., ") + ": ...}" : "{key: someKey}", p[M + D] || (L = 0 < L.length ? "{" + L.join(": ..., ") + ": ...}" : "{}", console.error(
          `A props object containing a "key" prop is being spread into JSX:
  let props = %s;
  <%s {...props} />
React keys must be passed directly to JSX without using spread:
  let props = %s;
  <%s key={someKey} {...props} />`,
          D,
          M,
          L,
          M
        ), p[M + D] = !0);
      }
      if (M = null, O !== void 0 && (t(O), M = "" + O), s(z) && (t(z.key), M = "" + z.key), "key" in z) {
        O = {};
        for (var U in z)
          U !== "key" && (O[U] = z[U]);
      } else O = z;
      return M && a(
        O,
        typeof l == "function" ? l.displayName || l.name || "Unknown" : l
      ), c(
        l,
        M,
        O,
        o(),
        Y,
        k
      );
    }
    function d(l) {
      m(l) ? l._store && (l._store.validated = 1) : typeof l == "object" && l !== null && l.$$typeof === T && (l._payload.status === "fulfilled" ? m(l._payload.value) && l._payload.value._store && (l._payload.value._store.validated = 1) : l._store && (l._store.validated = 1));
    }
    function m(l) {
      return typeof l == "object" && l !== null && l.$$typeof === _;
    }
    var w = ke, _ = /* @__PURE__ */ Symbol.for("react.transitional.element"), v = /* @__PURE__ */ Symbol.for("react.portal"), y = /* @__PURE__ */ Symbol.for("react.fragment"), x = /* @__PURE__ */ Symbol.for("react.strict_mode"), R = /* @__PURE__ */ Symbol.for("react.profiler"), g = /* @__PURE__ */ Symbol.for("react.consumer"), S = /* @__PURE__ */ Symbol.for("react.context"), f = /* @__PURE__ */ Symbol.for("react.forward_ref"), P = /* @__PURE__ */ Symbol.for("react.suspense"), u = /* @__PURE__ */ Symbol.for("react.suspense_list"), h = /* @__PURE__ */ Symbol.for("react.memo"), T = /* @__PURE__ */ Symbol.for("react.lazy"), j = /* @__PURE__ */ Symbol.for("react.activity"), N = /* @__PURE__ */ Symbol.for("react.client.reference"), W = w.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE, $ = Object.prototype.hasOwnProperty, G = Array.isArray, J = console.createTask ? console.createTask : function() {
      return null;
    };
    w = {
      react_stack_bottom_frame: function(l) {
        return l();
      }
    };
    var I, A = {}, H = w.react_stack_bottom_frame.bind(
      w,
      n
    )(), V = J(e(n)), p = {};
    ue.Fragment = y, ue.jsx = function(l, z, O) {
      var D = 1e4 > W.recentlyCreatedOwnerStacks++;
      return E(
        l,
        z,
        O,
        !1,
        D ? Error("react-stack-top-frame") : H,
        D ? J(e(l)) : V
      );
    }, ue.jsxs = function(l, z, O) {
      var D = 1e4 > W.recentlyCreatedOwnerStacks++;
      return E(
        l,
        z,
        O,
        !0,
        D ? Error("react-stack-top-frame") : H,
        D ? J(e(l)) : V
      );
    };
  })()), ue;
}
var Xe;
function Gt() {
  return Xe || (Xe = 1, process.env.NODE_ENV === "production" ? ve.exports = qt() : ve.exports = Xt()), ve.exports;
}
var F = Gt(), fe = { exports: {} }, Te = {}, ye = { exports: {} }, me = { exports: {} }, q = {};
var Ge;
function Vt() {
  if (Ge) return q;
  Ge = 1;
  var r = typeof Symbol == "function" && Symbol.for, i = r ? /* @__PURE__ */ Symbol.for("react.element") : 60103, t = r ? /* @__PURE__ */ Symbol.for("react.portal") : 60106, e = r ? /* @__PURE__ */ Symbol.for("react.fragment") : 60107, o = r ? /* @__PURE__ */ Symbol.for("react.strict_mode") : 60108, n = r ? /* @__PURE__ */ Symbol.for("react.profiler") : 60114, s = r ? /* @__PURE__ */ Symbol.for("react.provider") : 60109, a = r ? /* @__PURE__ */ Symbol.for("react.context") : 60110, b = r ? /* @__PURE__ */ Symbol.for("react.async_mode") : 60111, c = r ? /* @__PURE__ */ Symbol.for("react.concurrent_mode") : 60111, E = r ? /* @__PURE__ */ Symbol.for("react.forward_ref") : 60112, d = r ? /* @__PURE__ */ Symbol.for("react.suspense") : 60113, m = r ? /* @__PURE__ */ Symbol.for("react.suspense_list") : 60120, w = r ? /* @__PURE__ */ Symbol.for("react.memo") : 60115, _ = r ? /* @__PURE__ */ Symbol.for("react.lazy") : 60116, v = r ? /* @__PURE__ */ Symbol.for("react.block") : 60121, y = r ? /* @__PURE__ */ Symbol.for("react.fundamental") : 60117, x = r ? /* @__PURE__ */ Symbol.for("react.responder") : 60118, R = r ? /* @__PURE__ */ Symbol.for("react.scope") : 60119;
  function g(f) {
    if (typeof f == "object" && f !== null) {
      var P = f.$$typeof;
      switch (P) {
        case i:
          switch (f = f.type, f) {
            case b:
            case c:
            case e:
            case n:
            case o:
            case d:
              return f;
            default:
              switch (f = f && f.$$typeof, f) {
                case a:
                case E:
                case _:
                case w:
                case s:
                  return f;
                default:
                  return P;
              }
          }
        case t:
          return P;
      }
    }
  }
  function S(f) {
    return g(f) === c;
  }
  return q.AsyncMode = b, q.ConcurrentMode = c, q.ContextConsumer = a, q.ContextProvider = s, q.Element = i, q.ForwardRef = E, q.Fragment = e, q.Lazy = _, q.Memo = w, q.Portal = t, q.Profiler = n, q.StrictMode = o, q.Suspense = d, q.isAsyncMode = function(f) {
    return S(f) || g(f) === b;
  }, q.isConcurrentMode = S, q.isContextConsumer = function(f) {
    return g(f) === a;
  }, q.isContextProvider = function(f) {
    return g(f) === s;
  }, q.isElement = function(f) {
    return typeof f == "object" && f !== null && f.$$typeof === i;
  }, q.isForwardRef = function(f) {
    return g(f) === E;
  }, q.isFragment = function(f) {
    return g(f) === e;
  }, q.isLazy = function(f) {
    return g(f) === _;
  }, q.isMemo = function(f) {
    return g(f) === w;
  }, q.isPortal = function(f) {
    return g(f) === t;
  }, q.isProfiler = function(f) {
    return g(f) === n;
  }, q.isStrictMode = function(f) {
    return g(f) === o;
  }, q.isSuspense = function(f) {
    return g(f) === d;
  }, q.isValidElementType = function(f) {
    return typeof f == "string" || typeof f == "function" || f === e || f === c || f === n || f === o || f === d || f === m || typeof f == "object" && f !== null && (f.$$typeof === _ || f.$$typeof === w || f.$$typeof === s || f.$$typeof === a || f.$$typeof === E || f.$$typeof === y || f.$$typeof === x || f.$$typeof === R || f.$$typeof === v);
  }, q.typeOf = g, q;
}
var X = {};
var Ve;
function Jt() {
  return Ve || (Ve = 1, process.env.NODE_ENV !== "production" && (function() {
    var r = typeof Symbol == "function" && Symbol.for, i = r ? /* @__PURE__ */ Symbol.for("react.element") : 60103, t = r ? /* @__PURE__ */ Symbol.for("react.portal") : 60106, e = r ? /* @__PURE__ */ Symbol.for("react.fragment") : 60107, o = r ? /* @__PURE__ */ Symbol.for("react.strict_mode") : 60108, n = r ? /* @__PURE__ */ Symbol.for("react.profiler") : 60114, s = r ? /* @__PURE__ */ Symbol.for("react.provider") : 60109, a = r ? /* @__PURE__ */ Symbol.for("react.context") : 60110, b = r ? /* @__PURE__ */ Symbol.for("react.async_mode") : 60111, c = r ? /* @__PURE__ */ Symbol.for("react.concurrent_mode") : 60111, E = r ? /* @__PURE__ */ Symbol.for("react.forward_ref") : 60112, d = r ? /* @__PURE__ */ Symbol.for("react.suspense") : 60113, m = r ? /* @__PURE__ */ Symbol.for("react.suspense_list") : 60120, w = r ? /* @__PURE__ */ Symbol.for("react.memo") : 60115, _ = r ? /* @__PURE__ */ Symbol.for("react.lazy") : 60116, v = r ? /* @__PURE__ */ Symbol.for("react.block") : 60121, y = r ? /* @__PURE__ */ Symbol.for("react.fundamental") : 60117, x = r ? /* @__PURE__ */ Symbol.for("react.responder") : 60118, R = r ? /* @__PURE__ */ Symbol.for("react.scope") : 60119;
    function g(C) {
      return typeof C == "string" || typeof C == "function" || // Note: its typeof might be other than 'symbol' or 'number' if it's a polyfill.
      C === e || C === c || C === n || C === o || C === d || C === m || typeof C == "object" && C !== null && (C.$$typeof === _ || C.$$typeof === w || C.$$typeof === s || C.$$typeof === a || C.$$typeof === E || C.$$typeof === y || C.$$typeof === x || C.$$typeof === R || C.$$typeof === v);
    }
    function S(C) {
      if (typeof C == "object" && C !== null) {
        var te = C.$$typeof;
        switch (te) {
          case i:
            var he = C.type;
            switch (he) {
              case b:
              case c:
              case e:
              case n:
              case o:
              case d:
                return he;
              default:
                var Fe = he && he.$$typeof;
                switch (Fe) {
                  case a:
                  case E:
                  case _:
                  case w:
                  case s:
                    return Fe;
                  default:
                    return te;
                }
            }
          case t:
            return te;
        }
      }
    }
    var f = b, P = c, u = a, h = s, T = i, j = E, N = e, W = _, $ = w, G = t, J = n, I = o, A = d, H = !1;
    function V(C) {
      return H || (H = !0, console.warn("The ReactIs.isAsyncMode() alias has been deprecated, and will be removed in React 17+. Update your code to use ReactIs.isConcurrentMode() instead. It has the exact same API.")), p(C) || S(C) === b;
    }
    function p(C) {
      return S(C) === c;
    }
    function l(C) {
      return S(C) === a;
    }
    function z(C) {
      return S(C) === s;
    }
    function O(C) {
      return typeof C == "object" && C !== null && C.$$typeof === i;
    }
    function D(C) {
      return S(C) === E;
    }
    function Y(C) {
      return S(C) === e;
    }
    function k(C) {
      return S(C) === _;
    }
    function M(C) {
      return S(C) === w;
    }
    function L(C) {
      return S(C) === t;
    }
    function U(C) {
      return S(C) === n;
    }
    function B(C) {
      return S(C) === o;
    }
    function ee(C) {
      return S(C) === d;
    }
    X.AsyncMode = f, X.ConcurrentMode = P, X.ContextConsumer = u, X.ContextProvider = h, X.Element = T, X.ForwardRef = j, X.Fragment = N, X.Lazy = W, X.Memo = $, X.Portal = G, X.Profiler = J, X.StrictMode = I, X.Suspense = A, X.isAsyncMode = V, X.isConcurrentMode = p, X.isContextConsumer = l, X.isContextProvider = z, X.isElement = O, X.isForwardRef = D, X.isFragment = Y, X.isLazy = k, X.isMemo = M, X.isPortal = L, X.isProfiler = U, X.isStrictMode = B, X.isSuspense = ee, X.isValidElementType = g, X.typeOf = S;
  })()), X;
}
var Je;
function xt() {
  return Je || (Je = 1, process.env.NODE_ENV === "production" ? me.exports = Vt() : me.exports = Jt()), me.exports;
}
var Pe, Ze;
function Zt() {
  if (Ze) return Pe;
  Ze = 1;
  var r = Object.getOwnPropertySymbols, i = Object.prototype.hasOwnProperty, t = Object.prototype.propertyIsEnumerable;
  function e(n) {
    if (n == null)
      throw new TypeError("Object.assign cannot be called with null or undefined");
    return Object(n);
  }
  function o() {
    try {
      if (!Object.assign)
        return !1;
      var n = new String("abc");
      if (n[5] = "de", Object.getOwnPropertyNames(n)[0] === "5")
        return !1;
      for (var s = {}, a = 0; a < 10; a++)
        s["_" + String.fromCharCode(a)] = a;
      var b = Object.getOwnPropertyNames(s).map(function(E) {
        return s[E];
      });
      if (b.join("") !== "0123456789")
        return !1;
      var c = {};
      return "abcdefghijklmnopqrst".split("").forEach(function(E) {
        c[E] = E;
      }), Object.keys(Object.assign({}, c)).join("") === "abcdefghijklmnopqrst";
    } catch {
      return !1;
    }
  }
  return Pe = o() ? Object.assign : function(n, s) {
    for (var a, b = e(n), c, E = 1; E < arguments.length; E++) {
      a = Object(arguments[E]);
      for (var d in a)
        i.call(a, d) && (b[d] = a[d]);
      if (r) {
        c = r(a);
        for (var m = 0; m < c.length; m++)
          t.call(a, c[m]) && (b[c[m]] = a[c[m]]);
      }
    }
    return b;
  }, Pe;
}
var ze, Ke;
function He() {
  if (Ke) return ze;
  Ke = 1;
  var r = "SECRET_DO_NOT_PASS_THIS_OR_YOU_WILL_BE_FIRED";
  return ze = r, ze;
}
var Ce, Qe;
function Et() {
  return Qe || (Qe = 1, Ce = Function.call.bind(Object.prototype.hasOwnProperty)), Ce;
}
var De, et;
function Kt() {
  if (et) return De;
  et = 1;
  var r = function() {
  };
  if (process.env.NODE_ENV !== "production") {
    var i = /* @__PURE__ */ He(), t = {}, e = /* @__PURE__ */ Et();
    r = function(n) {
      var s = "Warning: " + n;
      typeof console < "u" && console.error(s);
      try {
        throw new Error(s);
      } catch {
      }
    };
  }
  function o(n, s, a, b, c) {
    if (process.env.NODE_ENV !== "production") {
      for (var E in n)
        if (e(n, E)) {
          var d;
          try {
            if (typeof n[E] != "function") {
              var m = Error(
                (b || "React class") + ": " + a + " type `" + E + "` is invalid; it must be a function, usually from the `prop-types` package, but received `" + typeof n[E] + "`.This often happens because of typos such as `PropTypes.function` instead of `PropTypes.func`."
              );
              throw m.name = "Invariant Violation", m;
            }
            d = n[E](s, E, b, a, null, i);
          } catch (_) {
            d = _;
          }
          if (d && !(d instanceof Error) && r(
            (b || "React class") + ": type specification of " + a + " `" + E + "` is invalid; the type checker function must return `null` or an `Error` but returned a " + typeof d + ". You may have forgotten to pass an argument to the type checker creator (arrayOf, instanceOf, objectOf, oneOf, oneOfType, and shape all require an argument)."
          ), d instanceof Error && !(d.message in t)) {
            t[d.message] = !0;
            var w = c ? c() : "";
            r(
              "Failed " + a + " type: " + d.message + (w ?? "")
            );
          }
        }
    }
  }
  return o.resetWarningCache = function() {
    process.env.NODE_ENV !== "production" && (t = {});
  }, De = o, De;
}
var Oe, tt;
function Qt() {
  if (tt) return Oe;
  tt = 1;
  var r = xt(), i = Zt(), t = /* @__PURE__ */ He(), e = /* @__PURE__ */ Et(), o = /* @__PURE__ */ Kt(), n = function() {
  };
  process.env.NODE_ENV !== "production" && (n = function(a) {
    var b = "Warning: " + a;
    typeof console < "u" && console.error(b);
    try {
      throw new Error(b);
    } catch {
    }
  });
  function s() {
    return null;
  }
  return Oe = function(a, b) {
    var c = typeof Symbol == "function" && Symbol.iterator, E = "@@iterator";
    function d(p) {
      var l = p && (c && p[c] || p[E]);
      if (typeof l == "function")
        return l;
    }
    var m = "<<anonymous>>", w = {
      array: x("array"),
      bigint: x("bigint"),
      bool: x("boolean"),
      func: x("function"),
      number: x("number"),
      object: x("object"),
      string: x("string"),
      symbol: x("symbol"),
      any: R(),
      arrayOf: g,
      element: S(),
      elementType: f(),
      instanceOf: P,
      node: j(),
      objectOf: h,
      oneOf: u,
      oneOfType: T,
      shape: W,
      exact: $
    };
    function _(p, l) {
      return p === l ? p !== 0 || 1 / p === 1 / l : p !== p && l !== l;
    }
    function v(p, l) {
      this.message = p, this.data = l && typeof l == "object" ? l : {}, this.stack = "";
    }
    v.prototype = Error.prototype;
    function y(p) {
      if (process.env.NODE_ENV !== "production")
        var l = {}, z = 0;
      function O(Y, k, M, L, U, B, ee) {
        if (L = L || m, B = B || M, ee !== t) {
          if (b) {
            var C = new Error(
              "Calling PropTypes validators directly is not supported by the `prop-types` package. Use `PropTypes.checkPropTypes()` to call them. Read more at http://fb.me/use-check-prop-types"
            );
            throw C.name = "Invariant Violation", C;
          } else if (process.env.NODE_ENV !== "production" && typeof console < "u") {
            var te = L + ":" + M;
            !l[te] && // Avoid spamming the console because they are often not actionable except for lib authors
            z < 3 && (n(
              "You are manually calling a React.PropTypes validation function for the `" + B + "` prop on `" + L + "`. This is deprecated and will throw in the standalone `prop-types` package. You may be seeing this warning due to a third-party PropTypes library. See https://fb.me/react-warning-dont-call-proptypes for details."
            ), l[te] = !0, z++);
          }
        }
        return k[M] == null ? Y ? k[M] === null ? new v("The " + U + " `" + B + "` is marked as required " + ("in `" + L + "`, but its value is `null`.")) : new v("The " + U + " `" + B + "` is marked as required in " + ("`" + L + "`, but its value is `undefined`.")) : null : p(k, M, L, U, B);
      }
      var D = O.bind(null, !1);
      return D.isRequired = O.bind(null, !0), D;
    }
    function x(p) {
      function l(z, O, D, Y, k, M) {
        var L = z[O], U = I(L);
        if (U !== p) {
          var B = A(L);
          return new v(
            "Invalid " + Y + " `" + k + "` of type " + ("`" + B + "` supplied to `" + D + "`, expected ") + ("`" + p + "`."),
            { expectedType: p }
          );
        }
        return null;
      }
      return y(l);
    }
    function R() {
      return y(s);
    }
    function g(p) {
      function l(z, O, D, Y, k) {
        if (typeof p != "function")
          return new v("Property `" + k + "` of component `" + D + "` has invalid PropType notation inside arrayOf.");
        var M = z[O];
        if (!Array.isArray(M)) {
          var L = I(M);
          return new v("Invalid " + Y + " `" + k + "` of type " + ("`" + L + "` supplied to `" + D + "`, expected an array."));
        }
        for (var U = 0; U < M.length; U++) {
          var B = p(M, U, D, Y, k + "[" + U + "]", t);
          if (B instanceof Error)
            return B;
        }
        return null;
      }
      return y(l);
    }
    function S() {
      function p(l, z, O, D, Y) {
        var k = l[z];
        if (!a(k)) {
          var M = I(k);
          return new v("Invalid " + D + " `" + Y + "` of type " + ("`" + M + "` supplied to `" + O + "`, expected a single ReactElement."));
        }
        return null;
      }
      return y(p);
    }
    function f() {
      function p(l, z, O, D, Y) {
        var k = l[z];
        if (!r.isValidElementType(k)) {
          var M = I(k);
          return new v("Invalid " + D + " `" + Y + "` of type " + ("`" + M + "` supplied to `" + O + "`, expected a single ReactElement type."));
        }
        return null;
      }
      return y(p);
    }
    function P(p) {
      function l(z, O, D, Y, k) {
        if (!(z[O] instanceof p)) {
          var M = p.name || m, L = V(z[O]);
          return new v("Invalid " + Y + " `" + k + "` of type " + ("`" + L + "` supplied to `" + D + "`, expected ") + ("instance of `" + M + "`."));
        }
        return null;
      }
      return y(l);
    }
    function u(p) {
      if (!Array.isArray(p))
        return process.env.NODE_ENV !== "production" && (arguments.length > 1 ? n(
          "Invalid arguments supplied to oneOf, expected an array, got " + arguments.length + " arguments. A common mistake is to write oneOf(x, y, z) instead of oneOf([x, y, z])."
        ) : n("Invalid argument supplied to oneOf, expected an array.")), s;
      function l(z, O, D, Y, k) {
        for (var M = z[O], L = 0; L < p.length; L++)
          if (_(M, p[L]))
            return null;
        var U = JSON.stringify(p, function(ee, C) {
          var te = A(C);
          return te === "symbol" ? String(C) : C;
        });
        return new v("Invalid " + Y + " `" + k + "` of value `" + String(M) + "` " + ("supplied to `" + D + "`, expected one of " + U + "."));
      }
      return y(l);
    }
    function h(p) {
      function l(z, O, D, Y, k) {
        if (typeof p != "function")
          return new v("Property `" + k + "` of component `" + D + "` has invalid PropType notation inside objectOf.");
        var M = z[O], L = I(M);
        if (L !== "object")
          return new v("Invalid " + Y + " `" + k + "` of type " + ("`" + L + "` supplied to `" + D + "`, expected an object."));
        for (var U in M)
          if (e(M, U)) {
            var B = p(M, U, D, Y, k + "." + U, t);
            if (B instanceof Error)
              return B;
          }
        return null;
      }
      return y(l);
    }
    function T(p) {
      if (!Array.isArray(p))
        return process.env.NODE_ENV !== "production" && n("Invalid argument supplied to oneOfType, expected an instance of array."), s;
      for (var l = 0; l < p.length; l++) {
        var z = p[l];
        if (typeof z != "function")
          return n(
            "Invalid argument supplied to oneOfType. Expected an array of check functions, but received " + H(z) + " at index " + l + "."
          ), s;
      }
      function O(D, Y, k, M, L) {
        for (var U = [], B = 0; B < p.length; B++) {
          var ee = p[B], C = ee(D, Y, k, M, L, t);
          if (C == null)
            return null;
          C.data && e(C.data, "expectedType") && U.push(C.data.expectedType);
        }
        var te = U.length > 0 ? ", expected one of type [" + U.join(", ") + "]" : "";
        return new v("Invalid " + M + " `" + L + "` supplied to " + ("`" + k + "`" + te + "."));
      }
      return y(O);
    }
    function j() {
      function p(l, z, O, D, Y) {
        return G(l[z]) ? null : new v("Invalid " + D + " `" + Y + "` supplied to " + ("`" + O + "`, expected a ReactNode."));
      }
      return y(p);
    }
    function N(p, l, z, O, D) {
      return new v(
        (p || "React class") + ": " + l + " type `" + z + "." + O + "` is invalid; it must be a function, usually from the `prop-types` package, but received `" + D + "`."
      );
    }
    function W(p) {
      function l(z, O, D, Y, k) {
        var M = z[O], L = I(M);
        if (L !== "object")
          return new v("Invalid " + Y + " `" + k + "` of type `" + L + "` " + ("supplied to `" + D + "`, expected `object`."));
        for (var U in p) {
          var B = p[U];
          if (typeof B != "function")
            return N(D, Y, k, U, A(B));
          var ee = B(M, U, D, Y, k + "." + U, t);
          if (ee)
            return ee;
        }
        return null;
      }
      return y(l);
    }
    function $(p) {
      function l(z, O, D, Y, k) {
        var M = z[O], L = I(M);
        if (L !== "object")
          return new v("Invalid " + Y + " `" + k + "` of type `" + L + "` " + ("supplied to `" + D + "`, expected `object`."));
        var U = i({}, z[O], p);
        for (var B in U) {
          var ee = p[B];
          if (e(p, B) && typeof ee != "function")
            return N(D, Y, k, B, A(ee));
          if (!ee)
            return new v(
              "Invalid " + Y + " `" + k + "` key `" + B + "` supplied to `" + D + "`.\nBad object: " + JSON.stringify(z[O], null, "  ") + `
Valid keys: ` + JSON.stringify(Object.keys(p), null, "  ")
            );
          var C = ee(M, B, D, Y, k + "." + B, t);
          if (C)
            return C;
        }
        return null;
      }
      return y(l);
    }
    function G(p) {
      switch (typeof p) {
        case "number":
        case "string":
        case "undefined":
          return !0;
        case "boolean":
          return !p;
        case "object":
          if (Array.isArray(p))
            return p.every(G);
          if (p === null || a(p))
            return !0;
          var l = d(p);
          if (l) {
            var z = l.call(p), O;
            if (l !== p.entries) {
              for (; !(O = z.next()).done; )
                if (!G(O.value))
                  return !1;
            } else
              for (; !(O = z.next()).done; ) {
                var D = O.value;
                if (D && !G(D[1]))
                  return !1;
              }
          } else
            return !1;
          return !0;
        default:
          return !1;
      }
    }
    function J(p, l) {
      return p === "symbol" ? !0 : l ? l["@@toStringTag"] === "Symbol" || typeof Symbol == "function" && l instanceof Symbol : !1;
    }
    function I(p) {
      var l = typeof p;
      return Array.isArray(p) ? "array" : p instanceof RegExp ? "object" : J(l, p) ? "symbol" : l;
    }
    function A(p) {
      if (typeof p > "u" || p === null)
        return "" + p;
      var l = I(p);
      if (l === "object") {
        if (p instanceof Date)
          return "date";
        if (p instanceof RegExp)
          return "regexp";
      }
      return l;
    }
    function H(p) {
      var l = A(p);
      switch (l) {
        case "array":
        case "object":
          return "an " + l;
        case "boolean":
        case "date":
        case "regexp":
          return "a " + l;
        default:
          return l;
      }
    }
    function V(p) {
      return !p.constructor || !p.constructor.name ? m : p.constructor.name;
    }
    return w.checkPropTypes = o, w.resetWarningCache = o.resetWarningCache, w.PropTypes = w, w;
  }, Oe;
}
var Me, rt;
function er() {
  if (rt) return Me;
  rt = 1;
  var r = /* @__PURE__ */ He();
  function i() {
  }
  function t() {
  }
  return t.resetWarningCache = i, Me = function() {
    function e(s, a, b, c, E, d) {
      if (d !== r) {
        var m = new Error(
          "Calling PropTypes validators directly is not supported by the `prop-types` package. Use PropTypes.checkPropTypes() to call them. Read more at http://fb.me/use-check-prop-types"
        );
        throw m.name = "Invariant Violation", m;
      }
    }
    e.isRequired = e;
    function o() {
      return e;
    }
    var n = {
      array: e,
      bigint: e,
      bool: e,
      func: e,
      number: e,
      object: e,
      string: e,
      symbol: e,
      any: e,
      arrayOf: o,
      element: e,
      elementType: e,
      instanceOf: o,
      node: e,
      objectOf: o,
      oneOf: o,
      oneOfType: o,
      shape: o,
      exact: o,
      checkPropTypes: t,
      resetWarningCache: i
    };
    return n.PropTypes = n, n;
  }, Me;
}
var nt;
function Rt() {
  if (nt) return ye.exports;
  if (nt = 1, process.env.NODE_ENV !== "production") {
    var r = xt(), i = !0;
    ye.exports = /* @__PURE__ */ Qt()(r.isElement, i);
  } else
    ye.exports = /* @__PURE__ */ er()();
  return ye.exports;
}
var be = { exports: {} }, it;
function tr() {
  if (it) return be.exports;
  it = 1;
  function r(t) {
    var e, o, n = "";
    if (typeof t == "string" || typeof t == "number") n += t;
    else if (typeof t == "object") if (Array.isArray(t)) {
      var s = t.length;
      for (e = 0; e < s; e++) t[e] && (o = r(t[e])) && (n && (n += " "), n += o);
    } else for (o in t) t[o] && (n && (n += " "), n += o);
    return n;
  }
  function i() {
    for (var t, e, o = 0, n = "", s = arguments.length; o < s; o++) (t = arguments[o]) && (e = r(t)) && (n && (n += " "), n += e);
    return n;
  }
  return be.exports = i, be.exports.clsx = i, be.exports;
}
var Z = {}, ie = {}, ot;
function _e() {
  if (ot) return ie;
  ot = 1, Object.defineProperty(ie, "__esModule", {
    value: !0
  }), ie.dontSetMe = o, ie.findInArray = r, ie.int = e, ie.isFunction = i, ie.isNum = t;
  function r(n, s) {
    for (let a = 0, b = n.length; a < b; a++)
      if (s.apply(s, [n[a], a, n])) return n[a];
  }
  function i(n) {
    return typeof n == "function" || Object.prototype.toString.call(n) === "[object Function]";
  }
  function t(n) {
    return typeof n == "number" && !isNaN(n);
  }
  function e(n) {
    return parseInt(n, 10);
  }
  function o(n, s, a) {
    if (n[s])
      return new Error(`Invalid prop ${s} passed to ${a} - do not set this, set it on the child.`);
  }
  return ie;
}
var oe = {}, st;
function rr() {
  if (st) return oe;
  st = 1, Object.defineProperty(oe, "__esModule", {
    value: !0
  }), oe.browserPrefixToKey = t, oe.browserPrefixToStyle = e, oe.default = void 0, oe.getPrefix = i;
  const r = ["Moz", "Webkit", "O", "ms"];
  function i() {
    let n = arguments.length > 0 && arguments[0] !== void 0 ? arguments[0] : "transform";
    if (typeof window > "u") return "";
    const s = window.document?.documentElement?.style;
    if (!s || n in s) return "";
    for (let a = 0; a < r.length; a++)
      if (t(n, r[a]) in s) return r[a];
    return "";
  }
  function t(n, s) {
    return s ? `${s}${o(n)}` : n;
  }
  function e(n, s) {
    return s ? `-${s.toLowerCase()}-${n}` : n;
  }
  function o(n) {
    let s = "", a = !0;
    for (let b = 0; b < n.length; b++)
      a ? (s += n[b].toUpperCase(), a = !1) : n[b] === "-" ? a = !0 : s += n[b];
    return s;
  }
  return oe.default = i(), oe;
}
var at;
function Le() {
  if (at) return Z;
  at = 1, Object.defineProperty(Z, "__esModule", {
    value: !0
  }), Z.addClassName = f, Z.addEvent = s, Z.addUserSelectStyles = R, Z.createCSSTransform = w, Z.createSVGTransform = _, Z.getTouch = y, Z.getTouchIdentifier = x, Z.getTranslation = v, Z.innerHeight = E, Z.innerWidth = d, Z.matchesSelector = o, Z.matchesSelectorAndParentsTo = n, Z.offsetXYFromParent = m, Z.outerHeight = b, Z.outerWidth = c, Z.removeClassName = P, Z.removeEvent = a, Z.scheduleRemoveUserSelectStyles = g;
  var r = _e(), i = t(rr());
  function t(u, h) {
    if (typeof WeakMap == "function") var T = /* @__PURE__ */ new WeakMap(), j = /* @__PURE__ */ new WeakMap();
    return (t = function(N, W) {
      if (!W && N && N.__esModule) return N;
      var $, G, J = { __proto__: null, default: N };
      if (N === null || typeof N != "object" && typeof N != "function") return J;
      if ($ = W ? j : T) {
        if ($.has(N)) return $.get(N);
        $.set(N, J);
      }
      for (const I in N) I !== "default" && {}.hasOwnProperty.call(N, I) && ((G = ($ = Object.defineProperty) && Object.getOwnPropertyDescriptor(N, I)) && (G.get || G.set) ? $(J, I, G) : J[I] = N[I]);
      return J;
    })(u, h);
  }
  let e = "";
  function o(u, h) {
    return e || (e = (0, r.findInArray)(["matches", "webkitMatchesSelector", "mozMatchesSelector", "msMatchesSelector", "oMatchesSelector"], function(T) {
      return (0, r.isFunction)(u[T]);
    })), (0, r.isFunction)(u[e]) ? u[e](h) : !1;
  }
  function n(u, h, T) {
    let j = u;
    do {
      if (o(j, h)) return !0;
      if (j === T) return !1;
      j = j.parentNode;
    } while (j);
    return !1;
  }
  function s(u, h, T, j) {
    if (!u) return;
    const N = {
      capture: !0,
      ...j
    };
    u.addEventListener ? u.addEventListener(h, T, N) : u.attachEvent ? u.attachEvent("on" + h, T) : u["on" + h] = T;
  }
  function a(u, h, T, j) {
    if (!u) return;
    const N = {
      capture: !0,
      ...j
    };
    u.removeEventListener ? u.removeEventListener(h, T, N) : u.detachEvent ? u.detachEvent("on" + h, T) : u["on" + h] = null;
  }
  function b(u) {
    let h = u.clientHeight;
    const T = u.ownerDocument.defaultView.getComputedStyle(u);
    return h += (0, r.int)(T.borderTopWidth), h += (0, r.int)(T.borderBottomWidth), h;
  }
  function c(u) {
    let h = u.clientWidth;
    const T = u.ownerDocument.defaultView.getComputedStyle(u);
    return h += (0, r.int)(T.borderLeftWidth), h += (0, r.int)(T.borderRightWidth), h;
  }
  function E(u) {
    let h = u.clientHeight;
    const T = u.ownerDocument.defaultView.getComputedStyle(u);
    return h -= (0, r.int)(T.paddingTop), h -= (0, r.int)(T.paddingBottom), h;
  }
  function d(u) {
    let h = u.clientWidth;
    const T = u.ownerDocument.defaultView.getComputedStyle(u);
    return h -= (0, r.int)(T.paddingLeft), h -= (0, r.int)(T.paddingRight), h;
  }
  function m(u, h, T) {
    const N = h === h.ownerDocument.body ? {
      left: 0,
      top: 0
    } : h.getBoundingClientRect(), W = (u.clientX + h.scrollLeft - N.left) / T, $ = (u.clientY + h.scrollTop - N.top) / T;
    return {
      x: W,
      y: $
    };
  }
  function w(u, h) {
    const T = v(u, h, "px");
    return {
      [(0, i.browserPrefixToKey)("transform", i.default)]: T
    };
  }
  function _(u, h) {
    return v(u, h, "");
  }
  function v(u, h, T) {
    let {
      x: j,
      y: N
    } = u, W = `translate(${j}${T},${N}${T})`;
    if (h) {
      const $ = `${typeof h.x == "string" ? h.x : h.x + T}`, G = `${typeof h.y == "string" ? h.y : h.y + T}`;
      W = `translate(${$}, ${G})` + W;
    }
    return W;
  }
  function y(u, h) {
    return u.targetTouches && (0, r.findInArray)(u.targetTouches, (T) => h === T.identifier) || u.changedTouches && (0, r.findInArray)(u.changedTouches, (T) => h === T.identifier);
  }
  function x(u) {
    if (u.targetTouches && u.targetTouches[0]) return u.targetTouches[0].identifier;
    if (u.changedTouches && u.changedTouches[0]) return u.changedTouches[0].identifier;
  }
  function R(u) {
    if (!u) return;
    let h = u.getElementById("react-draggable-style-el");
    h || (h = u.createElement("style"), h.type = "text/css", h.id = "react-draggable-style-el", h.innerHTML = `.react-draggable-transparent-selection *::-moz-selection {all: inherit;}
`, h.innerHTML += `.react-draggable-transparent-selection *::selection {all: inherit;}
`, u.getElementsByTagName("head")[0].appendChild(h)), u.body && f(u.body, "react-draggable-transparent-selection");
  }
  function g(u) {
    window.requestAnimationFrame ? window.requestAnimationFrame(() => {
      S(u);
    }) : S(u);
  }
  function S(u) {
    if (u)
      try {
        if (u.body && P(u.body, "react-draggable-transparent-selection"), u.selection)
          u.selection.empty();
        else {
          const h = (u.defaultView || window).getSelection();
          h && h.type !== "Caret" && h.removeAllRanges();
        }
      } catch {
      }
  }
  function f(u, h) {
    u.classList ? u.classList.add(h) : u.className.match(new RegExp(`(?:^|\\s)${h}(?!\\S)`)) || (u.className += ` ${h}`);
  }
  function P(u, h) {
    u.classList ? u.classList.remove(h) : u.className = u.className.replace(new RegExp(`(?:^|\\s)${h}(?!\\S)`, "g"), "");
  }
  return Z;
}
var re = {}, lt;
function _t() {
  if (lt) return re;
  lt = 1, Object.defineProperty(re, "__esModule", {
    value: !0
  }), re.canDragX = o, re.canDragY = n, re.createCoreData = a, re.createDraggableData = b, re.getBoundPosition = t, re.getControlPosition = s, re.snapToGrid = e;
  var r = _e(), i = Le();
  function t(d, m, w) {
    if (!d.props.bounds) return [m, w];
    let {
      bounds: _
    } = d.props;
    _ = typeof _ == "string" ? _ : c(_);
    const v = E(d);
    if (typeof _ == "string") {
      const {
        ownerDocument: y
      } = v, x = y.defaultView;
      let R;
      if (_ === "parent" ? R = v.parentNode : R = v.getRootNode().querySelector(_), !(R instanceof x.HTMLElement))
        throw new Error('Bounds selector "' + _ + '" could not find an element.');
      const g = R, S = x.getComputedStyle(v), f = x.getComputedStyle(g);
      _ = {
        left: -v.offsetLeft + (0, r.int)(f.paddingLeft) + (0, r.int)(S.marginLeft),
        top: -v.offsetTop + (0, r.int)(f.paddingTop) + (0, r.int)(S.marginTop),
        right: (0, i.innerWidth)(g) - (0, i.outerWidth)(v) - v.offsetLeft + (0, r.int)(f.paddingRight) - (0, r.int)(S.marginRight),
        bottom: (0, i.innerHeight)(g) - (0, i.outerHeight)(v) - v.offsetTop + (0, r.int)(f.paddingBottom) - (0, r.int)(S.marginBottom)
      };
    }
    return (0, r.isNum)(_.right) && (m = Math.min(m, _.right)), (0, r.isNum)(_.bottom) && (w = Math.min(w, _.bottom)), (0, r.isNum)(_.left) && (m = Math.max(m, _.left)), (0, r.isNum)(_.top) && (w = Math.max(w, _.top)), [m, w];
  }
  function e(d, m, w) {
    const _ = Math.round(m / d[0]) * d[0], v = Math.round(w / d[1]) * d[1];
    return [_, v];
  }
  function o(d) {
    return d.props.axis === "both" || d.props.axis === "x";
  }
  function n(d) {
    return d.props.axis === "both" || d.props.axis === "y";
  }
  function s(d, m, w) {
    const _ = typeof m == "number" ? (0, i.getTouch)(d, m) : null;
    if (typeof m == "number" && !_) return null;
    const v = E(w), y = w.props.offsetParent || v.offsetParent || v.ownerDocument.body;
    return (0, i.offsetXYFromParent)(_ || d, y, w.props.scale);
  }
  function a(d, m, w) {
    const _ = !(0, r.isNum)(d.lastX), v = E(d);
    return _ ? {
      node: v,
      deltaX: 0,
      deltaY: 0,
      lastX: m,
      lastY: w,
      x: m,
      y: w
    } : {
      node: v,
      deltaX: m - d.lastX,
      deltaY: w - d.lastY,
      lastX: d.lastX,
      lastY: d.lastY,
      x: m,
      y: w
    };
  }
  function b(d, m) {
    const w = d.props.scale;
    return {
      node: m.node,
      x: d.state.x + m.deltaX / w,
      y: d.state.y + m.deltaY / w,
      deltaX: m.deltaX / w,
      deltaY: m.deltaY / w,
      lastX: d.state.x,
      lastY: d.state.y
    };
  }
  function c(d) {
    return {
      left: d.left,
      top: d.top,
      right: d.right,
      bottom: d.bottom
    };
  }
  function E(d) {
    const m = d.findDOMNode();
    if (!m)
      throw new Error("<DraggableCore>: Unmounted during event!");
    return m;
  }
  return re;
}
var ce = {}, we = {}, ut;
function Tt() {
  if (ut) return we;
  ut = 1, Object.defineProperty(we, "__esModule", {
    value: !0
  }), we.default = r;
  function r() {
  }
  return we;
}
var ft;
function nr() {
  if (ft) return ce;
  ft = 1, Object.defineProperty(ce, "__esModule", {
    value: !0
  }), ce.default = void 0;
  var r = b(ke), i = a(/* @__PURE__ */ Rt()), t = a(wt), e = Le(), o = _t(), n = _e(), s = a(Tt());
  function a(v) {
    return v && v.__esModule ? v : { default: v };
  }
  function b(v, y) {
    if (typeof WeakMap == "function") var x = /* @__PURE__ */ new WeakMap(), R = /* @__PURE__ */ new WeakMap();
    return (b = function(g, S) {
      if (!S && g && g.__esModule) return g;
      var f, P, u = { __proto__: null, default: g };
      if (g === null || typeof g != "object" && typeof g != "function") return u;
      if (f = S ? R : x) {
        if (f.has(g)) return f.get(g);
        f.set(g, u);
      }
      for (const h in g) h !== "default" && {}.hasOwnProperty.call(g, h) && ((P = (f = Object.defineProperty) && Object.getOwnPropertyDescriptor(g, h)) && (P.get || P.set) ? f(u, h, P) : u[h] = g[h]);
      return u;
    })(v, y);
  }
  function c(v, y, x) {
    return (y = E(y)) in v ? Object.defineProperty(v, y, { value: x, enumerable: !0, configurable: !0, writable: !0 }) : v[y] = x, v;
  }
  function E(v) {
    var y = d(v, "string");
    return typeof y == "symbol" ? y : y + "";
  }
  function d(v, y) {
    if (typeof v != "object" || !v) return v;
    var x = v[Symbol.toPrimitive];
    if (x !== void 0) {
      var R = x.call(v, y);
      if (typeof R != "object") return R;
      throw new TypeError("@@toPrimitive must return a primitive value.");
    }
    return (y === "string" ? String : Number)(v);
  }
  const m = {
    touch: {
      start: "touchstart",
      move: "touchmove",
      stop: "touchend"
    },
    mouse: {
      start: "mousedown",
      move: "mousemove",
      stop: "mouseup"
    }
  };
  let w = m.mouse, _ = class extends r.Component {
    constructor() {
      super(...arguments), c(this, "dragging", !1), c(this, "lastX", NaN), c(this, "lastY", NaN), c(this, "touchIdentifier", null), c(this, "mounted", !1), c(this, "handleDragStart", (y) => {
        if (this.props.onMouseDown(y), !this.props.allowAnyClick && typeof y.button == "number" && y.button !== 0) return !1;
        const x = this.findDOMNode();
        if (!x || !x.ownerDocument || !x.ownerDocument.body)
          throw new Error("<DraggableCore> not mounted on DragStart!");
        const {
          ownerDocument: R
        } = x;
        if (this.props.disabled || !(y.target instanceof R.defaultView.Node) || this.props.handle && !(0, e.matchesSelectorAndParentsTo)(y.target, this.props.handle, x) || this.props.cancel && (0, e.matchesSelectorAndParentsTo)(y.target, this.props.cancel, x))
          return;
        y.type === "touchstart" && !this.props.allowMobileScroll && y.preventDefault();
        const g = (0, e.getTouchIdentifier)(y);
        this.touchIdentifier = g;
        const S = (0, o.getControlPosition)(y, g, this);
        if (S == null) return;
        const {
          x: f,
          y: P
        } = S, u = (0, o.createCoreData)(this, f, P);
        (0, s.default)("DraggableCore: handleDragStart: %j", u), (0, s.default)("calling", this.props.onStart), !(this.props.onStart(y, u) === !1 || this.mounted === !1) && (this.props.enableUserSelectHack && (0, e.addUserSelectStyles)(R), this.dragging = !0, this.lastX = f, this.lastY = P, (0, e.addEvent)(R, w.move, this.handleDrag), (0, e.addEvent)(R, w.stop, this.handleDragStop));
      }), c(this, "handleDrag", (y) => {
        const x = (0, o.getControlPosition)(y, this.touchIdentifier, this);
        if (x == null) return;
        let {
          x: R,
          y: g
        } = x;
        if (Array.isArray(this.props.grid)) {
          let P = R - this.lastX, u = g - this.lastY;
          if ([P, u] = (0, o.snapToGrid)(this.props.grid, P, u), !P && !u) return;
          R = this.lastX + P, g = this.lastY + u;
        }
        const S = (0, o.createCoreData)(this, R, g);
        if ((0, s.default)("DraggableCore: handleDrag: %j", S), this.props.onDrag(y, S) === !1 || this.mounted === !1) {
          try {
            this.handleDragStop(new MouseEvent("mouseup"));
          } catch {
            const u = document.createEvent("MouseEvents");
            u.initMouseEvent("mouseup", !0, !0, window, 0, 0, 0, 0, 0, !1, !1, !1, !1, 0, null), this.handleDragStop(u);
          }
          return;
        }
        this.lastX = R, this.lastY = g;
      }), c(this, "handleDragStop", (y) => {
        if (!this.dragging) return;
        const x = (0, o.getControlPosition)(y, this.touchIdentifier, this);
        if (x == null) return;
        let {
          x: R,
          y: g
        } = x;
        if (Array.isArray(this.props.grid)) {
          let u = R - this.lastX || 0, h = g - this.lastY || 0;
          [u, h] = (0, o.snapToGrid)(this.props.grid, u, h), R = this.lastX + u, g = this.lastY + h;
        }
        const S = (0, o.createCoreData)(this, R, g);
        if (this.props.onStop(y, S) === !1 || this.mounted === !1) return !1;
        const P = this.findDOMNode();
        P && this.props.enableUserSelectHack && (0, e.scheduleRemoveUserSelectStyles)(P.ownerDocument), (0, s.default)("DraggableCore: handleDragStop: %j", S), this.dragging = !1, this.lastX = NaN, this.lastY = NaN, P && ((0, s.default)("DraggableCore: Removing handlers"), (0, e.removeEvent)(P.ownerDocument, w.move, this.handleDrag), (0, e.removeEvent)(P.ownerDocument, w.stop, this.handleDragStop));
      }), c(this, "onMouseDown", (y) => (w = m.mouse, this.handleDragStart(y))), c(this, "onMouseUp", (y) => (w = m.mouse, this.handleDragStop(y))), c(this, "onTouchStart", (y) => (w = m.touch, this.handleDragStart(y))), c(this, "onTouchEnd", (y) => (w = m.touch, this.handleDragStop(y)));
    }
    componentDidMount() {
      this.mounted = !0;
      const y = this.findDOMNode();
      y && (0, e.addEvent)(y, m.touch.start, this.onTouchStart, {
        passive: !1
      });
    }
    componentWillUnmount() {
      this.mounted = !1;
      const y = this.findDOMNode();
      if (y) {
        const {
          ownerDocument: x
        } = y;
        (0, e.removeEvent)(x, m.mouse.move, this.handleDrag), (0, e.removeEvent)(x, m.touch.move, this.handleDrag), (0, e.removeEvent)(x, m.mouse.stop, this.handleDragStop), (0, e.removeEvent)(x, m.touch.stop, this.handleDragStop), (0, e.removeEvent)(y, m.touch.start, this.onTouchStart, {
          passive: !1
        }), this.props.enableUserSelectHack && (0, e.scheduleRemoveUserSelectStyles)(x);
      }
    }
    // React Strict Mode compatibility: if `nodeRef` is passed, we will use it instead of trying to find
    // the underlying DOM node ourselves. See the README for more information.
    findDOMNode() {
      return this.props?.nodeRef ? this.props?.nodeRef?.current : t.default.findDOMNode(this);
    }
    render() {
      return /* @__PURE__ */ r.cloneElement(r.Children.only(this.props.children), {
        // Note: mouseMove handler is attached to document so it will still function
        // when the user drags quickly and leaves the bounds of the element.
        onMouseDown: this.onMouseDown,
        onMouseUp: this.onMouseUp,
        // onTouchStart is added on `componentDidMount` so they can be added with
        // {passive: false}, which allows it to cancel. See
        // https://developers.google.com/web/updates/2017/01/scrolling-intervention
        onTouchEnd: this.onTouchEnd
      });
    }
  };
  return ce.default = _, c(_, "displayName", "DraggableCore"), c(_, "propTypes", {
    /**
     * `allowAnyClick` allows dragging using any mouse button.
     * By default, we only accept the left button.
     *
     * Defaults to `false`.
     */
    allowAnyClick: i.default.bool,
    /**
     * `allowMobileScroll` turns off cancellation of the 'touchstart' event
     * on mobile devices. Only enable this if you are having trouble with click
     * events. Prefer using 'handle' / 'cancel' instead.
     *
     * Defaults to `false`.
     */
    allowMobileScroll: i.default.bool,
    children: i.default.node.isRequired,
    /**
     * `disabled`, if true, stops the <Draggable> from dragging. All handlers,
     * with the exception of `onMouseDown`, will not fire.
     */
    disabled: i.default.bool,
    /**
     * By default, we add 'user-select:none' attributes to the document body
     * to prevent ugly text selection during drag. If this is causing problems
     * for your app, set this to `false`.
     */
    enableUserSelectHack: i.default.bool,
    /**
     * `offsetParent`, if set, uses the passed DOM node to compute drag offsets
     * instead of using the parent node.
     */
    offsetParent: function(v, y) {
      if (v[y] && v[y].nodeType !== 1)
        throw new Error("Draggable's offsetParent must be a DOM Node.");
    },
    /**
     * `grid` specifies the x and y that dragging should snap to.
     */
    grid: i.default.arrayOf(i.default.number),
    /**
     * `handle` specifies a selector to be used as the handle that initiates drag.
     *
     * Example:
     *
     * ```jsx
     *   let App = React.createClass({
     *       render: function () {
     *         return (
     *            <Draggable handle=".handle">
     *              <div>
     *                  <div className="handle">Click me to drag</div>
     *                  <div>This is some other content</div>
     *              </div>
     *           </Draggable>
     *         );
     *       }
     *   });
     * ```
     */
    handle: i.default.string,
    /**
     * `cancel` specifies a selector to be used to prevent drag initialization.
     *
     * Example:
     *
     * ```jsx
     *   let App = React.createClass({
     *       render: function () {
     *           return(
     *               <Draggable cancel=".cancel">
     *                   <div>
     *                     <div className="cancel">You can't drag from here</div>
     *                     <div>Dragging here works fine</div>
     *                   </div>
     *               </Draggable>
     *           );
     *       }
     *   });
     * ```
     */
    cancel: i.default.string,
    /* If running in React Strict mode, ReactDOM.findDOMNode() is deprecated.
     * Unfortunately, in order for <Draggable> to work properly, we need raw access
     * to the underlying DOM node. If you want to avoid the warning, pass a `nodeRef`
     * as in this example:
     *
     * function MyComponent() {
     *   const nodeRef = React.useRef(null);
     *   return (
     *     <Draggable nodeRef={nodeRef}>
     *       <div ref={nodeRef}>Example Target</div>
     *     </Draggable>
     *   );
     * }
     *
     * This can be used for arbitrarily nested components, so long as the ref ends up
     * pointing to the actual child DOM node and not a custom component.
     */
    nodeRef: i.default.object,
    /**
     * Called when dragging starts.
     * If this function returns the boolean false, dragging will be canceled.
     */
    onStart: i.default.func,
    /**
     * Called while dragging.
     * If this function returns the boolean false, dragging will be canceled.
     */
    onDrag: i.default.func,
    /**
     * Called when dragging stops.
     * If this function returns the boolean false, the drag will remain active.
     */
    onStop: i.default.func,
    /**
     * A workaround option which can be passed if onMouseDown needs to be accessed,
     * since it'll always be blocked (as there is internal use of onMouseDown)
     */
    onMouseDown: i.default.func,
    /**
     * `scale`, if set, applies scaling while dragging an element
     */
    scale: i.default.number,
    /**
     * These properties should be defined on the child, not here.
     */
    className: n.dontSetMe,
    style: n.dontSetMe,
    transform: n.dontSetMe
  }), c(_, "defaultProps", {
    allowAnyClick: !1,
    // by default only accept left click
    allowMobileScroll: !1,
    disabled: !1,
    enableUserSelectHack: !0,
    onStart: function() {
    },
    onDrag: function() {
    },
    onStop: function() {
    },
    onMouseDown: function() {
    },
    scale: 1
  }), ce;
}
var ct;
function ir() {
  return ct || (ct = 1, (function(r) {
    Object.defineProperty(r, "__esModule", {
      value: !0
    }), Object.defineProperty(r, "DraggableCore", {
      enumerable: !0,
      get: function() {
        return b.default;
      }
    }), r.default = void 0;
    var i = d(ke), t = E(/* @__PURE__ */ Rt()), e = E(wt), o = tr(), n = Le(), s = _t(), a = _e(), b = E(nr()), c = E(Tt());
    function E(x) {
      return x && x.__esModule ? x : { default: x };
    }
    function d(x, R) {
      if (typeof WeakMap == "function") var g = /* @__PURE__ */ new WeakMap(), S = /* @__PURE__ */ new WeakMap();
      return (d = function(f, P) {
        if (!P && f && f.__esModule) return f;
        var u, h, T = { __proto__: null, default: f };
        if (f === null || typeof f != "object" && typeof f != "function") return T;
        if (u = P ? S : g) {
          if (u.has(f)) return u.get(f);
          u.set(f, T);
        }
        for (const j in f) j !== "default" && {}.hasOwnProperty.call(f, j) && ((h = (u = Object.defineProperty) && Object.getOwnPropertyDescriptor(f, j)) && (h.get || h.set) ? u(T, j, h) : T[j] = f[j]);
        return T;
      })(x, R);
    }
    function m() {
      return m = Object.assign ? Object.assign.bind() : function(x) {
        for (var R = 1; R < arguments.length; R++) {
          var g = arguments[R];
          for (var S in g) ({}).hasOwnProperty.call(g, S) && (x[S] = g[S]);
        }
        return x;
      }, m.apply(null, arguments);
    }
    function w(x, R, g) {
      return (R = _(R)) in x ? Object.defineProperty(x, R, { value: g, enumerable: !0, configurable: !0, writable: !0 }) : x[R] = g, x;
    }
    function _(x) {
      var R = v(x, "string");
      return typeof R == "symbol" ? R : R + "";
    }
    function v(x, R) {
      if (typeof x != "object" || !x) return x;
      var g = x[Symbol.toPrimitive];
      if (g !== void 0) {
        var S = g.call(x, R);
        if (typeof S != "object") return S;
        throw new TypeError("@@toPrimitive must return a primitive value.");
      }
      return (R === "string" ? String : Number)(x);
    }
    class y extends i.Component {
      // React 16.3+
      // Arity (props, state)
      static getDerivedStateFromProps(R, g) {
        let {
          position: S
        } = R, {
          prevPropsPosition: f
        } = g;
        return S && (!f || S.x !== f.x || S.y !== f.y) ? ((0, c.default)("Draggable: getDerivedStateFromProps %j", {
          position: S,
          prevPropsPosition: f
        }), {
          x: S.x,
          y: S.y,
          prevPropsPosition: {
            ...S
          }
        }) : null;
      }
      constructor(R) {
        super(R), w(this, "onDragStart", (g, S) => {
          if ((0, c.default)("Draggable: onDragStart: %j", S), this.props.onStart(g, (0, s.createDraggableData)(this, S)) === !1) return !1;
          this.setState({
            dragging: !0,
            dragged: !0
          });
        }), w(this, "onDrag", (g, S) => {
          if (!this.state.dragging) return !1;
          (0, c.default)("Draggable: onDrag: %j", S);
          const f = (0, s.createDraggableData)(this, S), P = {
            x: f.x,
            y: f.y,
            slackX: 0,
            slackY: 0
          };
          if (this.props.bounds) {
            const {
              x: h,
              y: T
            } = P;
            P.x += this.state.slackX, P.y += this.state.slackY;
            const [j, N] = (0, s.getBoundPosition)(this, P.x, P.y);
            P.x = j, P.y = N, P.slackX = this.state.slackX + (h - P.x), P.slackY = this.state.slackY + (T - P.y), f.x = P.x, f.y = P.y, f.deltaX = P.x - this.state.x, f.deltaY = P.y - this.state.y;
          }
          if (this.props.onDrag(g, f) === !1) return !1;
          this.setState(P);
        }), w(this, "onDragStop", (g, S) => {
          if (!this.state.dragging || this.props.onStop(g, (0, s.createDraggableData)(this, S)) === !1) return !1;
          (0, c.default)("Draggable: onDragStop: %j", S);
          const P = {
            dragging: !1,
            slackX: 0,
            slackY: 0
          };
          if (!!this.props.position) {
            const {
              x: h,
              y: T
            } = this.props.position;
            P.x = h, P.y = T;
          }
          this.setState(P);
        }), this.state = {
          // Whether or not we are currently dragging.
          dragging: !1,
          // Whether or not we have been dragged before.
          dragged: !1,
          // Current transform x and y.
          x: R.position ? R.position.x : R.defaultPosition.x,
          y: R.position ? R.position.y : R.defaultPosition.y,
          prevPropsPosition: {
            ...R.position
          },
          // Used for compensating for out-of-bounds drags
          slackX: 0,
          slackY: 0,
          // Can only determine if SVG after mounting
          isElementSVG: !1
        }, R.position && !(R.onDrag || R.onStop) && console.warn("A `position` was applied to this <Draggable>, without drag handlers. This will make this component effectively undraggable. Please attach `onDrag` or `onStop` handlers so you can adjust the `position` of this element.");
      }
      componentDidMount() {
        typeof window.SVGElement < "u" && this.findDOMNode() instanceof window.SVGElement && this.setState({
          isElementSVG: !0
        });
      }
      componentWillUnmount() {
        this.state.dragging && this.setState({
          dragging: !1
        });
      }
      // React Strict Mode compatibility: if `nodeRef` is passed, we will use it instead of trying to find
      // the underlying DOM node ourselves. See the README for more information.
      findDOMNode() {
        return this.props?.nodeRef?.current ?? e.default.findDOMNode(this);
      }
      render() {
        const {
          axis: R,
          bounds: g,
          children: S,
          defaultPosition: f,
          defaultClassName: P,
          defaultClassNameDragging: u,
          defaultClassNameDragged: h,
          position: T,
          positionOffset: j,
          scale: N,
          ...W
        } = this.props;
        let $ = {}, G = null;
        const I = !!!T || this.state.dragging, A = T || f, H = {
          // Set left if horizontal drag is enabled
          x: (0, s.canDragX)(this) && I ? this.state.x : A.x,
          // Set top if vertical drag is enabled
          y: (0, s.canDragY)(this) && I ? this.state.y : A.y
        };
        this.state.isElementSVG ? G = (0, n.createSVGTransform)(H, j) : $ = (0, n.createCSSTransform)(H, j);
        const V = (0, o.clsx)(S.props.className || "", P, {
          [u]: this.state.dragging,
          [h]: this.state.dragged
        });
        return /* @__PURE__ */ i.createElement(b.default, m({}, W, {
          onStart: this.onDragStart,
          onDrag: this.onDrag,
          onStop: this.onDragStop
        }), /* @__PURE__ */ i.cloneElement(i.Children.only(S), {
          className: V,
          style: {
            ...S.props.style,
            ...$
          },
          transform: G
        }));
      }
    }
    r.default = y, w(y, "displayName", "Draggable"), w(y, "propTypes", {
      // Accepts all props <DraggableCore> accepts.
      ...b.default.propTypes,
      /**
       * `axis` determines which axis the draggable can move.
       *
       *  Note that all callbacks will still return data as normal. This only
       *  controls flushing to the DOM.
       *
       * 'both' allows movement horizontally and vertically.
       * 'x' limits movement to horizontal axis.
       * 'y' limits movement to vertical axis.
       * 'none' limits all movement.
       *
       * Defaults to 'both'.
       */
      axis: t.default.oneOf(["both", "x", "y", "none"]),
      /**
       * `bounds` determines the range of movement available to the element.
       * Available values are:
       *
       * 'parent' restricts movement within the Draggable's parent node.
       *
       * Alternatively, pass an object with the following properties, all of which are optional:
       *
       * {left: LEFT_BOUND, right: RIGHT_BOUND, bottom: BOTTOM_BOUND, top: TOP_BOUND}
       *
       * All values are in px.
       *
       * Example:
       *
       * ```jsx
       *   let App = React.createClass({
       *       render: function () {
       *         return (
       *            <Draggable bounds={{right: 300, bottom: 300}}>
       *              <div>Content</div>
       *           </Draggable>
       *         );
       *       }
       *   });
       * ```
       */
      bounds: t.default.oneOfType([t.default.shape({
        left: t.default.number,
        right: t.default.number,
        top: t.default.number,
        bottom: t.default.number
      }), t.default.string, t.default.oneOf([!1])]),
      defaultClassName: t.default.string,
      defaultClassNameDragging: t.default.string,
      defaultClassNameDragged: t.default.string,
      /**
       * `defaultPosition` specifies the x and y that the dragged item should start at
       *
       * Example:
       *
       * ```jsx
       *      let App = React.createClass({
       *          render: function () {
       *              return (
       *                  <Draggable defaultPosition={{x: 25, y: 25}}>
       *                      <div>I start with transformX: 25px and transformY: 25px;</div>
       *                  </Draggable>
       *              );
       *          }
       *      });
       * ```
       */
      defaultPosition: t.default.shape({
        x: t.default.number,
        y: t.default.number
      }),
      positionOffset: t.default.shape({
        x: t.default.oneOfType([t.default.number, t.default.string]),
        y: t.default.oneOfType([t.default.number, t.default.string])
      }),
      /**
       * `position`, if present, defines the current position of the element.
       *
       *  This is similar to how form elements in React work - if no `position` is supplied, the component
       *  is uncontrolled.
       *
       * Example:
       *
       * ```jsx
       *      let App = React.createClass({
       *          render: function () {
       *              return (
       *                  <Draggable position={{x: 25, y: 25}}>
       *                      <div>I start with transformX: 25px and transformY: 25px;</div>
       *                  </Draggable>
       *              );
       *          }
       *      });
       * ```
       */
      position: t.default.shape({
        x: t.default.number,
        y: t.default.number
      }),
      /**
       * These properties should be defined on the child, not here.
       */
      className: a.dontSetMe,
      style: a.dontSetMe,
      transform: a.dontSetMe
    }), w(y, "defaultProps", {
      ...b.default.defaultProps,
      axis: "both",
      bounds: !1,
      defaultClassName: "react-draggable",
      defaultClassNameDragging: "react-draggable-dragging",
      defaultClassNameDragged: "react-draggable-dragged",
      defaultPosition: {
        x: 0,
        y: 0
      },
      scale: 1
    });
  })(Te)), Te;
}
var ht;
function or() {
  if (ht) return fe.exports;
  ht = 1;
  const {
    default: r,
    DraggableCore: i
  } = ir();
  return fe.exports = r, fe.exports.default = r, fe.exports.DraggableCore = i, fe.exports;
}
var sr = or();
const ar = /* @__PURE__ */ Ut(sr);
var K = function() {
  return K = Object.assign || function(r) {
    for (var i, t = 1, e = arguments.length; t < e; t++) {
      i = arguments[t];
      for (var o in i) Object.prototype.hasOwnProperty.call(i, o) && (r[o] = i[o]);
    }
    return r;
  }, K.apply(this, arguments);
}, dt = {
  width: "100%",
  height: "10px",
  top: "0px",
  left: "0px",
  cursor: "row-resize"
}, pt = {
  width: "10px",
  height: "100%",
  top: "0px",
  left: "0px",
  cursor: "col-resize"
}, Se = {
  width: "20px",
  height: "20px",
  position: "absolute",
  zIndex: 1
}, lr = {
  top: K(K({}, dt), { top: "-5px" }),
  right: K(K({}, pt), { left: void 0, right: "-5px" }),
  bottom: K(K({}, dt), { top: void 0, bottom: "-5px" }),
  left: K(K({}, pt), { left: "-5px" }),
  topRight: K(K({}, Se), { right: "-10px", top: "-10px", cursor: "ne-resize" }),
  bottomRight: K(K({}, Se), { right: "-10px", bottom: "-10px", cursor: "se-resize" }),
  bottomLeft: K(K({}, Se), { left: "-10px", bottom: "-10px", cursor: "sw-resize" }),
  topLeft: K(K({}, Se), { left: "-10px", top: "-10px", cursor: "nw-resize" })
}, ur = mt(function(r) {
  var i = r.onResizeStart, t = r.direction, e = r.children, o = r.replaceStyles, n = r.className, s = Ne(function(c) {
    i(c, t);
  }, [i, t]), a = Ne(function(c) {
    i(c, t);
  }, [i, t]), b = Ct(function() {
    return K(K({ position: "absolute", userSelect: "none" }, lr[t]), o ?? {});
  }, [o, t]);
  return F.jsx("div", { className: n || void 0, style: b, onMouseDown: s, onTouchStart: a, children: e });
}), fr = /* @__PURE__ */ (function() {
  var r = function(i, t) {
    return r = Object.setPrototypeOf || { __proto__: [] } instanceof Array && function(e, o) {
      e.__proto__ = o;
    } || function(e, o) {
      for (var n in o) Object.prototype.hasOwnProperty.call(o, n) && (e[n] = o[n]);
    }, r(i, t);
  };
  return function(i, t) {
    if (typeof t != "function" && t !== null)
      throw new TypeError("Class extends value " + String(t) + " is not a constructor or null");
    r(i, t);
    function e() {
      this.constructor = i;
    }
    i.prototype = t === null ? Object.create(t) : (e.prototype = t.prototype, new e());
  };
})(), ne = function() {
  return ne = Object.assign || function(r) {
    for (var i, t = 1, e = arguments.length; t < e; t++) {
      i = arguments[t];
      for (var o in i) Object.prototype.hasOwnProperty.call(i, o) && (r[o] = i[o]);
    }
    return r;
  }, ne.apply(this, arguments);
}, cr = {
  width: "auto",
  height: "auto"
}, xe = function(r, i, t) {
  return Math.max(Math.min(r, t), i);
}, gt = function(r, i, t) {
  var e = Math.round(r / i);
  return e * i + t * (e - 1);
}, ae = function(r, i) {
  return new RegExp(r, "i").test(i);
}, Ee = function(r) {
  return !!(r.touches && r.touches.length);
}, hr = function(r) {
  return !!((r.clientX || r.clientX === 0) && (r.clientY || r.clientY === 0));
}, vt = function(r, i, t) {
  t === void 0 && (t = 0);
  var e = i.reduce(function(n, s, a) {
    return Math.abs(s - r) < Math.abs(i[n] - r) ? a : n;
  }, 0), o = Math.abs(i[e] - r);
  return t === 0 || o < t ? i[e] : r;
}, je = function(r) {
  return r = r.toString(), r === "auto" || r.endsWith("px") || r.endsWith("%") || r.endsWith("vh") || r.endsWith("vw") || r.endsWith("vmax") || r.endsWith("vmin") ? r : "".concat(r, "px");
}, Re = function(r, i, t, e) {
  if (r && typeof r == "string") {
    if (r.endsWith("px"))
      return Number(r.replace("px", ""));
    if (r.endsWith("%")) {
      var o = Number(r.replace("%", "")) / 100;
      return i * o;
    }
    if (r.endsWith("vw")) {
      var o = Number(r.replace("vw", "")) / 100;
      return t * o;
    }
    if (r.endsWith("vh")) {
      var o = Number(r.replace("vh", "")) / 100;
      return e * o;
    }
  }
  return r;
}, dr = function(r, i, t, e, o, n, s) {
  return e = Re(e, r.width, i, t), o = Re(o, r.height, i, t), n = Re(n, r.width, i, t), s = Re(s, r.height, i, t), {
    maxWidth: typeof e > "u" ? void 0 : Number(e),
    maxHeight: typeof o > "u" ? void 0 : Number(o),
    minWidth: typeof n > "u" ? void 0 : Number(n),
    minHeight: typeof s > "u" ? void 0 : Number(s)
  };
}, pr = function(r) {
  return Array.isArray(r) ? r : [r, r];
}, gr = [
  "as",
  "ref",
  "style",
  "className",
  "grid",
  "gridGap",
  "snap",
  "bounds",
  "boundsByDirection",
  "size",
  "defaultSize",
  "minWidth",
  "minHeight",
  "maxWidth",
  "maxHeight",
  "lockAspectRatio",
  "lockAspectRatioExtraWidth",
  "lockAspectRatioExtraHeight",
  "enable",
  "handleStyles",
  "handleClasses",
  "handleWrapperStyle",
  "handleWrapperClass",
  "children",
  "onResizeStart",
  "onResize",
  "onResizeStop",
  "handleComponent",
  "scale",
  "resizeRatio",
  "snapGap"
], yt = "__resizable_base__", vr = (
  /** @class */
  (function(r) {
    fr(i, r);
    function i(t) {
      var e, o, n, s, a = r.call(this, t) || this;
      return a.ratio = 1, a.resizable = null, a.parentLeft = 0, a.parentTop = 0, a.resizableLeft = 0, a.resizableRight = 0, a.resizableTop = 0, a.resizableBottom = 0, a.targetLeft = 0, a.targetTop = 0, a.delta = {
        width: 0,
        height: 0
      }, a.appendBase = function() {
        if (!a.resizable || !a.window)
          return null;
        var b = a.parentNode;
        if (!b)
          return null;
        var c = a.window.document.createElement("div");
        return c.style.width = "100%", c.style.height = "100%", c.style.position = "absolute", c.style.transform = "scale(0, 0)", c.style.left = "0", c.style.flex = "0 0 100%", c.classList ? c.classList.add(yt) : c.className += yt, b.appendChild(c), c;
      }, a.removeBase = function(b) {
        var c = a.parentNode;
        c && c.removeChild(b);
      }, a.state = {
        isResizing: !1,
        width: (o = (e = a.propsSize) === null || e === void 0 ? void 0 : e.width) !== null && o !== void 0 ? o : "auto",
        height: (s = (n = a.propsSize) === null || n === void 0 ? void 0 : n.height) !== null && s !== void 0 ? s : "auto",
        direction: "right",
        original: {
          x: 0,
          y: 0,
          width: 0,
          height: 0
        },
        backgroundStyle: {
          height: "100%",
          width: "100%",
          backgroundColor: "rgba(0,0,0,0)",
          cursor: "auto",
          opacity: 0,
          position: "fixed",
          zIndex: 9999,
          top: "0",
          left: "0",
          bottom: "0",
          right: "0"
        },
        flexBasis: void 0
      }, a.onResizeStart = a.onResizeStart.bind(a), a.onMouseMove = a.onMouseMove.bind(a), a.onMouseUp = a.onMouseUp.bind(a), a;
    }
    return Object.defineProperty(i.prototype, "parentNode", {
      get: function() {
        return this.resizable ? this.resizable.parentNode : null;
      },
      enumerable: !1,
      configurable: !0
    }), Object.defineProperty(i.prototype, "window", {
      get: function() {
        return !this.resizable || !this.resizable.ownerDocument ? null : this.resizable.ownerDocument.defaultView;
      },
      enumerable: !1,
      configurable: !0
    }), Object.defineProperty(i.prototype, "propsSize", {
      get: function() {
        return this.props.size || this.props.defaultSize || cr;
      },
      enumerable: !1,
      configurable: !0
    }), Object.defineProperty(i.prototype, "size", {
      get: function() {
        var t = 0, e = 0;
        if (this.resizable && this.window) {
          var o = this.resizable.offsetWidth, n = this.resizable.offsetHeight, s = this.resizable.style.position;
          s !== "relative" && (this.resizable.style.position = "relative"), t = this.resizable.style.width !== "auto" ? this.resizable.offsetWidth : o, e = this.resizable.style.height !== "auto" ? this.resizable.offsetHeight : n, this.resizable.style.position = s;
        }
        return { width: t, height: e };
      },
      enumerable: !1,
      configurable: !0
    }), Object.defineProperty(i.prototype, "sizeStyle", {
      get: function() {
        var t = this, e = this.props.size, o = function(a) {
          var b;
          if (typeof t.state[a] > "u" || t.state[a] === "auto")
            return "auto";
          if (t.propsSize && t.propsSize[a] && (!((b = t.propsSize[a]) === null || b === void 0) && b.toString().endsWith("%"))) {
            if (t.state[a].toString().endsWith("%"))
              return t.state[a].toString();
            var c = t.getParentSize(), E = Number(t.state[a].toString().replace("px", "")), d = E / c[a] * 100;
            return "".concat(d, "%");
          }
          return je(t.state[a]);
        }, n = e && typeof e.width < "u" && !this.state.isResizing ? je(e.width) : o("width"), s = e && typeof e.height < "u" && !this.state.isResizing ? je(e.height) : o("height");
        return { width: n, height: s };
      },
      enumerable: !1,
      configurable: !0
    }), i.prototype.getParentSize = function() {
      if (!this.parentNode)
        return this.window ? { width: this.window.innerWidth, height: this.window.innerHeight } : { width: 0, height: 0 };
      var t = this.appendBase();
      if (!t)
        return { width: 0, height: 0 };
      var e = !1, o = this.parentNode.style.flexWrap;
      o !== "wrap" && (e = !0, this.parentNode.style.flexWrap = "wrap"), t.style.position = "relative", t.style.minWidth = "100%", t.style.minHeight = "100%";
      var n = {
        width: t.offsetWidth,
        height: t.offsetHeight
      };
      return e && (this.parentNode.style.flexWrap = o), this.removeBase(t), n;
    }, i.prototype.bindEvents = function() {
      this.window && (this.window.addEventListener("mouseup", this.onMouseUp), this.window.addEventListener("mousemove", this.onMouseMove), this.window.addEventListener("mouseleave", this.onMouseUp), this.window.addEventListener("touchmove", this.onMouseMove, {
        capture: !0,
        passive: !1
      }), this.window.addEventListener("touchend", this.onMouseUp));
    }, i.prototype.unbindEvents = function() {
      this.window && (this.window.removeEventListener("mouseup", this.onMouseUp), this.window.removeEventListener("mousemove", this.onMouseMove), this.window.removeEventListener("mouseleave", this.onMouseUp), this.window.removeEventListener("touchmove", this.onMouseMove, !0), this.window.removeEventListener("touchend", this.onMouseUp));
    }, i.prototype.componentDidMount = function() {
      if (!(!this.resizable || !this.window)) {
        var t = this.window.getComputedStyle(this.resizable);
        this.setState({
          width: this.state.width || this.size.width,
          height: this.state.height || this.size.height,
          flexBasis: t.flexBasis !== "auto" ? t.flexBasis : void 0
        });
      }
    }, i.prototype.componentWillUnmount = function() {
      this.window && this.unbindEvents();
    }, i.prototype.createSizeForCssProperty = function(t, e) {
      var o = this.propsSize && this.propsSize[e];
      return this.state[e] === "auto" && this.state.original[e] === t && (typeof o > "u" || o === "auto") ? "auto" : t;
    }, i.prototype.calculateNewMaxFromBoundary = function(t, e) {
      var o = this.props.boundsByDirection, n = this.state.direction, s = o && ae("left", n), a = o && ae("top", n), b, c;
      if (this.props.bounds === "parent") {
        var E = this.parentNode;
        E && (b = s ? this.resizableRight - this.parentLeft : E.offsetWidth + (this.parentLeft - this.resizableLeft), c = a ? this.resizableBottom - this.parentTop : E.offsetHeight + (this.parentTop - this.resizableTop));
      } else this.props.bounds === "window" ? this.window && (b = s ? this.resizableRight : this.window.innerWidth - this.resizableLeft, c = a ? this.resizableBottom : this.window.innerHeight - this.resizableTop) : this.props.bounds && (b = s ? this.resizableRight - this.targetLeft : this.props.bounds.offsetWidth + (this.targetLeft - this.resizableLeft), c = a ? this.resizableBottom - this.targetTop : this.props.bounds.offsetHeight + (this.targetTop - this.resizableTop));
      return b && Number.isFinite(b) && (t = t && t < b ? t : b), c && Number.isFinite(c) && (e = e && e < c ? e : c), { maxWidth: t, maxHeight: e };
    }, i.prototype.calculateNewSizeFromDirection = function(t, e) {
      var o = this.props.scale || 1, n = pr(this.props.resizeRatio || 1), s = n[0], a = n[1], b = this.state, c = b.direction, E = b.original, d = this.props, m = d.lockAspectRatio, w = d.lockAspectRatioExtraHeight, _ = d.lockAspectRatioExtraWidth, v = E.width, y = E.height, x = w || 0, R = _ || 0;
      return ae("right", c) && (v = E.width + (t - E.x) * s / o, m && (y = (v - R) / this.ratio + x)), ae("left", c) && (v = E.width - (t - E.x) * s / o, m && (y = (v - R) / this.ratio + x)), ae("bottom", c) && (y = E.height + (e - E.y) * a / o, m && (v = (y - x) * this.ratio + R)), ae("top", c) && (y = E.height - (e - E.y) * a / o, m && (v = (y - x) * this.ratio + R)), { newWidth: v, newHeight: y };
    }, i.prototype.calculateNewSizeFromAspectRatio = function(t, e, o, n) {
      var s = this.props, a = s.lockAspectRatio, b = s.lockAspectRatioExtraHeight, c = s.lockAspectRatioExtraWidth, E = typeof n.width > "u" ? 10 : n.width, d = typeof o.width > "u" || o.width < 0 ? t : o.width, m = typeof n.height > "u" ? 10 : n.height, w = typeof o.height > "u" || o.height < 0 ? e : o.height, _ = b || 0, v = c || 0;
      if (a) {
        var y = (m - _) * this.ratio + v, x = (w - _) * this.ratio + v, R = (E - v) / this.ratio + _, g = (d - v) / this.ratio + _, S = Math.max(E, y), f = Math.min(d, x), P = Math.max(m, R), u = Math.min(w, g);
        t = xe(t, S, f), e = xe(e, P, u);
      } else
        t = xe(t, E, d), e = xe(e, m, w);
      return { newWidth: t, newHeight: e };
    }, i.prototype.setBoundingClientRect = function() {
      var t = 1 / (this.props.scale || 1);
      if (this.props.bounds === "parent") {
        var e = this.parentNode;
        if (e) {
          var o = e.getBoundingClientRect();
          this.parentLeft = o.left * t, this.parentTop = o.top * t;
        }
      }
      if (this.props.bounds && typeof this.props.bounds != "string") {
        var n = this.props.bounds.getBoundingClientRect();
        this.targetLeft = n.left * t, this.targetTop = n.top * t;
      }
      if (this.resizable) {
        var s = this.resizable.getBoundingClientRect(), a = s.left, b = s.top, c = s.right, E = s.bottom;
        this.resizableLeft = a * t, this.resizableRight = c * t, this.resizableTop = b * t, this.resizableBottom = E * t;
      }
    }, i.prototype.onResizeStart = function(t, e) {
      if (!(!this.resizable || !this.window)) {
        var o = 0, n = 0;
        if (t.nativeEvent && hr(t.nativeEvent) ? (o = t.nativeEvent.clientX, n = t.nativeEvent.clientY) : t.nativeEvent && Ee(t.nativeEvent) && (o = t.nativeEvent.touches[0].clientX, n = t.nativeEvent.touches[0].clientY), this.props.onResizeStart && this.resizable) {
          var s = this.props.onResizeStart(t, e, this.resizable);
          if (s === !1)
            return;
        }
        this.props.size && (typeof this.props.size.height < "u" && this.props.size.height !== this.state.height && this.setState({ height: this.props.size.height }), typeof this.props.size.width < "u" && this.props.size.width !== this.state.width && this.setState({ width: this.props.size.width })), this.ratio = typeof this.props.lockAspectRatio == "number" ? this.props.lockAspectRatio : this.size.width / this.size.height;
        var a, b = this.window.getComputedStyle(this.resizable);
        if (b.flexBasis !== "auto") {
          var c = this.parentNode;
          if (c) {
            var E = this.window.getComputedStyle(c).flexDirection;
            this.flexDir = E.startsWith("row") ? "row" : "column", a = b.flexBasis;
          }
        }
        this.setBoundingClientRect(), this.bindEvents();
        var d = {
          original: {
            x: o,
            y: n,
            width: this.size.width,
            height: this.size.height
          },
          isResizing: !0,
          backgroundStyle: ne(ne({}, this.state.backgroundStyle), { cursor: this.window.getComputedStyle(t.target).cursor || "auto" }),
          direction: e,
          flexBasis: a
        };
        this.setState(d);
      }
    }, i.prototype.onMouseMove = function(t) {
      var e = this;
      if (!(!this.state.isResizing || !this.resizable || !this.window)) {
        if (this.window.TouchEvent && Ee(t))
          try {
            t.preventDefault(), t.stopPropagation();
          } catch {
          }
        var o = this.props, n = o.maxWidth, s = o.maxHeight, a = o.minWidth, b = o.minHeight, c = Ee(t) ? t.touches[0].clientX : t.clientX, E = Ee(t) ? t.touches[0].clientY : t.clientY, d = this.state, m = d.direction, w = d.original, _ = d.width, v = d.height, y = this.getParentSize(), x = dr(y, this.window.innerWidth, this.window.innerHeight, n, s, a, b);
        n = x.maxWidth, s = x.maxHeight, a = x.minWidth, b = x.minHeight;
        var R = this.calculateNewSizeFromDirection(c, E), g = R.newHeight, S = R.newWidth, f = this.calculateNewMaxFromBoundary(n, s);
        this.props.snap && this.props.snap.x && (S = vt(S, this.props.snap.x, this.props.snapGap)), this.props.snap && this.props.snap.y && (g = vt(g, this.props.snap.y, this.props.snapGap));
        var P = this.calculateNewSizeFromAspectRatio(S, g, { width: f.maxWidth, height: f.maxHeight }, { width: a, height: b });
        if (S = P.newWidth, g = P.newHeight, this.props.grid) {
          var u = gt(S, this.props.grid[0], this.props.gridGap ? this.props.gridGap[0] : 0), h = gt(g, this.props.grid[1], this.props.gridGap ? this.props.gridGap[1] : 0), T = this.props.snapGap || 0, j = T === 0 || Math.abs(u - S) <= T ? u : S, N = T === 0 || Math.abs(h - g) <= T ? h : g;
          S = j, g = N;
        }
        var W = {
          width: S - w.width,
          height: g - w.height
        };
        if (this.delta = W, _ && typeof _ == "string") {
          if (_.endsWith("%")) {
            var $ = S / y.width * 100;
            S = "".concat($, "%");
          } else if (_.endsWith("vw")) {
            var G = S / this.window.innerWidth * 100;
            S = "".concat(G, "vw");
          } else if (_.endsWith("vh")) {
            var J = S / this.window.innerHeight * 100;
            S = "".concat(J, "vh");
          }
        }
        if (v && typeof v == "string") {
          if (v.endsWith("%")) {
            var $ = g / y.height * 100;
            g = "".concat($, "%");
          } else if (v.endsWith("vw")) {
            var G = g / this.window.innerWidth * 100;
            g = "".concat(G, "vw");
          } else if (v.endsWith("vh")) {
            var J = g / this.window.innerHeight * 100;
            g = "".concat(J, "vh");
          }
        }
        var I = {
          width: this.createSizeForCssProperty(S, "width"),
          height: this.createSizeForCssProperty(g, "height")
        };
        this.flexDir === "row" ? I.flexBasis = I.width : this.flexDir === "column" && (I.flexBasis = I.height);
        var A = this.state.width !== I.width, H = this.state.height !== I.height, V = this.state.flexBasis !== I.flexBasis, p = A || H || V;
        p && St(function() {
          e.setState(I);
        }), this.props.onResize && p && this.props.onResize(t, m, this.resizable, W);
      }
    }, i.prototype.onMouseUp = function(t) {
      var e, o, n = this.state, s = n.isResizing, a = n.direction;
      n.original, !(!s || !this.resizable) && (this.props.onResizeStop && this.props.onResizeStop(t, a, this.resizable, this.delta), this.props.size && this.setState({ width: (e = this.props.size.width) !== null && e !== void 0 ? e : "auto", height: (o = this.props.size.height) !== null && o !== void 0 ? o : "auto" }), this.unbindEvents(), this.setState({
        isResizing: !1,
        backgroundStyle: ne(ne({}, this.state.backgroundStyle), { cursor: "auto" })
      }));
    }, i.prototype.updateSize = function(t) {
      var e, o;
      this.setState({ width: (e = t.width) !== null && e !== void 0 ? e : "auto", height: (o = t.height) !== null && o !== void 0 ? o : "auto" });
    }, i.prototype.renderResizer = function() {
      var t = this, e = this.props, o = e.enable, n = e.handleStyles, s = e.handleClasses, a = e.handleWrapperStyle, b = e.handleWrapperClass, c = e.handleComponent;
      if (!o)
        return null;
      var E = Object.keys(o).map(function(d) {
        return o[d] !== !1 ? F.jsx(ur, { direction: d, onResizeStart: t.onResizeStart, replaceStyles: n && n[d], className: s && s[d], children: c && c[d] ? c[d] : null }, d) : null;
      });
      return F.jsx("div", { className: b, style: a, children: E });
    }, i.prototype.render = function() {
      var t = this, e = Object.keys(this.props).reduce(function(s, a) {
        return gr.indexOf(a) !== -1 || (s[a] = t.props[a]), s;
      }, {}), o = ne(ne(ne({ position: "relative", userSelect: this.state.isResizing ? "none" : "auto" }, this.props.style), this.sizeStyle), { maxWidth: this.props.maxWidth, maxHeight: this.props.maxHeight, minWidth: this.props.minWidth, minHeight: this.props.minHeight, boxSizing: "border-box", flexShrink: 0 });
      this.state.flexBasis && (o.flexBasis = this.state.flexBasis);
      var n = this.props.as || "div";
      return F.jsxs(n, ne({ style: o, className: this.props.className }, e, {
        // `ref` is after `extendsProps` to ensure this one wins over a version
        // passed in
        ref: function(s) {
          s && (t.resizable = s);
        },
        children: [this.state.isResizing && F.jsx("div", { style: this.state.backgroundStyle }), this.props.children, this.renderResizer()]
      }));
    }, i.defaultProps = {
      as: "div",
      onResizeStart: function() {
      },
      onResize: function() {
      },
      onResizeStop: function() {
      },
      enable: {
        top: !0,
        right: !0,
        bottom: !0,
        left: !0,
        topRight: !0,
        bottomRight: !0,
        bottomLeft: !0,
        topLeft: !0
      },
      style: {},
      grid: [1, 1],
      gridGap: [0, 0],
      lockAspectRatio: !1,
      lockAspectRatioExtraWidth: 0,
      lockAspectRatioExtraHeight: 0,
      scale: 1,
      resizeRatio: 1,
      snapGap: 0
    }, i;
  })(bt)
);
var We = function(r, i) {
  return We = Object.setPrototypeOf || { __proto__: [] } instanceof Array && function(t, e) {
    t.__proto__ = e;
  } || function(t, e) {
    for (var o in e) e.hasOwnProperty(o) && (t[o] = e[o]);
  }, We(r, i);
};
function yr(r, i) {
  We(r, i);
  function t() {
    this.constructor = r;
  }
  r.prototype = i === null ? Object.create(i) : (t.prototype = i.prototype, new t());
}
var Q = function() {
  return Q = Object.assign || function(i) {
    for (var t, e = 1, o = arguments.length; e < o; e++) {
      t = arguments[e];
      for (var n in t) Object.prototype.hasOwnProperty.call(t, n) && (i[n] = t[n]);
    }
    return i;
  }, Q.apply(this, arguments);
};
function mr(r, i) {
  var t = {};
  for (var e in r) Object.prototype.hasOwnProperty.call(r, e) && i.indexOf(e) < 0 && (t[e] = r[e]);
  if (r != null && typeof Object.getOwnPropertySymbols == "function")
    for (var o = 0, e = Object.getOwnPropertySymbols(r); o < e.length; o++)
      i.indexOf(e[o]) < 0 && Object.prototype.propertyIsEnumerable.call(r, e[o]) && (t[e[o]] = r[e[o]]);
  return t;
}
var br = {
  width: "auto",
  height: "auto",
  display: "inline-block",
  position: "absolute",
  top: 0,
  left: 0
}, wr = function(r) {
  return {
    bottom: r,
    bottomLeft: r,
    bottomRight: r,
    left: r,
    right: r,
    top: r,
    topLeft: r,
    topRight: r
  };
}, Sr = (
  /** @class */
  (function(r) {
    yr(i, r);
    function i(t) {
      var e = r.call(this, t) || this;
      return e.resizingPosition = { x: 0, y: 0 }, e.offsetFromParent = { left: 0, top: 0 }, e.resizableElement = { current: null }, e.originalPosition = { x: 0, y: 0 }, e.state = {
        resizing: !1,
        bounds: {
          top: 0,
          right: 0,
          bottom: 0,
          left: 0
        },
        maxWidth: t.maxWidth,
        maxHeight: t.maxHeight
      }, e.onResizeStart = e.onResizeStart.bind(e), e.onResize = e.onResize.bind(e), e.onResizeStop = e.onResizeStop.bind(e), e.onDragStart = e.onDragStart.bind(e), e.onDrag = e.onDrag.bind(e), e.onDragStop = e.onDragStop.bind(e), e.getMaxSizesFromProps = e.getMaxSizesFromProps.bind(e), e;
    }
    return i.prototype.componentDidMount = function() {
      this.updateOffsetFromParent();
      var t = this.offsetFromParent, e = t.left, o = t.top, n = this.getDraggablePosition(), s = n.x, a = n.y;
      this.draggable.setState({
        x: s - e,
        y: a - o
      }), this.forceUpdate();
    }, i.prototype.getDraggablePosition = function() {
      var t = this.draggable.state, e = t.x, o = t.y;
      return { x: e, y: o };
    }, i.prototype.getParent = function() {
      return this.resizable && this.resizable.parentNode;
    }, i.prototype.getParentSize = function() {
      return this.resizable.getParentSize();
    }, i.prototype.getMaxSizesFromProps = function() {
      var t = typeof this.props.maxWidth > "u" ? Number.MAX_SAFE_INTEGER : this.props.maxWidth, e = typeof this.props.maxHeight > "u" ? Number.MAX_SAFE_INTEGER : this.props.maxHeight;
      return { maxWidth: t, maxHeight: e };
    }, i.prototype.getSelfElement = function() {
      return this.resizable && this.resizable.resizable;
    }, i.prototype.getOffsetHeight = function(t) {
      var e = this.props.scale;
      switch (this.props.bounds) {
        case "window":
          return window.innerHeight / e;
        case "body":
          return document.body.offsetHeight / e;
        default:
          return t.offsetHeight;
      }
    }, i.prototype.getOffsetWidth = function(t) {
      var e = this.props.scale;
      switch (this.props.bounds) {
        case "window":
          return window.innerWidth / e;
        case "body":
          return document.body.offsetWidth / e;
        default:
          return t.offsetWidth;
      }
    }, i.prototype.onDragStart = function(t, e) {
      if (this.props.onDragStart && this.props.onDragStart(t, e) === !1)
        return !1;
      var o = this.getDraggablePosition();
      if (this.originalPosition = o, !!this.props.bounds) {
        var n = this.getParent(), s = this.props.scale, a;
        if (this.props.bounds === "parent")
          a = n;
        else if (this.props.bounds === "body") {
          var b = n.getBoundingClientRect(), c = b.left, E = b.top, d = document.body.getBoundingClientRect(), m = -(c - n.offsetLeft * s - d.left) / s, w = -(E - n.offsetTop * s - d.top) / s, _ = (document.body.offsetWidth - this.resizable.size.width * s) / s + m, v = (document.body.offsetHeight - this.resizable.size.height * s) / s + w;
          return this.setState({ bounds: { top: w, right: _, bottom: v, left: m } });
        } else if (this.props.bounds === "window") {
          if (!this.resizable)
            return;
          var y = n.getBoundingClientRect(), x = y.left, R = y.top, g = -(x - n.offsetLeft * s) / s, S = -(R - n.offsetTop * s) / s, _ = (window.innerWidth - this.resizable.size.width * s) / s + g, v = (window.innerHeight - this.resizable.size.height * s) / s + S;
          return this.setState({ bounds: { top: S, right: _, bottom: v, left: g } });
        } else typeof this.props.bounds == "string" ? a = document.querySelector(this.props.bounds) : this.props.bounds instanceof HTMLElement && (a = this.props.bounds);
        if (!(!(a instanceof HTMLElement) || !(n instanceof HTMLElement))) {
          var f = a.getBoundingClientRect(), P = f.left, u = f.top, h = n.getBoundingClientRect(), T = h.left, j = h.top, N = (P - T) / s, W = u - j;
          if (this.resizable) {
            this.updateOffsetFromParent();
            var $ = this.offsetFromParent;
            this.setState({
              bounds: {
                top: W - $.top,
                right: N + (a.offsetWidth - this.resizable.size.width) - $.left / s,
                bottom: W + (a.offsetHeight - this.resizable.size.height) - $.top,
                left: N - $.left / s
              }
            });
          }
        }
      }
    }, i.prototype.onDrag = function(t, e) {
      if (this.props.onDrag) {
        var o = this.offsetFromParent, n = o.left, s = o.top;
        if (!this.props.dragAxis || this.props.dragAxis === "both")
          return this.props.onDrag(t, Q(Q({}, e), { x: e.x + n, y: e.y + s }));
        if (this.props.dragAxis === "x")
          return this.props.onDrag(t, Q(Q({}, e), { x: e.x + n, y: this.originalPosition.y + s, deltaY: 0 }));
        if (this.props.dragAxis === "y")
          return this.props.onDrag(t, Q(Q({}, e), { x: this.originalPosition.x + n, y: e.y + s, deltaX: 0 }));
      }
    }, i.prototype.onDragStop = function(t, e) {
      if (this.props.onDragStop) {
        var o = this.offsetFromParent, n = o.left, s = o.top;
        if (!this.props.dragAxis || this.props.dragAxis === "both")
          return this.props.onDragStop(t, Q(Q({}, e), { x: e.x + n, y: e.y + s }));
        if (this.props.dragAxis === "x")
          return this.props.onDragStop(t, Q(Q({}, e), { x: e.x + n, y: this.originalPosition.y + s, deltaY: 0 }));
        if (this.props.dragAxis === "y")
          return this.props.onDragStop(t, Q(Q({}, e), { x: this.originalPosition.x + n, y: e.y + s, deltaX: 0 }));
      }
    }, i.prototype.onResizeStart = function(t, e, o) {
      if (this.props.onResizeStart && this.props.onResizeStart(t, e, o) === !1)
        return !1;
      t.stopPropagation(), this.setState({
        resizing: !0
      });
      var n = this.props.scale, s = this.offsetFromParent, a = this.getDraggablePosition();
      if (this.resizingPosition = { x: a.x + s.left, y: a.y + s.top }, this.originalPosition = a, this.props.bounds) {
        var b = this.getParent(), c = void 0;
        this.props.bounds === "parent" ? c = b : this.props.bounds === "body" ? c = document.body : this.props.bounds === "window" ? c = window : typeof this.props.bounds == "string" ? c = document.querySelector(this.props.bounds) : this.props.bounds instanceof HTMLElement && (c = this.props.bounds);
        var E = this.getSelfElement();
        if (E instanceof Element && (c instanceof HTMLElement || c === window) && b instanceof HTMLElement) {
          var d = this.getMaxSizesFromProps(), m = d.maxWidth, w = d.maxHeight, _ = this.getParentSize();
          if (m && typeof m == "string")
            if (m.endsWith("%")) {
              var v = Number(m.replace("%", "")) / 100;
              m = _.width * v;
            } else m.endsWith("px") && (m = Number(m.replace("px", "")));
          if (w && typeof w == "string")
            if (w.endsWith("%")) {
              var v = Number(w.replace("%", "")) / 100;
              w = _.height * v;
            } else w.endsWith("px") && (w = Number(w.replace("px", "")));
          var y = E.getBoundingClientRect(), x = y.left, R = y.top, g = this.props.bounds === "window" ? { left: 0, top: 0 } : c.getBoundingClientRect(), S = g.left, f = g.top, P = this.getOffsetWidth(c), u = this.getOffsetHeight(c), h = e.toLowerCase().endsWith("left"), T = e.toLowerCase().endsWith("right"), j = e.startsWith("top"), N = e.startsWith("bottom");
          if ((h || j) && this.resizable) {
            var W = (x - S) / n + this.resizable.size.width;
            this.setState({ maxWidth: W > Number(m) ? m : W });
          }
          if (T || this.props.lockAspectRatio && !h && !j) {
            var W = P + (S - x) / n;
            this.setState({ maxWidth: W > Number(m) ? m : W });
          }
          if ((j || h) && this.resizable) {
            var W = (R - f) / n + this.resizable.size.height;
            this.setState({
              maxHeight: W > Number(w) ? w : W
            });
          }
          if (N || this.props.lockAspectRatio && !j && !h) {
            var W = u + (f - R) / n;
            this.setState({
              maxHeight: W > Number(w) ? w : W
            });
          }
        }
      } else
        this.setState({
          maxWidth: this.props.maxWidth,
          maxHeight: this.props.maxHeight
        });
    }, i.prototype.onResize = function(t, e, o, n) {
      var s = this, a = { x: this.originalPosition.x, y: this.originalPosition.y }, b = -n.width, c = -n.height, E = ["top", "left", "topLeft", "bottomLeft", "topRight"];
      E.includes(e) && (e === "bottomLeft" ? a.x += b : (e === "topRight" || (a.x += b), a.y += c));
      var d = this.draggable.state;
      (a.x !== d.x || a.y !== d.y) && St(function() {
        s.draggable.setState(a);
      }), this.updateOffsetFromParent();
      var m = this.offsetFromParent, w = this.getDraggablePosition().x + m.left, _ = this.getDraggablePosition().y + m.top;
      this.resizingPosition = { x: w, y: _ }, this.props.onResize && this.props.onResize(t, e, o, n, {
        x: w,
        y: _
      });
    }, i.prototype.onResizeStop = function(t, e, o, n) {
      this.setState({
        resizing: !1
      });
      var s = this.getMaxSizesFromProps(), a = s.maxWidth, b = s.maxHeight;
      this.setState({ maxWidth: a, maxHeight: b }), this.props.onResizeStop && this.props.onResizeStop(t, e, o, n, this.resizingPosition);
    }, i.prototype.updateSize = function(t) {
      this.resizable && this.resizable.updateSize({ width: t.width, height: t.height });
    }, i.prototype.updatePosition = function(t) {
      this.draggable.setState(t);
    }, i.prototype.updateOffsetFromParent = function() {
      var t = this.props.scale, e = this.getParent(), o = this.getSelfElement();
      if (!e || o === null)
        return {
          top: 0,
          left: 0
        };
      var n = e.getBoundingClientRect(), s = n.left, a = n.top, b = o.getBoundingClientRect(), c = this.getDraggablePosition(), E = e.scrollLeft, d = e.scrollTop;
      this.offsetFromParent = {
        left: b.left - s + E - c.x * t,
        top: b.top - a + d - c.y * t
      };
    }, i.prototype.render = function() {
      var t = this, e = this.props, o = e.disableDragging, n = e.style, s = e.dragHandleClassName, a = e.position, b = e.onMouseDown, c = e.onMouseUp, E = e.dragAxis, d = e.dragGrid, m = e.bounds, w = e.enableUserSelectHack, _ = e.cancel, v = e.children;
      e.onResizeStart, e.onResize, e.onResizeStop, e.onDragStart, e.onDrag, e.onDragStop;
      var y = e.resizeHandleStyles, x = e.resizeHandleClasses, R = e.resizeHandleComponent, g = e.enableResizing, S = e.resizeGrid, f = e.resizeHandleWrapperClass, P = e.resizeHandleWrapperStyle, u = e.scale, h = e.allowAnyClick, T = e.dragPositionOffset, j = mr(e, ["disableDragging", "style", "dragHandleClassName", "position", "onMouseDown", "onMouseUp", "dragAxis", "dragGrid", "bounds", "enableUserSelectHack", "cancel", "children", "onResizeStart", "onResize", "onResizeStop", "onDragStart", "onDrag", "onDragStop", "resizeHandleStyles", "resizeHandleClasses", "resizeHandleComponent", "enableResizing", "resizeGrid", "resizeHandleWrapperClass", "resizeHandleWrapperStyle", "scale", "allowAnyClick", "dragPositionOffset"]), N = this.props.default ? Q({}, this.props.default) : void 0;
      delete j.default;
      var W = o || s ? { cursor: "auto" } : { cursor: "move" }, $ = Q(Q(Q({}, br), W), n), G = this.offsetFromParent, J = G.left, I = G.top, A;
      a && (A = {
        x: a.x - J,
        y: a.y - I
      });
      var H = this.state.resizing ? void 0 : A, V = this.state.resizing ? "both" : E;
      return Ie(
        ar,
        {
          ref: function(p) {
            p && (t.draggable = p);
          },
          handle: s ? ".".concat(s) : void 0,
          defaultPosition: N,
          onMouseDown: b,
          // @ts-expect-error
          onMouseUp: c,
          onStart: this.onDragStart,
          onDrag: this.onDrag,
          onStop: this.onDragStop,
          axis: V,
          disabled: o,
          grid: d,
          bounds: m ? this.state.bounds : void 0,
          position: H,
          enableUserSelectHack: w,
          cancel: _,
          scale: u,
          allowAnyClick: h,
          nodeRef: this.resizableElement,
          positionOffset: T
        },
        Ie(vr, Q({}, j, { ref: function(p) {
          p && (t.resizable = p, t.resizableElement.current = p.resizable);
        }, defaultSize: N, size: this.props.size, enable: typeof g == "boolean" ? wr(g) : g, onResizeStart: this.onResizeStart, onResize: this.onResize, onResizeStop: this.onResizeStop, style: $, minWidth: this.props.minWidth, minHeight: this.props.minHeight, maxWidth: this.state.resizing ? this.state.maxWidth : this.props.maxWidth, maxHeight: this.state.resizing ? this.state.maxHeight : this.props.maxHeight, grid: S, handleWrapperClass: f, handleWrapperStyle: P, lockAspectRatio: this.props.lockAspectRatio, lockAspectRatioExtraWidth: this.props.lockAspectRatioExtraWidth, lockAspectRatioExtraHeight: this.props.lockAspectRatioExtraHeight, handleStyles: y, handleClasses: x, handleComponent: R, scale: this.props.scale }), v)
      );
    }, i.defaultProps = {
      maxWidth: Number.MAX_SAFE_INTEGER,
      maxHeight: Number.MAX_SAFE_INTEGER,
      scale: 1,
      onResizeStart: function() {
      },
      onResize: function() {
      },
      onResizeStop: function() {
      },
      onDragStart: function() {
      },
      onDrag: function() {
      },
      onDragStop: function() {
      }
    }, i;
  })(bt)
);
function xr(r) {
  if (r == null) return "";
  const i = String(r);
  return i.includes(",") || i.includes('"') || i.includes(`
`) ? `"${i.replace(/"/g, '""')}"` : i;
}
function Pt(r) {
  if (r.length === 0) return "";
  const i = Object.keys(r[0]), t = [];
  t.push(i.join(","));
  for (const e of r) {
    const o = i.map((n) => xr(e[n]));
    t.push(o.join(","));
  }
  return t.join(`
`);
}
function zt(r, i, t) {
  const e = new Blob([r], { type: t }), o = URL.createObjectURL(e), n = document.createElement("a");
  n.setAttribute("href", o), n.setAttribute("download", i), n.style.visibility = "hidden", document.body.appendChild(n), n.click(), document.body.removeChild(n);
}
function Er(r, i) {
  const t = Pt(r);
  zt(t, i.endsWith(".csv") ? i : `${i}.csv`, "text/csv;charset=utf-8;");
}
function Rr(r, i) {
  const t = JSON.stringify(r, null, 2);
  zt(t, i.endsWith(".json") ? i : `${i}.json`, "application/json;charset=utf-8;");
}
function _r(r) {
  const i = document.createElement("textarea");
  i.value = r, i.style.position = "fixed", i.style.left = "-9999px", i.style.top = "0", i.style.width = "2em", i.style.height = "2em", i.style.padding = "0", i.style.border = "none", i.style.outline = "none", i.style.boxShadow = "none", i.style.background = "transparent", i.style.fontSize = "16px", document.body.appendChild(i), i.focus(), i.select();
  try {
    const t = document.execCommand("copy");
    return document.body.removeChild(i), t;
  } catch (t) {
    console.error("execCommand copy failed:", t);
    try {
      document.body.removeChild(i);
    } catch {
    }
    return !1;
  }
}
async function Tr(r) {
  if (navigator.clipboard && window.isSecureContext)
    try {
      return await navigator.clipboard.writeText(r), !0;
    } catch (i) {
      console.warn("Modern clipboard API failed, falling back to legacy method.", i);
    }
  return _r(r);
}
function Nr(r) {
  if (Array.isArray(r) && r.length > 0 && typeof r[0] == "object" && r[0] !== null) {
    const i = r[0];
    if (Object.values(i).every((e) => e === null || typeof e != "object"))
      return Pt(r);
  }
  return JSON.stringify(r, null, 2);
}
function Wr(r, i) {
  const t = (/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-").slice(0, 19), e = `${i}_${t}`;
  if (Array.isArray(r) && r.length > 0 && typeof r[0] == "object" && r[0] !== null) {
    const o = r[0];
    if (Object.values(o).every((s) => s === null || typeof s != "object")) {
      Er(r, e);
      return;
    }
  }
  Rr(r, e);
}
function Pr({
  isOpen: r,
  onClose: i,
  onMinimize: t,
  isMinimized: e,
  title: o,
  storageKey: n,
  zIndex: s = 2500,
  // Higher default to stay above overlays
  filterContent: a,
  onExport: b,
  onCopy: c,
  children: E,
  loading: d = !1,
  onFocus: m,
  layoutMode: w = "floating",
  initialWidth: _,
  initialHeight: v,
  contentStyle: y
}) {
  const [x, R] = de(!1), [g, S] = de(!1), [f, P] = de(!1), u = Ye(null), [h, T] = de(() => {
    const A = localStorage.getItem(n);
    if (A) {
      try {
        const H = JSON.parse(A), V = Ae(H), p = Math.abs(V.x - H.x) > 50 || Math.abs(V.y - (H.y ?? 0)) > 50, l = typeof V.width == "number" && V.width < 100 || typeof V.height == "number" && V.height < 100;
        if (!p && !l) return V;
      } catch (H) {
        console.error(`Failed to parse saved ${n}`, H);
      }
      localStorage.removeItem(n);
    }
    return zr(_, v);
  }), j = Ye(null), N = Ne(() => {
    T((A) => {
      const H = Ae(A);
      return H.x === A.x && H.y === A.y && H.width === A.width && H.height === A.height ? A : H;
    });
  }, []);
  $t("resize", N);
  const W = Bt((A) => {
    localStorage.setItem(n, JSON.stringify(A));
  }, 500), $ = (A) => {
    const H = Ae({ ...h, ...A });
    T(H), W(H), f && (P(!1), u.current = null);
  }, G = () => {
    if (f && u.current) {
      const A = u.current;
      u.current = null, P(!1), T(A), W(A);
    } else {
      u.current = h;
      const A = window.innerWidth, H = window.innerHeight, V = H < 600 ? 40 : 80, p = 10, l = {
        x: p,
        y: V + p,
        width: A - p * 2,
        height: H - V - p * 2
      };
      P(!0), T(l), W(l);
    }
  }, J = () => {
    if (c)
      try {
        const A = c();
        if (!A) return;
        Tr(A).then((H) => {
          H && (S(!0), setTimeout(() => S(!1), 2e3));
        });
      } catch (A) {
        console.error("Failed to copy analysis data:", A);
      }
  }, I = /* @__PURE__ */ F.jsxs(
    Dt,
    {
      withBorder: !0,
      onMouseDown: (A) => {
        A.target.closest('button, input, select, textarea, [role="button"], [role="menuitem"]') || m?.();
      },
      style: {
        width: "100%",
        height: w === "grid" ? "450px" : "100%",
        background: "rgba(28, 29, 33, 0.99)",
        // More opaque to look like a solid box
        border: "1px solid rgba(255, 255, 255, 0.15)",
        boxShadow: "0 12px 40px rgba(0, 0, 0, 0.6)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        position: "relative"
      },
      children: [
        /* @__PURE__ */ F.jsxs(
          pe,
          {
            px: "md",
            py: "xs",
            className: "analysis-window-header",
            style: {
              borderBottom: "1px solid rgba(255,255,255,0.1)",
              display: "flex",
              flexDirection: "column",
              flexShrink: 0,
              userSelect: "none"
            },
            children: [
              /* @__PURE__ */ F.jsxs($e, { justify: "space-between", align: "center", wrap: "nowrap", children: [
                /* @__PURE__ */ F.jsx(
                  pe,
                  {
                    className: w === "floating" ? "analysis-window-handle" : "",
                    style: { cursor: w === "floating" ? "grab" : "default", flex: 1, minWidth: 0 },
                    children: /* @__PURE__ */ F.jsx(
                      Ot,
                      {
                        order: 5,
                        style: {
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          fontSize: window.innerWidth < 600 ? "14px" : void 0
                        },
                        children: o
                      }
                    )
                  }
                ),
                /* @__PURE__ */ F.jsxs($e, { wrap: "nowrap", gap: "xs", style: { flexShrink: 0 }, children: [
                  a && /* @__PURE__ */ F.jsx(
                    Mt,
                    {
                      variant: "subtle",
                      size: "xs",
                      color: "gray",
                      leftSection: /* @__PURE__ */ F.jsx(Be, { size: 14 }),
                      visibleFrom: "xs",
                      rightSection: x ? /* @__PURE__ */ F.jsx(At, { size: 14 }) : /* @__PURE__ */ F.jsx(Nt, { size: 14 }),
                      onClick: () => R(!x),
                      children: "Filters"
                    }
                  ),
                  a && /* @__PURE__ */ F.jsx(se, { variant: "subtle", hiddenFrom: "xs", onClick: () => R(!x), children: /* @__PURE__ */ F.jsx(Be, { size: 16 }) }),
                  c && /* @__PURE__ */ F.jsx(ge, { label: g ? "Copied!" : "Copy to Clipboard", withArrow: !0, position: "bottom", children: /* @__PURE__ */ F.jsx(
                    se,
                    {
                      variant: "subtle",
                      onClick: J,
                      color: g ? "green" : "gray",
                      children: g ? /* @__PURE__ */ F.jsx(Wt, { size: 16 }) : /* @__PURE__ */ F.jsx(kt, { size: 16 })
                    }
                  ) }),
                  b && /* @__PURE__ */ F.jsx(ge, { label: "Download JSON/CSV", withArrow: !0, position: "bottom", withinPortal: !0, zIndex: s + 100, children: /* @__PURE__ */ F.jsx(se, { variant: "subtle", onClick: b, children: /* @__PURE__ */ F.jsx(Ht, { size: 16 }) }) }),
                  w === "floating" && /* @__PURE__ */ F.jsx(ge, { label: f ? "Restore" : "Maximize", withArrow: !0, position: "bottom", withinPortal: !0, zIndex: s + 100, children: /* @__PURE__ */ F.jsx(se, { variant: f ? "filled" : "subtle", color: f ? "blue" : "gray", onClick: G, children: /* @__PURE__ */ F.jsx(Lt, { size: 16 }) }) }),
                  t && /* @__PURE__ */ F.jsx(ge, { label: e ? "Unpin (Expand)" : "Pin (Collapse)", withArrow: !0, position: "bottom", withinPortal: !0, zIndex: s + 100, children: /* @__PURE__ */ F.jsx(
                    se,
                    {
                      variant: e ? "filled" : "subtle",
                      onClick: t,
                      color: e ? "blue" : "gray",
                      children: e ? /* @__PURE__ */ F.jsx(Ft, { size: 16 }) : /* @__PURE__ */ F.jsx(It, { size: 16 })
                    }
                  ) }),
                  /* @__PURE__ */ F.jsx(se, { variant: "subtle", onClick: i, title: "Close", color: "gray", children: /* @__PURE__ */ F.jsx(Yt, { size: 16 }) })
                ] })
              ] }),
              a && /* @__PURE__ */ F.jsx(jt, { in: x, children: /* @__PURE__ */ F.jsx(pe, { mt: "md", mb: "xs", children: a }) })
            ]
          }
        ),
        !e && /* @__PURE__ */ F.jsx(
          pe,
          {
            className: "analysis-window-content",
            style: {
              flex: 1,
              position: "relative",
              width: "100%",
              overflow: "auto",
              padding: "10px",
              minHeight: d ? 200 : 100,
              ...y
            },
            children: E
          }
        )
      ]
    }
  );
  return r ? w === "grid" ? I : /* @__PURE__ */ F.jsx(
    Sr,
    {
      ref: j,
      size: {
        width: h.width,
        height: e ? "auto" : h.height
      },
      position: { x: h.x, y: h.y },
      onDrag: (A, H) => $({ x: H.x, y: H.y }),
      onResize: (A, H, V, p, l) => {
        e || $({
          width: V.offsetWidth,
          height: V.offsetHeight,
          ...l
        });
      },
      minWidth: 300,
      minHeight: e ? 0 : 200,
      bounds: "parent",
      dragHandleClassName: "analysis-window-handle",
      enableResizing: e ? !1 : {
        top: !0,
        right: !0,
        bottom: !0,
        left: !0,
        topRight: !0,
        bottomRight: !0,
        bottomLeft: !0,
        topLeft: !0
      },
      style: {
        zIndex: s,
        pointerEvents: e ? "none" : "auto"
      },
      children: /* @__PURE__ */ F.jsx("div", { style: { pointerEvents: "auto", width: "100%", height: "100%" }, children: I })
    }
  ) : null;
}
function zr(r, i) {
  const t = window.innerWidth, e = window.innerHeight, o = e < 600 ? 50 : 100;
  let n;
  r !== void 0 ? n = typeof r == "number" ? r : parseInt(r.toString()) : n = Math.min(900, t - 40), n = Math.min(n, t - 40);
  let s;
  return i !== void 0 ? s = typeof i == "number" ? i : parseInt(i.toString()) : s = Math.min(e - o - 40, 700), s = Math.min(s, e - o - 40), {
    x: Math.max(20, (t - n) / 2),
    y: Math.max(o + 20, (e - s) / 2 + 50),
    width: n,
    height: s
  };
}
function Ae(r) {
  const i = window.innerWidth, t = window.innerHeight, e = t < 600 ? 40 : 80, o = i - 20;
  let n;
  typeof r.width == "number" ? n = Math.min(r.width, o) : r.width === "auto" ? n = Math.min(800, o) : n = Math.min(parseInt(r.width) || 800, o), n = Math.max(300, n);
  const s = t - e - 20;
  let a;
  r.height === "auto" ? a = Math.min(600, s) : typeof r.height == "number" ? a = Math.min(r.height, s) : a = Math.min(parseInt(r.height) || 400, s), typeof a == "number" && (a = Math.max(200, a));
  const b = Math.max(10, i - n - 10), c = Math.max(10, Math.min(r.x, b)), E = typeof a == "number" ? a : 400, d = Math.max(e + 10, t - E - 10), m = Math.max(e + 10, Math.min(r.y, d));
  return { x: c, y: m, width: n, height: a };
}
const kr = mt(Pr);
export {
  kr as A,
  Wr as a,
  Ut as b,
  Nr as g,
  F as j
};
