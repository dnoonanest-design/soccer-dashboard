import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import { api } from "./api.js";

// ─── Utils ────────────────────────────────────────────────────────────────────
const fmt = (n, d = 1) => n != null ? Number(n).toFixed(d) : "—";
const pct = (n) => n != null ? `${fmt(n)}%` : "—";
const fmtOdds = (n) => n != null ? Number(n).toFixed(2) : "—";

function groupByDay(matches) {
  const g = {};
  for (const m of matches) {
    const day = (m.kickoff || "").split("T")[0] || "Unknown";
    if (!g[day]) g[day] = [];
    g[day].push(m);
  }
  return g;
}

function dayLabel(ds) {
  const today = new Date(); today.setHours(0,0,0,0);
  const tom = new Date(today); tom.setDate(tom.getDate()+1);
  const yest = new Date(today); yest.setDate(yest.getDate()-1);
  const d = new Date(ds); d.setHours(0,0,0,0);
  if (d.getTime() === today.getTime()) return "Today";
  if (d.getTime() === tom.getTime()) return "Tomorrow";
  if (d.getTime() === yest.getTime()) return "Yesterday";
  return new Date(ds).toLocaleDateString("en-GB", { weekday:"short", day:"numeric", month:"short" });
}

function timeStr(k) {
  if (!k) return "";
  return new Date(k).toLocaleTimeString("en-GB", { hour:"2-digit", minute:"2-digit" });
}

function getFavs() {
  try { return new Set(JSON.parse(localStorage.getItem("fav_teams") || "[]")); }
  catch { return new Set(); }
}
function saveFavs(s) {
  try { localStorage.setItem("fav_teams", JSON.stringify([...s])); } catch {}
}

// ─── Shared UI ────────────────────────────────────────────────────────────────
function Spinner({ size = 5 }) {
  return <div className={`w-${size} h-${size} border-2 border-t-transparent rounded-full animate-spin`} style={{ borderColor: "var(--accent)", borderTopColor: "transparent" }} />;
}

function Card({ children, className = "", accent }) {
  return (
    <div className={`rounded-xl border p-4 ${className}`} style={{ background: "var(--surface)", borderColor: accent ? accent + "33" : "var(--border)" }}>
      {children}
    </div>
  );
}

function SectionLabel({ children, color = "var(--muted)" }) {
  return <div className="text-xs font-display font-bold uppercase tracking-widest mb-2" style={{ color }}>{children}</div>;
}

function LiveDot() {
  return (
    <span className="relative flex h-2 w-2 shrink-0">
      <span className="live-pulse absolute inline-flex h-full w-full rounded-full" style={{ background: "var(--green)" }} />
      <span className="relative inline-flex rounded-full h-2 w-2" style={{ background: "var(--green)" }} />
    </span>
  );
}

function ProbBar({ home, draw, away, homeName, awayName, size = "md" }) {
  if (home == null && draw == null && away == null) return null;
  const h = home ?? 33, d = draw ?? 33, a = away ?? 34;
  const h_ = size === "sm" ? "h-1" : "h-2";
  return (
    <div>
      <div className={`flex ${h_} rounded-full overflow-hidden gap-px my-1.5`}>
        <div style={{ width:`${h}%`, background:"var(--blue)" }} className="rounded-l-full transition-all duration-700" />
        <div style={{ width:`${d}%`, background:"var(--border)" }} className="transition-all duration-700" />
        <div style={{ width:`${a}%`, background:"var(--red)" }} className="rounded-r-full transition-all duration-700" />
      </div>
      <div className="flex text-xs font-display font-bold">
        <span style={{ color:"var(--blue)" }} className="flex-1">{pct(h)}</span>
        <span style={{ color:"var(--muted)" }} className="text-center">Draw {pct(d)}</span>
        <span style={{ color:"var(--red)" }} className="flex-1 text-right">{pct(a)}</span>
      </div>
    </div>
  );
}

function ConfBadge({ conf }) {
  const color = conf === "High" ? "var(--green)" : conf === "Medium" ? "var(--amber)" : "var(--red)";
  return (
    <span className="text-xs font-bold px-2 py-0.5 rounded-full border font-display uppercase" style={{ color, borderColor: color + "44", background: color + "11" }}>{conf}</span>
  );
}

function ValueBadge({ edge }) {
  if (!edge || edge < 2) return null;
  const color = edge >= 8 ? "var(--green)" : edge >= 5 ? "var(--amber)" : "var(--muted2)";
  return <span className="text-xs font-bold font-display" style={{ color }}>+{fmt(edge)}% edge</span>;
}

// ─── Match Card ───────────────────────────────────────────────────────────────
function MatchCard({ match, onClick, favs, onFav, valueCentre }) {
  const isLive = match.status === "live";
  const isFin = match.status === "finished";
  const isFav = favs.has(match.home_team?.id) || favs.has(match.away_team?.id);
  const valueMatch = valueCentre?.find(v => v.match?.id === match.id);

  return (
    <div
      onClick={() => onClick(match)}
      className={`rounded-xl border cursor-pointer transition-all duration-150 p-3 fade-up hover:border-blue-500/30 active:scale-[0.99] ${isFav ? "border-amber-500/25 bg-amber-500/5" : "border-[var(--border)] bg-[var(--surface)]"}`}
    >
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs truncate" style={{ color:"var(--muted)" }}>{match.league_name}</span>
        <div className="flex items-center gap-2 shrink-0">
          {valueMatch && <ValueBadge edge={valueMatch.best_edge?.edge_pct} />}
          {isFav && <span style={{ color:"var(--amber)" }} className="text-xs">★</span>}
          {isLive && <span className="flex items-center gap-1 text-xs font-bold" style={{ color:"var(--green)" }}><LiveDot />{match.minute}'</span>}
          {isFin && <span className="text-xs font-semibold" style={{ color:"var(--muted)" }}>FT</span>}
          {!isLive && !isFin && <span className="text-xs font-medium" style={{ color:"var(--amber)" }}>{timeStr(match.kickoff)}</span>}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <div className="flex-1 min-w-0">
          <div className="font-display font-bold text-base leading-tight truncate">{match.home_team?.name}</div>
          <div className="font-display font-bold text-base leading-tight truncate">{match.away_team?.name}</div>
        </div>
        {(isLive || isFin) && (
          <div className="font-display font-black text-2xl tabular-nums shrink-0" style={{ color: isLive ? "var(--green)" : "var(--text)" }}>
            {match.score?.home ?? 0}<span style={{ color:"var(--muted)" }}>–</span>{match.score?.away ?? 0}
          </div>
        )}
      </div>

      {match.odds?.home_win != null && (
        <ProbBar home={match.odds.home_win} draw={match.odds.draw} away={match.odds.away_win} size="sm" />
      )}

      <div className="flex items-center justify-between mt-2">
        {match.odds?.home_odds != null ? (
          <div className="flex gap-2">
            {[{ l:"H", v:match.odds.home_odds }, { l:"D", v:match.odds.draw_odds }, { l:"A", v:match.odds.away_odds }].map(({ l, v }) => (
              <div key={l} className="text-center">
                <div className="text-xs" style={{ color:"var(--muted)" }}>{l}</div>
                <div className="font-display font-bold text-xs">{fmtOdds(v)}</div>
              </div>
            ))}
          </div>
        ) : <div />}
        <button
          onClick={e => { e.stopPropagation(); onFav(match); }}
          className={`px-2 py-0.5 rounded text-xs border transition-colors ${isFav ? "text-amber-400 border-amber-400/30" : "border-[var(--border)] text-[var(--muted)] hover:text-amber-400"}`}
        >★</button>
      </div>
    </div>
  );
}

// ─── Probability History Chart ────────────────────────────────────────────────
function ProbHistoryChart({ data, homeName, awayName }) {
  if (!data?.snapshots?.length) return (
    <div className="text-center py-6 text-xs" style={{ color:"var(--muted)" }}>No probability history yet — data builds during and after matches</div>
  );

  const chartData = data.snapshots.map(s => ({
    min: s.minute ?? 0,
    home: s.homeWinProb != null ? Math.round(s.homeWinProb * 10) / 10 : null,
    draw: s.drawProb != null ? Math.round(s.drawProb * 10) / 10 : null,
    away: s.awayWinProb != null ? Math.round(s.awayWinProb * 10) / 10 : null,
  }));

  return (
    <div>
      <div className="flex gap-4 mb-2 text-xs">
        <span className="flex items-center gap-1"><span className="w-3 h-0.5 inline-block rounded" style={{ background:"var(--blue)" }} />{homeName?.split(" ").slice(-1)[0]}</span>
        <span className="flex items-center gap-1"><span className="w-3 h-0.5 inline-block rounded" style={{ background:"var(--muted)" }} />Draw</span>
        <span className="flex items-center gap-1"><span className="w-3 h-0.5 inline-block rounded" style={{ background:"var(--red)" }} />{awayName?.split(" ").slice(-1)[0]}</span>
      </div>
      <ResponsiveContainer width="100%" height={160}>
        <LineChart data={chartData} margin={{ top:4, right:4, bottom:4, left:0 }}>
          <XAxis dataKey="min" tick={{ fill:"var(--muted)", fontSize:10 }} tickLine={false} axisLine={false} label={{ value:"min", position:"insideRight", fill:"var(--muted)", fontSize:9 }} />
          <YAxis domain={[0,100]} tick={{ fill:"var(--muted)", fontSize:10 }} tickLine={false} axisLine={false} tickFormatter={v => `${v}%`} width={36} />
          <Tooltip contentStyle={{ background:"var(--surface2)", border:"1px solid var(--border)", borderRadius:8, fontSize:11 }} formatter={(v, n) => [`${fmt(v)}%`, n === "home" ? homeName : n === "away" ? awayName : "Draw"]} labelFormatter={l => `Min ${l}`} />
          <ReferenceLine x={45} stroke="var(--border)" strokeDasharray="3 3" />
          <Line type="monotone" dataKey="home" stroke="var(--blue)" strokeWidth={2} dot={false} connectNulls />
          <Line type="monotone" dataKey="draw" stroke="var(--muted)" strokeWidth={1.5} dot={false} connectNulls />
          <Line type="monotone" dataKey="away" stroke="var(--red)" strokeWidth={2} dot={false} connectNulls />
        </LineChart>
      </ResponsiveContainer>
      {data.explanation?.summary && (
        <div className="mt-2 text-xs p-2 rounded-lg border" style={{ color:"var(--muted2)", borderColor:"var(--border)", background:"var(--surface2)" }}>
          💡 {data.explanation.summary}
        </div>
      )}
    </div>
  );
}

// ─── Match Detail ─────────────────────────────────────────────────────────────
function MatchDetail({ match, onClose, favs, onFav }) {
  const [tab, setTab] = useState("overview");
  const [pred, setPred] = useState(null);
  const [stats, setStats] = useState(null);
  const [history, setHistory] = useState(null);
  const [loading, setLoading] = useState(true);
  const isFav = favs.has(match.home_team?.id) || favs.has(match.away_team?.id);
  const isLive = match.status === "live";
  const isFin = match.status === "finished";

  useEffect(() => {
    setLoading(true);
    Promise.allSettled([
      api.prediction(match.id),
      api.stats(match.id),
      api.probabilityHistory(match.id),
    ]).then(([p, s, h]) => {
      if (p.status === "fulfilled") setPred(p.value);
      if (s.status === "fulfilled") setStats(s.value);
      if (h.status === "fulfilled") setHistory(h.value);
    }).finally(() => setLoading(false));
  }, [match.id]);

  const lm = pred?.live_momentum;
  const tabs = [
    { id:"overview", label:"Overview" },
    { id:"probability", label:"Probability" },
    { id:"odds", label:"Odds & Markets" },
    { id:"stats", label:"Stats" },
    { id:"lineup", label:"Lineups" },
  ];

  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background:"var(--bg)" }}>
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b shrink-0" style={{ borderColor:"var(--border)" }}>
        <button onClick={onClose} className="text-xl w-8 h-8 flex items-center justify-center rounded-lg" style={{ color:"var(--muted)", background:"var(--surface)" }}>←</button>
        <div className="flex-1 min-w-0">
          <div className="text-xs truncate" style={{ color:"var(--muted)" }}>{match.league_name} · {match.country}</div>
        </div>
        {pred?.confidence && <ConfBadge conf={pred.confidence} />}
        <button onClick={() => onFav(match)} className="text-xl" style={{ color: isFav ? "var(--amber)" : "var(--muted)" }}>★</button>
      </div>

      {/* Score block */}
      <div className="px-4 py-4 border-b shrink-0" style={{ background:"var(--surface)", borderColor:"var(--border)" }}>
        <div className="flex items-center justify-between gap-4">
          <div className="flex-1 text-center">
            <div className="font-display font-black text-lg leading-tight">{match.home_team?.name}</div>
          </div>
          <div className="flex flex-col items-center shrink-0">
            {(isLive || isFin) ? (
              <>
                <div className="font-display font-black text-4xl tabular-nums">{match.score?.home ?? 0}<span style={{ color:"var(--muted)" }}>–</span>{match.score?.away ?? 0}</div>
                {isLive && <div className="flex items-center gap-1.5 mt-0.5 text-xs font-bold" style={{ color:"var(--green)" }}><LiveDot />{match.minute}'</div>}
                {isFin && match.score_ht && <div className="text-xs mt-0.5" style={{ color:"var(--muted)" }}>HT {match.score_ht.home}–{match.score_ht.away}</div>}
              </>
            ) : (
              <div className="font-display font-black text-2xl" style={{ color:"var(--amber)" }}>{timeStr(match.kickoff)}</div>
            )}
          </div>
          <div className="flex-1 text-center">
            <div className="font-display font-black text-lg leading-tight">{match.away_team?.name}</div>
          </div>
        </div>

        {/* Inline prob bar */}
        {pred && <ProbBar home={pred.home_win} draw={pred.draw} away={pred.away_win} homeName={match.home_team?.name} awayName={match.away_team?.name} />}
      </div>

      {/* Tabs */}
      <div className="flex border-b shrink-0 overflow-x-auto" style={{ borderColor:"var(--border)" }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className="shrink-0 px-3 py-2.5 text-xs font-display font-bold uppercase tracking-wide border-b-2 transition-colors"
            style={{ borderColor: tab === t.id ? "var(--blue)" : "transparent", color: tab === t.id ? "var(--text)" : "var(--muted)" }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {loading && <div className="flex justify-center py-12"><Spinner size={6} /></div>}

        {/* OVERVIEW */}
        {!loading && tab === "overview" && (
          <div className="flex flex-col gap-3">
            {/* xG */}
            {pred?.home_xg != null && (
              <Card>
                <SectionLabel>Expected Goals (xG)</SectionLabel>
                <div className="flex justify-between items-center py-1">
                  <div className="text-center">
                    <div className="font-display font-black text-4xl tabular-nums" style={{ color:"var(--blue)" }}>{fmt(pred.home_xg, 2)}</div>
                    <div className="text-xs mt-0.5 truncate max-w-[100px]" style={{ color:"var(--muted)" }}>{match.home_team?.name}</div>
                  </div>
                  <div className="font-display text-sm font-bold" style={{ color:"var(--muted)" }}>xG</div>
                  <div className="text-center">
                    <div className="font-display font-black text-4xl tabular-nums" style={{ color:"var(--red)" }}>{fmt(pred.away_xg, 2)}</div>
                    <div className="text-xs mt-0.5 truncate max-w-[100px]" style={{ color:"var(--muted)" }}>{match.away_team?.name}</div>
                  </div>
                </div>
              </Card>
            )}

            {/* Live momentum */}
            {isLive && lm && (
              <Card accent="var(--green)">
                <div className="flex items-center justify-between mb-2">
                  <SectionLabel color="var(--green)">Live Momentum</SectionLabel>
                  {lm.momentum_label && <span className="text-xs font-bold" style={{ color:"var(--accent)" }}>{lm.momentum_label}</span>}
                </div>
                <div className="flex gap-2 items-center">
                  <span className="text-xs w-14 text-right truncate" style={{ color:"var(--muted)" }}>{match.home_team?.name?.split(" ").slice(-1)[0]}</span>
                  <div className="flex-1 h-3 rounded-full overflow-hidden" style={{ background:"var(--surface2)" }}>
                    <div className="h-full rounded-full transition-all duration-700" style={{ width:`${lm.home_momentum_pct ?? 50}%`, background:"linear-gradient(90deg, var(--blue), var(--accent))" }} />
                  </div>
                  <span className="text-xs w-14 truncate" style={{ color:"var(--muted)" }}>{match.away_team?.name?.split(" ").slice(-1)[0]}</span>
                </div>
                <div className="flex justify-between text-xs font-bold font-display mt-1 px-16">
                  <span style={{ color:"var(--blue)" }}>{lm.home_momentum_pct?.toFixed(0)}%</span>
                  <span style={{ color:"var(--red)" }}>{lm.away_momentum_pct?.toFixed(0)}%</span>
                </div>
                {lm.pressure_alert && (
                  <div className="mt-2 text-xs px-3 py-2 rounded-lg border" style={{ color:"var(--amber)", borderColor:"var(--amber)33", background:"var(--amber)11" }}>⚡ {lm.pressure_alert}</div>
                )}
                {/* Danger scores */}
                {lm.home_danger_score != null && (
                  <div className="grid grid-cols-2 gap-2 mt-3">
                    {[{ label:"Home Danger", v:lm.home_danger_score, color:"var(--blue)" }, { label:"Away Danger", v:lm.away_danger_score, color:"var(--red)" }].map(({ label, v, color }) => (
                      <div key={label} className="text-center rounded-lg p-2" style={{ background:"var(--surface2)" }}>
                        <div className="font-display font-black text-lg" style={{ color }}>{fmt(v, 0)}</div>
                        <div className="text-xs" style={{ color:"var(--muted)" }}>{label}</div>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            )}

            {/* Live adjusted probs */}
            {isLive && pred?.live_adjusted_home_win != null && (
              <Card accent="var(--green)">
                <SectionLabel color="var(--green)">Live Score Adjusted Probability</SectionLabel>
                <ProbBar home={pred.live_adjusted_home_win} draw={pred.live_adjusted_draw} away={pred.live_adjusted_away_win} homeName={match.home_team?.name} awayName={match.away_team?.name} />
              </Card>
            )}

            {/* Key factors */}
            {pred?.reasons?.length > 0 && (
              <Card>
                <SectionLabel>AI Key Factors</SectionLabel>
                {pred.reasons.map((r, i) => (
                  <div key={i} className="flex gap-2 items-start py-1.5 border-b last:border-0" style={{ borderColor:"var(--border)" }}>
                    <span className="shrink-0 mt-0.5 font-bold" style={{ color:"var(--accent)" }}>›</span>
                    <span className="text-sm leading-relaxed">{r}</span>
                  </div>
                ))}
              </Card>
            )}

            {/* Circumstance factors */}
            {pred && (pred.home_form_factor !== 1 || pred.home_injury_factor !== 1 || pred.home_lineup_factor !== 1) && (
              <Card>
                <SectionLabel>AI Circumstance Factors</SectionLabel>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { label:"Home Form", v:pred.home_form_factor, ref:1 },
                    { label:"Away Form", v:pred.away_form_factor, ref:1 },
                    { label:"Home Injuries", v:pred.home_injury_factor, ref:1 },
                    { label:"Away Injuries", v:pred.away_injury_factor, ref:1 },
                    { label:"Home Lineup", v:pred.home_lineup_factor, ref:1 },
                    { label:"Away Lineup", v:pred.away_lineup_factor, ref:1 },
                  ].filter(x => x.v != null).map(({ label, v, ref }) => {
                    const delta = v - ref;
                    const color = Math.abs(delta) < 0.02 ? "var(--muted2)" : delta > 0 ? "var(--green)" : "var(--red)";
                    return (
                      <div key={label} className="rounded-lg p-2.5 flex justify-between items-center" style={{ background:"var(--surface2)" }}>
                        <span className="text-xs">{label}</span>
                        <span className="font-display font-bold text-sm" style={{ color }}>{delta > 0 ? "+" : ""}{((delta)*100).toFixed(0)}%</span>
                      </div>
                    );
                  })}
                </div>
              </Card>
            )}

            {/* Injuries */}
            {((pred?.home_injuries?.length > 0) || (pred?.away_injuries?.length > 0)) && (
              <Card accent="var(--red)">
                <SectionLabel color="var(--red)">Absences</SectionLabel>
                {[...(pred.home_injuries ?? []), ...(pred.away_injuries ?? [])].map((p, i) => (
                  <div key={i} className="flex items-center gap-2 py-1.5 border-b last:border-0" style={{ borderColor:"var(--red)22" }}>
                    <span className="font-bold text-xs" style={{ color:"var(--red)" }}>✕</span>
                    <span className="text-sm flex-1">{p.name}</span>
                    <span className="text-xs" style={{ color:"var(--muted)" }}>{p.type}</span>
                  </div>
                ))}
              </Card>
            )}

            {/* Substitution impacts */}
            {pred?.substitution_impacts?.length > 0 && (
              <Card>
                <SectionLabel>Substitution Impact</SectionLabel>
                {pred.substitution_impacts.map((s, i) => (
                  <div key={i} className="flex items-center gap-2 py-1.5 border-b last:border-0 text-xs" style={{ borderColor:"var(--border)" }}>
                    <span className="font-display font-bold w-8 shrink-0" style={{ color:"var(--muted)" }}>{s.minute}'</span>
                    <div className="flex-1 min-w-0">
                      <span style={{ color:"var(--red)" }}>{s.player_out}</span>
                      <span style={{ color:"var(--muted)" }}> → </span>
                      <span style={{ color:"var(--green)" }}>{s.player_in}</span>
                    </div>
                    <span className="font-bold shrink-0" style={{ color: s.xg_delta > 0.01 ? "var(--green)" : s.xg_delta < -0.01 ? "var(--red)" : "var(--muted)" }}>
                      {s.xg_delta > 0 ? "+" : ""}{fmt(s.xg_delta, 2)} xG
                    </span>
                  </div>
                ))}
              </Card>
            )}
          </div>
        )}

        {/* PROBABILITY HISTORY */}
        {!loading && tab === "probability" && (
          <div className="flex flex-col gap-3">
            <Card>
              <SectionLabel>Win Probability Timeline</SectionLabel>
              <ProbHistoryChart data={history} homeName={match.home_team?.name} awayName={match.away_team?.name} />
            </Card>

            {/* Base vs adjusted */}
            {pred?.base_home_win != null && (
              <Card>
                <SectionLabel>Model Breakdown</SectionLabel>
                <div className="flex flex-col gap-3">
                  <div>
                    <div className="text-xs mb-1" style={{ color:"var(--muted)" }}>Base Poisson (no adjustments)</div>
                    <ProbBar home={pred.base_home_win} draw={pred.base_draw} away={pred.base_away_win} size="sm" />
                  </div>
                  <div>
                    <div className="text-xs mb-1" style={{ color:"var(--accent)" }}>Final (form + injuries + lineup + H2H)</div>
                    <ProbBar home={pred.home_win} draw={pred.draw} away={pred.away_win} size="sm" />
                  </div>
                  {pred.h2h && pred.h2h.matches > 0 && (
                    <div>
                      <div className="text-xs mb-1" style={{ color:"var(--muted)" }}>H2H record (last {pred.h2h.matches} meetings)</div>
                      <ProbBar
                        home={pred.h2h.home_win_rate * 100}
                        draw={pred.h2h.draw_rate * 100}
                        away={pred.h2h.away_win_rate * 100}
                        size="sm"
                      />
                    </div>
                  )}
                </div>
              </Card>
            )}

            {/* Home advantage */}
            {pred?.home_advantage != null && (
              <Card>
                <SectionLabel>Match Factors</SectionLabel>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { label:"Home Advantage", v:`×${fmt(pred.home_advantage, 2)}` },
                    { label:"Confidence", v:`${fmt(pred.confidence_score, 0)}/100` },
                    { label:"Home xG", v:fmt(pred.home_xg, 2) },
                    { label:"Away xG", v:fmt(pred.away_xg, 2) },
                  ].map(({ label, v }) => (
                    <div key={label} className="rounded-lg p-2.5 text-center" style={{ background:"var(--surface2)" }}>
                      <div className="font-display font-bold text-base">{v}</div>
                      <div className="text-xs mt-0.5" style={{ color:"var(--muted)" }}>{label}</div>
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </div>
        )}

        {/* ODDS & MARKETS */}
        {!loading && tab === "odds" && (
          <div className="flex flex-col gap-3">
            {match.odds?.home_win != null && (
              <Card>
                <SectionLabel>Match Result Odds</SectionLabel>
                <div className="grid grid-cols-3 gap-2 mb-3">
                  {[
                    { label:match.home_team?.name, prob:match.odds.home_win, odds:match.odds.home_odds },
                    { label:"Draw", prob:match.odds.draw, odds:match.odds.draw_odds },
                    { label:match.away_team?.name, prob:match.odds.away_win, odds:match.odds.away_odds },
                  ].map(({ label, prob, odds }) => (
                    <div key={label} className="rounded-xl p-3 text-center border" style={{ background:"var(--surface2)", borderColor:"var(--border)" }}>
                      <div className="text-xs truncate mb-1" style={{ color:"var(--muted)" }}>{label}</div>
                      <div className="font-display font-black text-xl">{fmtOdds(odds)}</div>
                      <div className="text-xs mt-1 font-bold" style={{ color:"var(--accent)" }}>{pct(prob)}</div>
                    </div>
                  ))}
                </div>
                <ProbBar home={match.odds.home_win} draw={match.odds.draw} away={match.odds.away_win} homeName={match.home_team?.name} awayName={match.away_team?.name} />
              </Card>
            )}

            {pred?.fair_home_odds != null && (
              <Card>
                <SectionLabel>Fair Odds (AI Model — No Bookmaker Margin)</SectionLabel>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { label:"Home", v:pred.fair_home_odds },
                    { label:"Draw", v:pred.fair_draw_odds },
                    { label:"Away", v:pred.fair_away_odds },
                  ].map(({ label, v }) => (
                    <div key={label} className="rounded-lg p-2.5 text-center" style={{ background:"var(--surface2)" }}>
                      <div className="text-xs mb-1" style={{ color:"var(--muted)" }}>{label}</div>
                      <div className="font-display font-black text-xl">{fmtOdds(v)}</div>
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {pred?.correct_scores?.length > 0 && (
              <Card>
                <SectionLabel>AI Correct Score Probabilities</SectionLabel>
                <div className="grid grid-cols-3 gap-2">
                  {pred.correct_scores.slice(0, 9).map(cs => (
                    <div key={cs.score} className="rounded-lg p-2.5 text-center border" style={{ background:"var(--surface2)", borderColor:"var(--border)" }}>
                      <div className="font-display font-black text-lg">{cs.score}</div>
                      <div className="text-xs font-bold" style={{ color:"var(--accent)" }}>{cs.probability?.toFixed(1)}%</div>
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {pred && (
              <Card>
                <SectionLabel>Goal Markets</SectionLabel>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { label:"Over 1.5 Goals", v:pred.over_15 },
                    { label:"Over 2.5 Goals", v:pred.over_25 },
                    { label:"Over 3.5 Goals", v:pred.over_35 },
                    { label:"Both Teams Score", v:pred.btts },
                  ].map(({ label, v }) => (
                    <div key={label} className="rounded-lg p-3 flex justify-between items-center border" style={{ background:"var(--surface2)", borderColor:"var(--border)" }}>
                      <span className="text-sm">{label}</span>
                      <span className="font-display font-black text-base" style={{ color: v > 65 ? "var(--green)" : v > 50 ? "var(--accent)" : "var(--text)" }}>{pct(v)}</span>
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </div>
        )}

        {/* STATS */}
        {!loading && tab === "stats" && (
          <div className="flex flex-col gap-3">
            {stats ? (
              <>
                <div className="grid grid-cols-3 gap-1 text-xs text-center mb-1">
                  <div className="font-bold" style={{ color:"var(--blue)" }}>{match.home_team?.name?.split(" ").slice(-1)[0]}</div>
                  <div style={{ color:"var(--muted)" }}>Stat</div>
                  <div className="font-bold" style={{ color:"var(--red)" }}>{match.away_team?.name?.split(" ").slice(-1)[0]}</div>
                </div>
                {[
                  { label:"Goals/Game", h:stats.home?.goals_per_game, a:stats.away?.goals_per_game, dec:2 },
                  { label:"Conceded/Game", h:stats.home?.conceded_per_game, a:stats.away?.conceded_per_game, dec:2 },
                  { label:"Form", h:stats.home?.form, a:stats.away?.form, text:true },
                  { label:"Played", h:stats.home?.matches_played, a:stats.away?.matches_played },
                  { label:"Wins", h:stats.home?.wins, a:stats.away?.wins },
                  { label:"Clean Sheets", h:stats.home?.clean_sheets, a:stats.away?.clean_sheets },
                ].map(({ label, h, a, dec, text }) => (
                  <div key={label} className="flex items-center gap-2 py-2.5 border-b last:border-0" style={{ borderColor:"var(--border)" }}>
                    <div className="w-14 text-center font-display font-bold text-sm" style={{ color:"var(--blue)" }}>
                      {text ? h : h != null ? Number(h).toFixed(dec ?? 0) : "—"}
                    </div>
                    <div className="flex-1 text-center text-xs" style={{ color:"var(--muted)" }}>{label}</div>
                    <div className="w-14 text-center font-display font-bold text-sm" style={{ color:"var(--red)" }}>
                      {text ? a : a != null ? Number(a).toFixed(dec ?? 0) : "—"}
                    </div>
                  </div>
                ))}

                {stats.has_live_stats && (
                  <>
                    <div className="text-xs font-bold uppercase tracking-widest mt-2" style={{ color:"var(--green)" }}>● Live Stats</div>
                    {[
                      { label:"Shots", h:stats.home?.shots_total, a:stats.away?.shots_total },
                      { label:"On Target", h:stats.home?.shots_on_target, a:stats.away?.shots_on_target },
                      { label:"Possession", h:stats.home?.possession, a:stats.away?.possession, text:true },
                      { label:"Corners", h:stats.home?.corners, a:stats.away?.corners },
                      { label:"Fouls", h:stats.home?.fouls, a:stats.away?.fouls },
                      { label:"Yellow Cards", h:stats.home?.yellow_cards, a:stats.away?.yellow_cards },
                    ].filter(r => r.h != null || r.a != null).map(({ label, h, a, text }) => (
                      <div key={label} className="flex items-center gap-2 py-2 border-b last:border-0" style={{ borderColor:"var(--green)22" }}>
                        <div className="w-14 text-center font-display font-bold text-sm" style={{ color:"var(--blue)" }}>{text ? h : h ?? 0}</div>
                        <div className="flex-1 text-center text-xs" style={{ color:"var(--muted)" }}>{label}</div>
                        <div className="w-14 text-center font-display font-bold text-sm" style={{ color:"var(--red)" }}>{text ? a : a ?? 0}</div>
                      </div>
                    ))}
                  </>
                )}
              </>
            ) : (
              <div className="text-center py-12 text-sm" style={{ color:"var(--muted)" }}>Stats not available for this match</div>
            )}

            {/* Player spotlights */}
            {pred?.home_spotlights && (
              <Card>
                <SectionLabel>Player Spotlights</SectionLabel>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { team:match.home_team?.name, data:pred.home_spotlights, color:"var(--blue)" },
                    { team:match.away_team?.name, data:pred.away_spotlights, color:"var(--red)" },
                  ].map(({ team, data, color }) => data && (
                    <div key={team}>
                      <div className="text-xs font-bold truncate mb-2" style={{ color }}>{team}</div>
                      {[
                        { label:"⚽ Top scorer", p:data.top_scorer },
                        { label:"🎯 Top assist", p:data.top_assister },
                      ].map(({ label, p }) => p && (
                        <div key={label} className="mb-1.5 rounded p-2" style={{ background:"var(--surface2)" }}>
                          <div className="text-xs" style={{ color:"var(--muted)" }}>{label}</div>
                          <div className="text-xs font-bold truncate">{p.name}</div>
                          <div className="text-xs" style={{ color:"var(--accent)" }}>{p.per_game?.toFixed(2)}/game · {p.prob?.toFixed(0)}% chance</div>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </div>
        )}

        {/* LINEUPS */}
        {!loading && tab === "lineup" && (
          <div className="flex flex-col gap-3">
            {pred?.lineup ? (
              <>
                <div className="text-center text-xs font-bold" style={{ color: pred.lineup.confirmed ? "var(--green)" : "var(--amber)" }}>
                  {pred.lineup.confirmed ? "✓ Confirmed Lineup" : "Predicted Lineup"}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { team:match.home_team?.name, players:pred.lineup.home, color:"var(--blue)" },
                    { team:match.away_team?.name, players:pred.lineup.away, color:"var(--red)" },
                  ].map(({ team, players, color }) => (
                    <Card key={team} className="p-3">
                      <div className="font-display font-bold text-sm truncate mb-2" style={{ color }}>{team}</div>
                      {players?.map((p, i) => (
                        <div key={i} className="flex items-center gap-1.5 py-1 border-b last:border-0" style={{ borderColor:"var(--border)" }}>
                          <span className="font-display font-bold text-xs w-5 text-center" style={{ color:"var(--muted)" }}>{p.number}</span>
                          <div className="flex-1 min-w-0">
                            <div className="text-xs font-medium truncate">{p.name}</div>
                            <div className="text-xs" style={{ color:"var(--muted)" }}>{p.position}</div>
                          </div>
                          {p.goals_per_game > 0.08 && <span className="text-xs font-bold" style={{ color:"var(--accent)" }}>⚽{p.goals_per_game.toFixed(2)}</span>}
                        </div>
                      ))}
                    </Card>
                  ))}
                </div>
              </>
            ) : (
              <div className="text-center py-12" style={{ color:"var(--muted)" }}>
                <div className="text-3xl mb-2">👥</div>
                <div className="font-display font-bold">Lineup not available</div>
                <div className="text-xs mt-1">Usually available 1 hour before kick-off</div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Fixtures Page ────────────────────────────────────────────────────────────
function FixturesPage({ matches, loading, favs, onFav, onSelect, valueCentre }) {
  const [dayFilter, setDayFilter] = useState("all");
  const todayKey = new Date().toISOString().split("T")[0];

  const grouped = useMemo(() => groupByDay([...matches].sort((a,b) => new Date(a.kickoff) - new Date(b.kickoff))), [matches]);
  const days = Object.keys(grouped).sort();

  const filtered = useMemo(() => {
    if (dayFilter === "all") return grouped;
    return { [dayFilter]: grouped[dayFilter] ?? [] };
  }, [grouped, dayFilter]);

  return (
    <div className="flex flex-col gap-3 px-4 pt-3">
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4">
        <button onClick={() => setDayFilter("all")} className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold font-display uppercase tracking-wide transition-all" style={{ background: dayFilter === "all" ? "var(--blue)" : "var(--surface)", color: dayFilter === "all" ? "white" : "var(--muted)", border: `1px solid ${dayFilter === "all" ? "var(--blue)" : "var(--border)"}` }}>All</button>
        {days.map(d => (
          <button key={d} onClick={() => setDayFilter(d)} className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold font-display uppercase tracking-wide transition-all"
            style={{ background: dayFilter === d ? "var(--blue)" : "var(--surface)", color: dayFilter === d ? "white" : d === todayKey ? "var(--amber)" : "var(--muted)", border: `1px solid ${dayFilter === d ? "var(--blue)" : d === todayKey ? "var(--amber)55" : "var(--border)"}` }}>
            {dayLabel(d)}
          </button>
        ))}
      </div>

      {loading && <div className="flex justify-center py-16"><Spinner size={6} /></div>}

      {Object.entries(filtered).sort(([a],[b]) => a.localeCompare(b)).map(([day, ms]) => (
        <div key={day}>
          <div className="flex items-center gap-2 mb-2">
            <span className="font-display font-bold text-sm uppercase tracking-widest" style={{ color:"var(--accent)" }}>{dayLabel(day)}</span>
            <span className="text-xs px-1.5 py-0.5 rounded" style={{ background:"var(--surface2)", color:"var(--muted)", border:"1px solid var(--border)" }}>{ms.length}</span>
          </div>
          <div className="flex flex-col gap-2">
            {ms.map(m => <MatchCard key={m.id} match={m} onClick={onSelect} favs={favs} onFav={onFav} valueCentre={valueCentre} />)}
          </div>
        </div>
      ))}

      {!loading && matches.length === 0 && (
        <div className="text-center py-16" style={{ color:"var(--muted)" }}>
          <div className="text-5xl mb-3">⚽</div>
          <div className="font-display font-bold text-xl">No fixtures today</div>
          <div className="text-sm mt-1">Check upcoming tab for future matches</div>
        </div>
      )}
    </div>
  );
}

// ─── Live Page ────────────────────────────────────────────────────────────────
function LivePage({ matches, favs, onFav, onSelect, valueCentre }) {
  const live = matches.filter(m => m.status === "live");
  return (
    <div className="px-4 pt-3">
      <div className="flex items-center gap-2 mb-3">
        <LiveDot />
        <span className="font-display font-black text-xl uppercase tracking-wide">Live Now</span>
        <span className="font-display font-bold text-sm px-2 py-0.5 rounded-full border" style={{ color:"var(--green)", borderColor:"var(--green)44", background:"var(--green)11" }}>{live.length}</span>
      </div>
      {live.length === 0 ? (
        <div className="text-center py-16" style={{ color:"var(--muted)" }}>
          <div className="text-5xl mb-3">📺</div>
          <div className="font-display font-bold text-xl">No live matches</div>
          <div className="text-sm mt-1">Check fixtures for upcoming kick-offs</div>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {live.map(m => <MatchCard key={m.id} match={m} onClick={onSelect} favs={favs} onFav={onFav} valueCentre={valueCentre} />)}
        </div>
      )}
    </div>
  );
}

// ─── Value Centre Page ────────────────────────────────────────────────────────
function ValueCentrePage({ onSelect }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [minEdge, setMinEdge] = useState(3);

  useEffect(() => {
    setLoading(true);
    api.valueCentre(minEdge).then(setData).catch(() => setData(null)).finally(() => setLoading(false));
  }, [minEdge]);

  return (
    <div className="px-4 pt-3">
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="font-display font-black text-xl uppercase tracking-wide">Value Centre</div>
          <div className="text-xs mt-0.5" style={{ color:"var(--muted)" }}>AI model vs bookmaker odds — find edges</div>
        </div>
        <select value={minEdge} onChange={e => setMinEdge(Number(e.target.value))} className="px-2 py-1.5 rounded-lg text-xs outline-none" style={{ background:"var(--surface)", border:"1px solid var(--border)", color:"var(--text)" }}>
          {[2,3,5,8].map(v => <option key={v} value={v}>Min +{v}%</option>)}
        </select>
      </div>

      {loading && <div className="flex justify-center py-16"><Spinner size={6} /></div>}

      {!loading && data?.value_matches?.length === 0 && (
        <div className="text-center py-12" style={{ color:"var(--muted)" }}>
          <div className="text-4xl mb-3">🔍</div>
          <div className="font-display font-bold text-lg">No value edges found</div>
          <div className="text-sm mt-1">Try lowering the minimum edge threshold</div>
        </div>
      )}

      {!loading && data?.value_matches?.map((vm, i) => {
        const m = vm.match;
        const be = vm.best_edge;
        return (
          <div key={i} onClick={() => onSelect(m)} className="rounded-xl border cursor-pointer mb-3 overflow-hidden fade-up" style={{ borderColor:"var(--border)", background:"var(--surface)" }}>
            <div className="px-3 py-2 border-b flex items-center justify-between" style={{ borderColor:"var(--border)", background:"var(--surface2)" }}>
              <span className="text-xs" style={{ color:"var(--muted)" }}>{m?.league_name}</span>
              <div className="flex items-center gap-2">
                {vm.confidence && <ConfBadge conf={vm.confidence} />}
                <span className="font-display font-bold text-sm" style={{ color:"var(--accent)" }}>+{fmt(be?.edge_pct)}% edge</span>
              </div>
            </div>
            <div className="px-3 py-3">
              <div className="font-display font-bold text-base mb-1">{m?.home_team?.name} vs {m?.away_team?.name}</div>
              <div className="text-xs mb-2" style={{ color:"var(--muted)" }}>{timeStr(m?.kickoff)}</div>

              {/* Best edge highlight */}
              {be && (
                <div className="rounded-lg p-2.5 mb-2 flex items-center justify-between" style={{ background:`var(--${be.edge_pct >= 8 ? "green" : "amber"})11`, border:`1px solid var(--${be.edge_pct >= 8 ? "green" : "amber"})33` }}>
                  <div>
                    <div className="text-xs font-bold uppercase" style={{ color: be.edge_pct >= 8 ? "var(--green)" : "var(--amber)" }}>{be.outcome === "home" ? m?.home_team?.name : be.outcome === "away" ? m?.away_team?.name : "Draw"} to win</div>
                    <div className="text-xs mt-0.5" style={{ color:"var(--muted)" }}>Model: {pct(be.model_prob)} · Fair odds: {fmtOdds(be.fair_odds)} · Bookie: {fmtOdds(be.bookmaker_odds)}</div>
                  </div>
                  <div className="font-display font-black text-xl" style={{ color: be.edge_pct >= 8 ? "var(--green)" : "var(--amber)" }}>+{fmt(be.edge_pct)}%</div>
                </div>
              )}

              {/* All edges */}
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label:m?.home_team?.name?.split(" ").slice(-1)[0], e:vm.edges?.home },
                  { label:"Draw", e:vm.edges?.draw },
                  { label:m?.away_team?.name?.split(" ").slice(-1)[0], e:vm.edges?.away },
                ].map(({ label, e }) => e && (
                  <div key={label} className="text-center rounded-lg p-2" style={{ background:"var(--surface2)" }}>
                    <div className="text-xs truncate mb-0.5" style={{ color:"var(--muted)" }}>{label}</div>
                    <div className="font-display font-bold text-sm">{fmtOdds(e.bookmaker_odds)}</div>
                    <div className="text-xs font-bold" style={{ color: e.edge_pct >= 5 ? "var(--green)" : e.edge_pct >= 2 ? "var(--amber)" : "var(--muted)" }}>
                      {e.edge_pct >= 0 ? "+" : ""}{fmt(e.edge_pct)}%
                    </div>
                  </div>
                ))}
              </div>

              {vm.reasons?.length > 0 && (
                <div className="mt-2 text-xs" style={{ color:"var(--muted)" }}>› {vm.reasons[0]}</div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── My Teams Page ────────────────────────────────────────────────────────────
function MyTeamsPage({ matches, favs, onFav, onSelect, valueCentre }) {
  const favMatches = matches.filter(m => favs.has(m.home_team?.id) || favs.has(m.away_team?.id));
  const grouped = groupByDay([...favMatches].sort((a,b) => new Date(a.kickoff) - new Date(b.kickoff)));

  if (favMatches.length === 0) return (
    <div className="px-4 pt-3 text-center py-16" style={{ color:"var(--muted)" }}>
      <div className="text-5xl mb-3">★</div>
      <div className="font-display font-bold text-xl">No teams followed yet</div>
      <div className="text-sm mt-2 max-w-xs mx-auto">Tap ★ on any match card to follow both teams. Their upcoming fixtures appear here.</div>
    </div>
  );

  return (
    <div className="px-4 pt-3 flex flex-col gap-3">
      <div className="flex items-center gap-2 mb-1">
        <span style={{ color:"var(--amber)" }} className="text-xl">★</span>
        <span className="font-display font-black text-xl uppercase tracking-wide">My Teams</span>
        <span className="text-xs px-1.5 py-0.5 rounded" style={{ background:"var(--surface2)", color:"var(--muted)", border:"1px solid var(--border)" }}>{favMatches.length} fixtures</span>
      </div>
      {Object.entries(grouped).sort(([a],[b]) => a.localeCompare(b)).map(([day, ms]) => (
        <div key={day}>
          <div className="font-display font-bold text-sm uppercase tracking-widest mb-2" style={{ color:"var(--accent)" }}>{dayLabel(day)}</div>
          <div className="flex flex-col gap-2">
            {ms.map(m => <MatchCard key={m.id} match={m} onClick={onSelect} favs={favs} onFav={onFav} valueCentre={valueCentre} />)}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Accuracy Page ────────────────────────────────────────────────────────────
function AccuracyPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.trackRecord().then(setData).catch(() => setData(null)).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex justify-center py-16"><Spinner size={6} /></div>;

  if (!data || data.total_predictions < 5) return (
    <div className="px-4 pt-3 text-center py-16" style={{ color:"var(--muted)" }}>
      <div className="text-5xl mb-3">📊</div>
      <div className="font-display font-bold text-xl">Building accuracy data</div>
      <div className="text-sm mt-2 max-w-xs mx-auto">Accuracy tracking needs at least 5 settled predictions. Check back after some matches have finished.</div>
    </div>
  );

  const rate = data.pick_accuracy_pct ?? 0;
  const color = rate >= 55 ? "var(--green)" : rate >= 45 ? "var(--amber)" : "var(--red)";

  return (
    <div className="px-4 pt-3 flex flex-col gap-3">
      <div className="font-display font-black text-xl uppercase tracking-wide mb-1">AI Model Track Record</div>

      {/* Big number */}
      <Card>
        <div className="flex items-end gap-2 mb-2">
          <span className="font-display font-black text-6xl tabular-nums leading-none" style={{ color }}>{fmt(rate, 1)}%</span>
          <span className="text-sm mb-2" style={{ color:"var(--muted)" }}>correct picks</span>
        </div>
        <div className="h-2.5 rounded-full overflow-hidden mb-3" style={{ background:"var(--surface2)" }}>
          <div className="h-full rounded-full transition-all duration-1000" style={{ width:`${rate}%`, background:color }} />
        </div>
        {/* Random baseline reference */}
        <div className="flex items-center gap-2 text-xs" style={{ color:"var(--muted)" }}>
          <div className="flex-1 h-px" style={{ background:"var(--border)" }} />
          <span>33.3% random baseline</span>
          <div className="flex-1 h-px" style={{ background:"var(--border)" }} />
        </div>
        {data.improvement_over_random_pct != null && (
          <div className="text-center mt-2">
            <span className="font-display font-bold text-lg" style={{ color: data.improvement_over_random_pct > 0 ? "var(--green)" : "var(--red)" }}>
              {data.improvement_over_random_pct > 0 ? "+" : ""}{fmt(data.improvement_over_random_pct, 1)}% above random
            </span>
          </div>
        )}
      </Card>

      {/* Stats grid */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { label:"Predictions", v:data.total_predictions, color:"var(--text)" },
          { label:"Correct", v:data.correct_picks, color:"var(--green)" },
          { label:"Incorrect", v:(data.total_predictions - data.correct_picks), color:"var(--red)" },
        ].map(({ label, v, color }) => (
          <Card key={label} className="text-center p-3">
            <div className="font-display font-black text-2xl" style={{ color }}>{v}</div>
            <div className="text-xs mt-0.5" style={{ color:"var(--muted)" }}>{label}</div>
          </Card>
        ))}
      </div>

      {/* Brier score */}
      {data.brier_score != null && (
        <Card>
          <SectionLabel>Model Quality Metrics</SectionLabel>
          <div className="flex items-center justify-between">
            <div>
              <div className="font-display font-bold text-xl tabular-nums">{fmt(data.brier_score, 3)}</div>
              <div className="text-xs mt-0.5" style={{ color:"var(--muted)" }}>Brier Score (lower = better · 0.333 = random)</div>
            </div>
            <div className="text-right">
              <div className="font-display font-bold text-xl" style={{ color: data.brier_score < 0.25 ? "var(--green)" : data.brier_score < 0.3 ? "var(--amber)" : "var(--red)" }}>
                {data.brier_score < 0.25 ? "Excellent" : data.brier_score < 0.28 ? "Good" : data.brier_score < 0.32 ? "Developing" : "Early Stage"}
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Outcome distribution */}
      {data.outcome_distribution && (
        <Card>
          <SectionLabel>Results Distribution</SectionLabel>
          <div className="grid grid-cols-3 gap-2 text-center">
            {[
              { label:"Home Wins", v:data.outcome_distribution.home_wins },
              { label:"Draws", v:data.outcome_distribution.draws },
              { label:"Away Wins", v:data.outcome_distribution.away_wins },
            ].map(({ label, v }) => (
              <div key={label} className="rounded-lg p-2.5" style={{ background:"var(--surface2)" }}>
                <div className="font-display font-black text-xl">{v}</div>
                <div className="text-xs mt-0.5" style={{ color:"var(--muted)" }}>{label}</div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Description */}
      {data.confidence_description && (
        <Card accent="var(--accent)">
          <div className="text-sm leading-relaxed" style={{ color:"var(--muted2)" }}>💡 {data.confidence_description}</div>
        </Card>
      )}
    </div>
  );
}

// ─── Nav ──────────────────────────────────────────────────────────────────────
function Nav({ page, setPage, liveCount }) {
  const tabs = [
    { id:"fixtures", icon:"📅", label:"Fixtures" },
    { id:"live", icon:"🔴", label:"Live", badge:liveCount },
    { id:"value", icon:"💡", label:"Value" },
    { id:"myteams", icon:"★", label:"My Teams" },
    { id:"accuracy", icon:"📊", label:"Accuracy" },
  ];
  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 border-t" style={{ background:"var(--surface)", borderColor:"var(--border)" }}>
      <div className="flex max-w-lg mx-auto">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setPage(t.id)} className="flex-1 flex flex-col items-center py-2 gap-0.5 relative transition-colors">
            <span className="text-base leading-none">{t.icon}</span>
            <span className="font-display font-bold uppercase tracking-wide" style={{ fontSize:9, color: page === t.id ? "var(--accent)" : "var(--muted)" }}>{t.label}</span>
            {t.badge > 0 && (
              <span className="absolute top-1 right-1/4 w-4 h-4 rounded-full text-white flex items-center justify-center font-bold" style={{ background:"var(--green)", fontSize:9 }}>{t.badge}</span>
            )}
            {page === t.id && <div className="absolute bottom-0 left-1/4 right-1/4 h-0.5 rounded-t-full" style={{ background:"var(--accent)" }} />}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── App ──────────────────────────────────────────────────────────────────────
export default function App() {
  const [page, setPage] = useState("fixtures");
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [valueCentre, setValueCentre] = useState([]);
  const [favs, setFavs] = useState(getFavs);
  const [lastRefresh, setLastRefresh] = useState(null);

  const loadMatches = useCallback(async () => {
    try {
      const data = await api.matches();
      setMatches(Array.isArray(data) ? data : []);
      setLastRefresh(new Date());
    } catch {}
    finally { setLoading(false); }
  }, []);

  const loadValue = useCallback(async () => {
    try {
      const data = await api.valueCentre(3);
      setValueCentre(data?.value_matches ?? []);
    } catch {}
  }, []);

  useEffect(() => {
    loadMatches();
    loadValue();
    const t1 = setInterval(loadMatches, 30_000);
    const t2 = setInterval(loadValue, 5 * 60_000);
    return () => { clearInterval(t1); clearInterval(t2); };
  }, [loadMatches, loadValue]);

  const handleFav = useCallback((match) => {
    setFavs(prev => {
      const next = new Set(prev);
      const ids = [match.home_team?.id, match.away_team?.id].filter(Boolean);
      const anyIn = ids.some(id => next.has(id));
      if (anyIn) ids.forEach(id => next.delete(id));
      else ids.forEach(id => next.add(id));
      saveFavs(next);
      return next;
    });
  }, []);

  const liveCount = matches.filter(m => m.status === "live").length;
  const valueCount = valueCentre.length;

  if (selected) return <MatchDetail match={selected} onClose={() => setSelected(null)} favs={favs} onFav={handleFav} />;

  return (
    <div className="max-w-lg mx-auto min-h-screen">
      {/* Header */}
      <div className="px-4 pt-4 pb-2 flex items-center justify-between sticky top-0 z-30" style={{ background:"var(--bg)" }}>
        <div>
          <h1 className="font-display font-black text-2xl uppercase tracking-tight leading-none">Predictor</h1>
          <div className="text-xs mt-0.5 flex items-center gap-2" style={{ color:"var(--muted)" }}>
            {liveCount > 0 && <span style={{ color:"var(--green)" }} className="font-bold">{liveCount} live</span>}
            {valueCount > 0 && <span style={{ color:"var(--amber)" }} className="font-bold">{valueCount} value bets</span>}
            {lastRefresh && <span>· {lastRefresh.toLocaleTimeString([], { hour:"2-digit", minute:"2-digit" })}</span>}
          </div>
        </div>
        <button onClick={() => { loadMatches(); loadValue(); }} className="w-8 h-8 flex items-center justify-center rounded-lg border text-sm" style={{ borderColor:"var(--border)", color:"var(--muted)", background:"var(--surface)" }}>↻</button>
      </div>

      {page === "fixtures" && <FixturesPage matches={matches} loading={loading} favs={favs} onFav={handleFav} onSelect={setSelected} valueCentre={valueCentre} />}
      {page === "live" && <LivePage matches={matches} favs={favs} onFav={handleFav} onSelect={setSelected} valueCentre={valueCentre} />}
      {page === "value" && <ValueCentrePage onSelect={setSelected} />}
      {page === "myteams" && <MyTeamsPage matches={matches} favs={favs} onFav={handleFav} onSelect={setSelected} valueCentre={valueCentre} />}
      {page === "accuracy" && <AccuracyPage />}

      <Nav page={page} setPage={setPage} liveCount={liveCount} />
    </div>
  );
}
