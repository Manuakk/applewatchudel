import { useState, useCallback, useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  LineChart,
  Line,
} from "recharts";

// ─── palette ─────────────────────────────────────────────────────────────────
const PALETTE = [
  "#FF6B35","#F7C59F","#00B4D8","#1A936F",
  "#C72C48","#7B2D8B","#E9C46A","#2A9D8F","#004E89","#F4A261",
];
const colorMap = {};
const getColor = (id) => {
  if (!colorMap[id]) {
    colorMap[id] = PALETTE[Object.keys(colorMap).length % PALETTE.length];
  }
  return colorMap[id];
};

// ─── CSV parser ───────────────────────────────────────────────────────────────
function parseCSV(text) {
  const lines = text.trim().split("\n");
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((h) => h.trim().replace(/^"|"$/g, ""));
  return lines.slice(1).map((line) => {
    const cols = [];
    let cur = "", inQ = false;
    for (const ch of line) {
      if (ch === '"') { inQ = !inQ; continue; }
      if (ch === "," && !inQ) { cols.push(cur.trim()); cur = ""; continue; }
      cur += ch;
    }
    cols.push(cur.trim());
    const row = {};
    headers.forEach((h, i) => { row[h] = cols[i] ?? ""; });
    return row;
  });
}

// ─── timestamp → "yyyy-MM-dd" ─────────────────────────────────────────────
function toDay(ts) {
  if (!ts) return null;
  const d = new Date(ts.includes("T") ? ts : ts.replace(" ", "T"));
  if (isNaN(d)) return null;
  return d.toISOString().slice(0, 10);
}

// ─── aggregate rows into per-participant-day stats ────────────────────────
function buildStats(rows) {
  const map = {};

  rows.forEach((r) => {
    const userId    = r.userId || r.user_id || r.user || "";
    const ts        = r.timestamp || r.Timestamp || r.time || "";
    const etype     = (r.eventType || r.event_type || "").toLowerCase();
    const confirmed = (r.confirmedLabel || r.confirmed_label || r.answer || "").toLowerCase();

    if (!userId || !ts) return;
    const day = toDay(ts);
    if (!day) return;

    const key = `${userId}|${day}`;
    if (!map[key]) map[key] = { userId, day, nudges: 0, interactions: 0, ignored: 0 };

    if (etype === "prompt_sent" || etype === "nudge") {
      map[key].nudges += 1;
    }
    if (etype === "prompt_response" || etype === "response") {
      confirmed === "ignored" ? (map[key].ignored += 1) : (map[key].interactions += 1);
    }
  });

  // fallback: no eventType column — treat every row as an interaction
  const hasEventType = rows.some((r) => r.eventType || r.event_type);
  if (!hasEventType && Object.keys(map).length === 0) {
    rows.forEach((r) => {
      const userId = r.userId || r.user_id || r.user || "";
      const ts     = r.timestamp || r.Timestamp || r.time || "";
      if (!userId || !ts) return;
      const day = toDay(ts);
      if (!day) return;
      const key = `${userId}|${day}`;
      if (!map[key]) map[key] = { userId, day, nudges: 0, interactions: 0, ignored: 0 };
      map[key].interactions += 1;
    });
  }

  return Object.values(map).sort(
    (a, b) => a.day.localeCompare(b.day) || a.userId.localeCompare(b.userId)
  );
}

// ─── sample data (14 days × 4 participants) ───────────────────────────────
const SAMPLE_ROWS = (() => {
  const users = ["P01", "P02", "P03", "P04"];
  const rows  = [];
  const base  = new Date("2025-03-01");
  const fmt   = (dt) => dt.toISOString().replace("T", " ").slice(0, 19);
  users.forEach((u) => {
    for (let d = 0; d < 14; d++) {
      const day    = new Date(base.getTime() + d * 864e5);
      const nudges = 4 + Math.floor(Math.random() * 5);
      for (let n = 0; n < nudges; n++)
        rows.push({ userId: u, timestamp: fmt(day), eventType: "prompt_sent", confirmedLabel: "", source: "guided_label" });
      const resp = Math.floor(nudges * (0.4 + Math.random() * 0.5));
      const labels = ["Standing", "Sitting", "Walking", "ignored"];
      for (let r = 0; r < resp; r++)
        rows.push({ userId: u, timestamp: fmt(day), eventType: "prompt_response", confirmedLabel: labels[Math.floor(Math.random() * labels.length)], source: "guided_label" });
    }
  });
  return rows;
})();

// ─── Custom tooltip ───────────────────────────────────────────────────────
const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: "#0f1117", border: "1px solid #2a2d3a", borderRadius: 8, padding: "10px 14px", fontSize: 13 }}>
      <p style={{ color: "#e2e8f0", fontWeight: 700, marginBottom: 6 }}>{label}</p>
      {payload.map((p) => (
        <p key={p.dataKey} style={{ color: p.color, margin: "2px 0" }}>
          {p.name}: <strong>{p.value}</strong>
        </p>
      ))}
    </div>
  );
};

// ─── Dashboard ────────────────────────────────────────────────────────────
export default function App() {
  const [rows, setRows]           = useState(SAMPLE_ROWS);
  const [usingSample, setSample]  = useState(true);
  const [selected, setSelected]   = useState(null); // null = all
  const [view, setView]           = useState("grouped");
  const [dragOver, setDragOver]   = useState(false);

  const stats        = useMemo(() => buildStats(rows), [rows]);
  const participants = useMemo(() => [...new Set(stats.map((r) => r.userId))].sort(), [stats]);
  const days         = useMemo(() => [...new Set(stats.map((r) => r.day))].sort(), [stats]);
  const active       = selected ?? participants;

  const groupedData = useMemo(() =>
    days.map((day) => {
      const entry = { day: day.slice(5) };
      active.forEach((p) => {
        const s = stats.find((r) => r.day === day && r.userId === p);
        entry[`${p}_nudges`]       = s?.nudges ?? 0;
        entry[`${p}_interactions`] = s?.interactions ?? 0;
      });
      return entry;
    }), [days, stats, active]);

  const lineData = useMemo(() =>
    days.map((day) => {
      const entry = { day: day.slice(5) };
      active.forEach((p) => {
        const s = stats.find((r) => r.day === day && r.userId === p);
        const n = s?.nudges ?? 0, i = s?.interactions ?? 0;
        entry[`${p}_rate`] = n > 0 ? Math.round((i / n) * 100) : 0;
      });
      return entry;
    }), [days, stats, active]);

  const handleFile = useCallback((file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      setRows(parseCSV(e.target.result));
      setSample(false);
      setSelected(null);
    };
    reader.readAsText(file);
  }, []);

  const onDrop = useCallback((e) => {
    e.preventDefault(); setDragOver(false);
    handleFile(e.dataTransfer.files[0]);
  }, [handleFile]);

  const toggleP = (p) =>
    setSelected((prev) => {
      const cur = prev ?? participants;
      if (cur.includes(p) && cur.length === 1) return participants;
      return cur.includes(p) ? cur.filter((x) => x !== p) : [...cur, p];
    });

  const summary = useMemo(() => {
    const f  = stats.filter((r) => active.includes(r.userId));
    const tN = f.reduce((s, r) => s + r.nudges, 0);
    const tI = f.reduce((s, r) => s + r.interactions, 0);
    const tG = f.reduce((s, r) => s + r.ignored, 0);
    return { tN, tI, tG, rate: tN > 0 ? ((tI / tN) * 100).toFixed(1) : "—", pCount: active.length, dCount: days.length };
  }, [stats, active, days]);

  // ── styles ──────────────────────────────────────────────────────────────
  const S = {
    root: { minHeight:"100vh", background:"#080b14", color:"#e2e8f0", fontFamily:"'IBM Plex Mono', 'Courier New', monospace", paddingBottom:60 },
    header: { background:"linear-gradient(135deg,#0d1527 0%,#111827 100%)", borderBottom:"1px solid #1e2740", padding:"28px 40px 22px", display:"flex", alignItems:"center", justifyContent:"space-between" },
    body: { padding:"30px 40px" },
    card: { background:"#0f1729", border:"1px solid #1e2740", borderRadius:10, padding:"18px 20px" },
    chart: { background:"#0f1729", border:"1px solid #1e2740", borderRadius:12, padding:"28px 20px" },
    btn: (on, color) => ({ border:`2px solid ${on ? color:"#1e2740"}`, background: on ? `${color}22`:"transparent", color: on ? color:"#475569", borderRadius:20, padding:"4px 14px", fontSize:12, cursor:"pointer", fontFamily:"inherit", transition:"all 0.15s" }),
    tab: (on) => ({ border:"none", background: on ? "#1e3a5f":"transparent", color: on ? "#93c5fd":"#475569", borderRadius:6, padding:"7px 18px", fontSize:12, cursor:"pointer", fontFamily:"inherit", fontWeight: on ? 700:400, transition:"all 0.15s" }),
  };

  return (
    <div style={S.root}>
      {/* Header */}
      <div style={S.header}>
        <div>
          <div style={{ fontSize:11, letterSpacing:4, color:"#4a7fa5", marginBottom:6, textTransform:"uppercase" }}>TrackAndText · Research Dashboard</div>
          <h1 style={{ margin:0, fontSize:22, fontWeight:700, color:"#e8f0fe", letterSpacing:"-0.5px" }}>Nudge &amp; Interaction Analytics</h1>
        </div>
        {usingSample && (
          <div style={{ background:"#1a2a1a", border:"1px solid #2d5a2d", borderRadius:6, padding:"6px 14px", fontSize:11, color:"#6abf6a" }}>⚡ SAMPLE DATA — upload your CSV below</div>
        )}
      </div>

      <div style={S.body}>
        {/* Upload zone */}
        <div
          onDrop={onDrop}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onClick={() => document.getElementById("csv-input").click()}
          style={{ border:`2px dashed ${dragOver ? "#4a7fa5":"#1e2740"}`, borderRadius:10, padding:"20px 30px", marginBottom:30, background: dragOver ? "#0d1a2a":"transparent", display:"flex", alignItems:"center", gap:16, transition:"all 0.2s", cursor:"pointer" }}
        >
          <div style={{ fontSize:28, opacity:0.6 }}>📂</div>
          <div>
            <div style={{ fontSize:13, color:"#94a3b8" }}>
              Drop your <strong style={{ color:"#7dd3fc" }}>confirmation_log.csv</strong> here, or click to browse
            </div>
            <div style={{ fontSize:11, color:"#475569", marginTop:4 }}>
              Expected columns: <code>userId, timestamp, eventType, confirmedLabel, source</code>
            </div>
          </div>
          <input id="csv-input" type="file" accept=".csv" style={{ display:"none" }} onChange={(e) => handleFile(e.target.files[0])} />
        </div>

        {/* Summary cards */}
        <div style={{ display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:14, marginBottom:30 }}>
          {[
            { label:"Participants",   value:summary.pCount,                    color:"#60a5fa" },
            { label:"Days Tracked",   value:summary.dCount,                    color:"#a78bfa" },
            { label:"Total Nudges",   value:summary.tN.toLocaleString(),       color:"#fb923c" },
            { label:"Interactions",   value:summary.tI.toLocaleString(),       color:"#34d399" },
            { label:"Response Rate",  value:`${summary.rate}%`,               color:"#fbbf24" },
          ].map((c) => (
            <div key={c.label} style={S.card}>
              <div style={{ fontSize:11, color:"#64748b", letterSpacing:2, textTransform:"uppercase", marginBottom:8 }}>{c.label}</div>
              <div style={{ fontSize:26, fontWeight:800, color:c.color }}>{c.value}</div>
            </div>
          ))}
        </div>

        {/* Participant filter */}
        <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:24, alignItems:"center" }}>
          <span style={{ fontSize:11, color:"#475569", textTransform:"uppercase", letterSpacing:2 }}>Filter:</span>
          {participants.map((p) => (
            <button key={p} onClick={() => toggleP(p)} style={S.btn(active.includes(p), getColor(p))}>{p}</button>
          ))}
          <button onClick={() => setSelected(null)} style={{ border:"1px solid #1e2740", background:"transparent", color:"#475569", borderRadius:20, padding:"4px 14px", fontSize:11, cursor:"pointer", fontFamily:"inherit" }}>All</button>
        </div>

        {/* View tabs */}
        <div style={{ display:"flex", gap:4, marginBottom:24, background:"#0f1729", borderRadius:8, padding:4, width:"fit-content" }}>
          {[{ k:"grouped", l:"📊 Daily Counts" },{ k:"line", l:"📈 Response Rate" },{ k:"table", l:"🗂 Table" }].map((t) => (
            <button key={t.k} onClick={() => setView(t.k)} style={S.tab(view === t.k)}>{t.l}</button>
          ))}
        </div>

        {/* Grouped bar charts */}
        {view === "grouped" && (
          <div style={S.chart}>
            <div style={{ fontSize:13, color:"#64748b", marginBottom:20, paddingLeft:10 }}>Nudges sent vs Interactions per participant per day</div>
            {active.map((p) => {
              const pData = days.map((day) => {
                const s = stats.find((r) => r.day === day && r.userId === p);
                return { day:day.slice(5), Nudges:s?.nudges??0, Interactions:s?.interactions??0, Ignored:s?.ignored??0 };
              });
              return (
                <div key={p} style={{ marginBottom:36 }}>
                  <div style={{ fontSize:13, color:getColor(p), fontWeight:700, marginBottom:10, paddingLeft:10, letterSpacing:1 }}>▸ {p}</div>
                  <ResponsiveContainer width="100%" height={160}>
                    <BarChart data={pData} barGap={2} barCategoryGap="30%">
                      <CartesianGrid strokeDasharray="2 4" stroke="#1a2540" vertical={false} />
                      <XAxis dataKey="day" tick={{ fill:"#475569", fontSize:11 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill:"#475569", fontSize:11 }} axisLine={false} tickLine={false} width={30} />
                      <Tooltip content={<CustomTooltip />} />
                      <Legend wrapperStyle={{ fontSize:12, color:"#94a3b8" }} />
                      <Bar dataKey="Nudges"       fill={getColor(p)} opacity={0.9} radius={[3,3,0,0]} />
                      <Bar dataKey="Interactions" fill="#34d399"     opacity={0.85} radius={[3,3,0,0]} />
                      <Bar dataKey="Ignored"      fill="#ef4444"     opacity={0.6}  radius={[3,3,0,0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              );
            })}
          </div>
        )}

        {/* Line chart — response rate */}
        {view === "line" && (
          <div style={S.chart}>
            <div style={{ fontSize:13, color:"#64748b", marginBottom:20, paddingLeft:10 }}>Interaction rate (interactions ÷ nudges × 100) per participant over time</div>
            <ResponsiveContainer width="100%" height={380}>
              <LineChart data={lineData}>
                <CartesianGrid strokeDasharray="2 4" stroke="#1a2540" vertical={false} />
                <XAxis dataKey="day" tick={{ fill:"#475569", fontSize:11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill:"#475569", fontSize:11 }} axisLine={false} tickLine={false} unit="%" width={40} domain={[0,100]} />
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ fontSize:12, color:"#94a3b8" }} />
                {active.map((p) => (
                  <Line key={p} dataKey={`${p}_rate`} name={p} stroke={getColor(p)} strokeWidth={2} dot={{ r:3, fill:getColor(p) }} activeDot={{ r:5 }} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Table */}
        {view === "table" && (
          <div style={{ background:"#0f1729", border:"1px solid #1e2740", borderRadius:12, overflow:"hidden" }}>
            <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
              <thead>
                <tr style={{ background:"#111827", borderBottom:"1px solid #1e2740" }}>
                  {["Participant","Date","Nudges","Interactions","Ignored","Response Rate"].map((h) => (
                    <th key={h} style={{ padding:"12px 18px", textAlign:"left", color:"#475569", fontSize:11, letterSpacing:2, textTransform:"uppercase", fontWeight:600 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {stats.filter((r) => active.includes(r.userId)).map((r, i) => (
                  <tr key={i} style={{ borderBottom:"1px solid #141c2e", background: i%2===0 ? "transparent":"#0d1420" }}>
                    <td style={{ padding:"10px 18px", color:getColor(r.userId), fontWeight:700 }}>{r.userId}</td>
                    <td style={{ padding:"10px 18px", color:"#94a3b8" }}>{r.day}</td>
                    <td style={{ padding:"10px 18px", color:"#fb923c" }}>{r.nudges}</td>
                    <td style={{ padding:"10px 18px", color:"#34d399" }}>{r.interactions}</td>
                    <td style={{ padding:"10px 18px", color:"#ef4444" }}>{r.ignored}</td>
                    <td style={{ padding:"10px 18px", color:"#fbbf24" }}>{r.nudges > 0 ? ((r.interactions/r.nudges)*100).toFixed(0)+"%" : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Legend note */}
        <div style={{ marginTop:20, fontSize:11, color:"#334155", lineHeight:1.8 }}>
          <strong style={{ color:"#475569" }}>Data mapping:</strong>{" "}
          <span style={{ color:"#fb923c" }}>Nudges</span> = <code>eventType = "prompt_sent"</code> ·{" "}
          <span style={{ color:"#34d399" }}>Interactions</span> = <code>eventType = "prompt_response"</code> AND <code>confirmedLabel ≠ "ignored"</code> ·{" "}
          <span style={{ color:"#ef4444" }}>Ignored</span> = dismissed prompts
        </div>
      </div>
    </div>
  );
}
