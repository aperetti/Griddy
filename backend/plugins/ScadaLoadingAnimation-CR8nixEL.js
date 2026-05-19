import { j as e } from "./AnalysisWindow-DCpKwrtw.js";
import { useState as d, useEffect as g } from "react";
import { Box as n, Stack as a, Group as i, Text as t } from "@mantine/core";
import { Activity as f, Cpu as x, Radio as m, Zap as u } from "lucide-react";
const r = [
  "Energizing cap banks...",
  "Pinging AMI meters...",
  "Unifying phase angles...",
  "Verifying relay coordination...",
  "Measuring grid inertia...",
  "Calculating power flows...",
  "Tuning PID controllers...",
  "Inspecting transformers...",
  "Balancing three-phase loads...",
  "Polling SCADA RTUs..."
];
function k({ estimatedRows: s }) {
  const [o, l] = d(0);
  return g(() => {
    const c = setInterval(() => {
      l((p) => (p + 1) % r.length);
    }, 1500);
    return () => clearInterval(c);
  }, []), /* @__PURE__ */ e.jsx(n, { style: { display: "flex", alignItems: "center", justifyContent: "center", height: "100%", width: "100%" }, children: /* @__PURE__ */ e.jsxs(a, { align: "center", gap: "md", children: [
    /* @__PURE__ */ e.jsxs(n, { style: { position: "relative", width: "120px", height: "120px" }, children: [
      /* @__PURE__ */ e.jsx(
        n,
        {
          style: {
            position: "absolute",
            inset: 0,
            backgroundImage: "linear-gradient(rgba(51, 154, 240, 0.2) 1px, transparent 1px), linear-gradient(90deg, rgba(51, 154, 240, 0.2) 1px, transparent 1px)",
            backgroundSize: "20px 20px",
            backgroundPosition: "center center",
            border: "1px solid rgba(51, 154, 240, 0.3)",
            borderRadius: "8px",
            overflow: "hidden"
          },
          children: /* @__PURE__ */ e.jsx(
            n,
            {
              style: {
                position: "absolute",
                top: 0,
                bottom: 0,
                left: "-100%",
                width: "50%",
                background: "linear-gradient(90deg, transparent, rgba(51, 154, 240, 0.5), transparent)",
                animation: "scan 2.5s infinite linear"
              }
            }
          )
        }
      ),
      /* @__PURE__ */ e.jsx(i, { style: { position: "relative", width: "100%", height: "100%" }, justify: "center", align: "center", children: /* @__PURE__ */ e.jsxs(a, { gap: "sm", align: "center", children: [
        /* @__PURE__ */ e.jsxs(i, { gap: "sm", justify: "center", children: [
          /* @__PURE__ */ e.jsx(f, { size: 24, color: "#339af0", style: { animation: "pulse 2s infinite ease-in-out" } }),
          /* @__PURE__ */ e.jsx(x, { size: 24, color: "#339af0", style: { animation: "pulse 2s infinite ease-in-out 0.5s" } })
        ] }),
        /* @__PURE__ */ e.jsxs(i, { gap: "sm", justify: "center", children: [
          /* @__PURE__ */ e.jsx(m, { size: 24, color: "#339af0", style: { animation: "pulse 2s infinite ease-in-out 1s" } }),
          /* @__PURE__ */ e.jsx(u, { size: 24, color: "#339af0", style: { animation: "pulse 2s infinite ease-in-out 1.5s" } })
        ] })
      ] }) })
    ] }),
    /* @__PURE__ */ e.jsxs(i, { gap: 0, children: [
      /* @__PURE__ */ e.jsx(
        t,
        {
          size: "sm",
          c: "blue.4",
          ff: "monospace",
          fw: 600,
          style: {
            textAlign: "center",
            minWidth: "240px",
            textTransform: "uppercase",
            letterSpacing: "1px"
          },
          children: r[o]
        }
      ),
      /* @__PURE__ */ e.jsx(
        t,
        {
          size: "sm",
          c: "blue.4",
          ff: "monospace",
          style: { animation: "blink 1s step-end infinite" },
          children: "_"
        }
      )
    ] }),
    s !== void 0 && s > 0 && /* @__PURE__ */ e.jsxs(t, { size: "xs", c: "dimmed", ff: "monospace", mt: -10, children: [
      "Querying ~",
      s.toLocaleString(),
      " reads..."
    ] }),
    /* @__PURE__ */ e.jsx("style", { children: `
                    @keyframes blink {
                        0%, 100% { opacity: 1; }
                        50% { opacity: 0; }
                    }
                    @keyframes pulse {
                        0%, 100% { opacity: 0.3; transform: scale(0.95); }
                        50% { opacity: 1; transform: scale(1.05); color: #339af0; }
                    }
                    @keyframes scan {
                        0% { background-position: -100% 0; }
                        100% { background-position: 200% 0; }
                    }
                ` })
  ] }) });
}
export {
  k as S
};
