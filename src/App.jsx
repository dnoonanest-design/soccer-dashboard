import { useState, useEffect, useCallback, useRef } from "react";

const FONT_IMPORT = `@import url('https://fonts.googleapis.com/css2?family=Barlow:wght@400;600;700;800;900&family=Barlow+Condensed:wght@600;700;800;900&family=JetBrains+Mono:wght@500;700&display=swap');`;

// ─── LIVE API ─────────────────────────────────────────────────────────────────
const API_BASE = "https://soccer-ai-predictor-production.up.railway.app/api";
const REFRESH_INTERVAL = 60000; // 60 seconds

// Map Railway API match format to Pulse Football format
function mapApiMatch(m) {
  const kickoff = m.kickoff ? new Date(m.kickoff).toLocaleTimeString([], { hour:"2-digit", minute:"2-digit" }) : null;
  const status = m.status === "finished" ? "ft"
               : m.status === "live" ? "live"
               : "upcoming";

  // Determine dayOffset from kickoff date
  const today = new Date(); today.setHours(0,0,0,0);
  const matchDate = m.kickoff ? new Date(m.kickoff) : new Date();
  matchDate.setHours(0,0,0,0);
  const dayOffset = Math.round((matchDate - today) / 86400000);

  // Map league_id to internal league key
  const leagueMap = {
    39:"epl", 140:"laliga", 78:"bundesliga", 135:"seriea", 61:"ligue1",
    2:"ucl", 3:"uel", 88:"eredivisie", 94:"primeira", 253:"mls",
    1:"intl", 4:"intl", 9:"intl", 10:"intl", 32:"intl", 33:"intl", 34:"intl",
    29:"intl", 30:"intl", 307:"saudi", 98:"j1", 292:"kleague",
  };

  const homeKey = m.home_team?.name?.toLowerCase().replace(/\s+/g, "").replace(/[^a-z]/g, "") || String(m.home_team?.id);
  const awayKey = m.away_team?.name?.toLowerCase().replace(/\s+/g, "").replace(/[^a-z]/g, "") || String(m.away_team?.id);

  // Build win probability from odds if available
  const hOdds = m.odds?.home_odds || m.odds?.home_win || null;
  const dOdds = m.odds?.draw_odds || m.odds?.draw || null;
  const aOdds = m.odds?.away_odds || m.odds?.away_win || null;
  let homePct = 45, drawPct = 25, awayPct = 30;
  if (hOdds && dOdds && aOdds) {
    const hI = 1/hOdds, dI = 1/dOdds, aI = 1/aOdds, total = hI+dI+aI;
    homePct = Math.round((hI/total)*100);
    drawPct = Math.round((dI/total)*100);
    awayPct = 100 - homePct - drawPct;
  }

  return {
    id: m.id,
    league: leagueMap[m.league_id] || "intl",
    leagueName: m.league_name || "Unknown League",
    leagueLogo: m.league_logo || null,
    home: homeKey,
    away: awayKey,
    homeName: m.home_team?.name || "Home",
    awayName: m.away_team?.name || "Away",
    homeLogo: m.home_team?.logo || null,
    awayLogo: m.away_team?.logo || null,
    status,
    minute: m.minute || null,
    homeScore: m.score?.home ?? null,
    awayScore: m.score?.away ?? null,
    kickoff,
    homeOdds: hOdds || 2.5,
    drawOdds: dOdds || 3.2,
    awayOdds: aOdds || 2.8,
    homePct,
    drawPct,
    awayPct,
    venue: m.venue || "",
    injuries: { home: [], away: [] },
    events: [],
    subs: [],
    momentum: null,
    stats: null,
    dayOffset,
    isLive: true, // fetched from API
  };
}


// ─── FRONTEND LEAGUE FILTER ──────────────────────────────────────────────────
const BLOCKED_KEYWORDS = [
  'reserve','reserva','res.','u20','u19','u18','u17','u16','u15','u23','u21',
  'youth','amateur','intermedia','regional','segunda b','tercera',
  'sub-20','sub-19','sub-17','sub-23','sub-21','sub-15','sub-18',
  'division b','lower','women','club friendly',
];

function isBlockedLeague(leagueName) {
  if (!leagueName) return false;
  const lower = leagueName.toLowerCase();
  return BLOCKED_KEYWORDS.some(kw => lower.includes(kw));
}

async function fetchLiveMatches() {
  const res = await fetch(`${API_BASE}/matches`);
  if (!res.ok) throw new Error("API error");
  const data = await res.json();
  return Array.isArray(data) ? data.map(mapApiMatch).filter(m => !isBlockedLeague(m.leagueName)) : [];
}

async function fetchUpcomingMatches() {
  const res = await fetch(`${API_BASE}/fixtures/upcoming`);
  if (!res.ok) throw new Error("API error");
  const data = await res.json();
  return Array.isArray(data) ? data.map(mapApiMatch).filter(m => !isBlockedLeague(m.leagueName)) : [];
}

// ─── TEAM DATA ────────────────────────────────────────────────────────────────
const TEAMS = {
  arsenal:    { name:"Arsenal",       emoji:"🔴", color:"#EF0107", league:"epl" },
  mancity:    { name:"Man City",      emoji:"🔵", color:"#6CABDD", league:"epl" },
  liverpool:  { name:"Liverpool",     emoji:"🔴", color:"#C8102E", league:"epl" },
  chelsea:    { name:"Chelsea",       emoji:"🔵", color:"#034694", league:"epl" },
  realmadrid: { name:"Real Madrid",   emoji:"⚪", color:"#FEBE10", league:"laliga" },
  barcelona:  { name:"Barcelona",     emoji:"🔵", color:"#A50044", league:"laliga" },
  atletico:   { name:"Atlético",      emoji:"🔴", color:"#CE3524", league:"laliga" },
  bayern:     { name:"Bayern Munich", emoji:"🔴", color:"#DC052D", league:"bundesliga" },
  dortmund:   { name:"Dortmund",      emoji:"🟡", color:"#FDE100", league:"bundesliga" },
  leverkusen: { name:"Leverkusen",    emoji:"🔴", color:"#E32221", league:"bundesliga" },
  inter:      { name:"Inter Milan",   emoji:"⚫", color:"#0068A8", league:"seriea" },
  juventus:   { name:"Juventus",      emoji:"⬛", color:"#ffffff", league:"seriea" },
  psg:        { name:"PSG",           emoji:"🔵", color:"#004170", league:"ligue1" },
  marseille:  { name:"Marseille",     emoji:"🔵", color:"#2FAEE0", league:"ligue1" },
  france:     { name:"France",        emoji:"🇫🇷", color:"#002395", league:"intl" },
  germany:    { name:"Germany",       emoji:"🇩🇪", color:"#dddddd", league:"intl" },
  brazil:     { name:"Brazil",        emoji:"🇧🇷", color:"#009C3B", league:"intl" },
  argentina:  { name:"Argentina",     emoji:"🇦🇷", color:"#74ACDF", league:"intl" },
  lafc:       { name:"LAFC",          emoji:"⚫", color:"#C39E6D", league:"mls" },
  lagalaxy:   { name:"LA Galaxy",     emoji:"🔵", color:"#00245D", league:"mls" },
};

// ─── PLAYER DATA ─────────────────────────────────────────────────────────────
const TEAM_PLAYERS = {
  arsenal: {
    scorers: [
      { name:"Bukayo Saka",      goals:18, assists:11, apps:32, scoreOdds:2.10, form:"🔥🔥🔥🔥🔥" },
      { name:"Kai Havertz",      goals:14, assists:6,  apps:31, scoreOdds:2.75, form:"🔥🔥🔥🔥⬜" },
      { name:"Leandro Trossard", goals:10, assists:5,  apps:28, scoreOdds:3.50, form:"🔥🔥🔥⬜⬜" },
      { name:"Gabriel Martinelli",goals:9, assists:7,  apps:30, scoreOdds:3.80, form:"🔥🔥⬜🔥⬜" },
    ],
    foulers: [
      { name:"Thomas Partey",    fouls:48, yellows:7, reds:0, foulOdds:2.20 },
      { name:"Declan Rice",      fouls:41, yellows:5, reds:0, foulOdds:2.60 },
      { name:"Oleksandr Zinchenko",fouls:28,yellows:4,reds:0,foulOdds:3.10 },
    ],
  },
  mancity: {
    scorers: [
      { name:"Erling Haaland",   goals:27, assists:5,  apps:29, scoreOdds:1.60, form:"🔥🔥🔥🔥🔥" },
      { name:"Phil Foden",       goals:16, assists:12, apps:31, scoreOdds:2.50, form:"🔥🔥🔥🔥⬜" },
      { name:"Kevin De Bruyne",  goals:8,  assists:16, apps:22, scoreOdds:4.00, form:"🔥🔥⬜⬜🔥" },
      { name:"Jeremy Doku",      goals:7,  assists:9,  apps:28, scoreOdds:3.75, form:"🔥🔥🔥⬜⬜" },
    ],
    foulers: [
      { name:"Rodri",            fouls:52, yellows:9, reds:1, foulOdds:1.90 },
      { name:"Manuel Akanji",    fouls:33, yellows:4, reds:0, foulOdds:2.80 },
      { name:"Matheus Nunes",    fouls:29, yellows:3, reds:0, foulOdds:3.20 },
    ],
  },
  liverpool: {
    scorers: [
      { name:"Mohamed Salah",    goals:24, assists:14, apps:33, scoreOdds:1.80, form:"🔥🔥🔥🔥🔥" },
      { name:"Darwin Nunez",     goals:13, assists:8,  apps:30, scoreOdds:2.60, form:"🔥🔥⬜🔥🔥" },
      { name:"Luis Diaz",        goals:11, assists:6,  apps:31, scoreOdds:3.20, form:"🔥🔥🔥⬜⬜" },
      { name:"Cody Gakpo",       goals:9,  assists:7,  apps:28, scoreOdds:3.60, form:"🔥🔥⬜⬜🔥" },
    ],
    foulers: [
      { name:"Alexis Mac Allister",fouls:44,yellows:6,reds:0, foulOdds:2.30 },
      { name:"Wataru Endo",      fouls:38, yellows:5, reds:0, foulOdds:2.70 },
      { name:"Joe Gomez",        fouls:27, yellows:3, reds:0, foulOdds:3.40 },
    ],
  },
  chelsea: {
    scorers: [
      { name:"Cole Palmer",      goals:22, assists:11, apps:32, scoreOdds:2.00, form:"🔥🔥🔥🔥🔥" },
      { name:"Nicolas Jackson",  goals:14, assists:4,  apps:30, scoreOdds:2.80, form:"🔥🔥🔥⬜⬜" },
      { name:"Raheem Sterling",  goals:8,  assists:7,  apps:26, scoreOdds:3.90, form:"🔥⬜🔥⬜🔥" },
    ],
    foulers: [
      { name:"Moises Caicedo",   fouls:58, yellows:9, reds:1, foulOdds:1.80 },
      { name:"Enzo Fernandez",   fouls:36, yellows:5, reds:0, foulOdds:2.60 },
    ],
  },
  realmadrid: {
    scorers: [
      { name:"Jude Bellingham",  goals:19, assists:13, apps:31, scoreOdds:2.10, form:"🔥🔥🔥🔥🔥" },
      { name:"Vinicius Jr",      goals:20, assists:10, apps:30, scoreOdds:1.95, form:"🔥🔥🔥🔥🔥" },
      { name:"Rodrygo",          goals:11, assists:8,  apps:32, scoreOdds:3.10, form:"🔥🔥🔥⬜⬜" },
      { name:"Federico Valverde",goals:8,  assists:9,  apps:33, scoreOdds:4.20, form:"🔥🔥⬜🔥⬜" },
    ],
    foulers: [
      { name:"Aurelien Tchouameni",fouls:47,yellows:7,reds:0,foulOdds:2.10 },
      { name:"Eduardo Camavinga", fouls:39,yellows:5, reds:0, foulOdds:2.50 },
      { name:"Dani Carvajal",    fouls:31, yellows:6, reds:1, foulOdds:2.90 },
    ],
  },
  barcelona: {
    scorers: [
      { name:"Robert Lewandowski",goals:25,assists:8, apps:30, scoreOdds:1.75, form:"🔥🔥🔥🔥🔥" },
      { name:"Lamine Yamal",     goals:12, assists:15, apps:32, scoreOdds:3.00, form:"🔥🔥🔥🔥⬜" },
      { name:"Raphinha",         goals:14, assists:12, apps:31, scoreOdds:2.60, form:"🔥🔥🔥⬜🔥" },
      { name:"Ferran Torres",    goals:9,  assists:5,  apps:27, scoreOdds:3.80, form:"🔥🔥⬜⬜🔥" },
    ],
    foulers: [
      { name:"Frenkie de Jong",  fouls:42, yellows:6, reds:0, foulOdds:2.30 },
      { name:"Gavi",             fouls:55, yellows:10,reds:1, foulOdds:1.70 },
      { name:"Ronald Araujo",    fouls:36, yellows:7, reds:1, foulOdds:2.50 },
    ],
  },
  atletico: {
    scorers: [
      { name:"Antoine Griezmann",goals:17, assists:9,  apps:32, scoreOdds:2.20, form:"🔥🔥🔥🔥⬜" },
      { name:"Alvaro Morata",    goals:13, assists:6,  apps:29, scoreOdds:2.80, form:"🔥🔥🔥⬜⬜" },
      { name:"Samuel Lino",      goals:7,  assists:8,  apps:28, scoreOdds:4.00, form:"🔥🔥⬜⬜🔥" },
    ],
    foulers: [
      { name:"Koke",             fouls:49, yellows:8, reds:0, foulOdds:2.00 },
      { name:"Marcos Llorente",  fouls:38, yellows:6, reds:0, foulOdds:2.60 },
      { name:"Stefan Savic",     fouls:44, yellows:9, reds:1, foulOdds:2.10 },
    ],
  },
  bayern: {
    scorers: [
      { name:"Harry Kane",       goals:30, assists:9,  apps:32, scoreOdds:1.55, form:"🔥🔥🔥🔥🔥" },
      { name:"Jamal Musiala",    goals:14, assists:13, apps:30, scoreOdds:2.70, form:"🔥🔥🔥🔥⬜" },
      { name:"Leroy Sane",       goals:10, assists:11, apps:29, scoreOdds:3.30, form:"🔥🔥⬜🔥⬜" },
      { name:"Thomas Muller",    goals:7,  assists:14, apps:31, scoreOdds:4.50, form:"🔥⬜🔥⬜🔥" },
    ],
    foulers: [
      { name:"Joshua Kimmich",   fouls:44, yellows:8, reds:0, foulOdds:2.20 },
      { name:"Konrad Laimer",    fouls:51, yellows:9, reds:1, foulOdds:1.95 },
      { name:"Min-jae Kim",      fouls:35, yellows:6, reds:0, foulOdds:2.80 },
    ],
  },
  dortmund: {
    scorers: [
      { name:"Niclas Fullkrug",  goals:14, assists:4,  apps:28, scoreOdds:2.50, form:"🔥🔥🔥⬜⬜" },
      { name:"Julian Brandt",    goals:10, assists:12, apps:31, scoreOdds:3.40, form:"🔥🔥🔥🔥⬜" },
      { name:"Karim Adeyemi",    goals:9,  assists:7,  apps:27, scoreOdds:3.60, form:"🔥🔥⬜🔥⬜" },
    ],
    foulers: [
      { name:"Emre Can",         fouls:53, yellows:10,reds:1, foulOdds:1.80 },
      { name:"Nico Schlotterbeck",fouls:38,yellows:7, reds:0, foulOdds:2.40 },
    ],
  },
  leverkusen: {
    scorers: [
      { name:"Florian Wirtz",    goals:16, assists:18, apps:31, scoreOdds:2.30, form:"🔥🔥🔥🔥🔥" },
      { name:"Granit Xhaka",     goals:8,  assists:10, apps:32, scoreOdds:4.00, form:"🔥🔥🔥⬜⬜" },
      { name:"Victor Boniface",  goals:13, assists:6,  apps:26, scoreOdds:2.70, form:"🔥🔥🔥🔥⬜" },
    ],
    foulers: [
      { name:"Granit Xhaka",     fouls:60, yellows:11,reds:1, foulOdds:1.65 },
      { name:"Edmond Tapsoba",   fouls:34, yellows:5, reds:0, foulOdds:2.90 },
    ],
  },
  inter: {
    scorers: [
      { name:"Lautaro Martinez", goals:22, assists:7,  apps:31, scoreOdds:1.85, form:"🔥🔥🔥🔥🔥" },
      { name:"Marcus Thuram",    goals:15, assists:9,  apps:30, scoreOdds:2.40, form:"🔥🔥🔥🔥⬜" },
      { name:"Hakan Calhanoglu", goals:9,  assists:13, apps:29, scoreOdds:3.80, form:"🔥🔥⬜🔥⬜" },
    ],
    foulers: [
      { name:"Nicolo Barella",   fouls:55, yellows:10,reds:0, foulOdds:1.80 },
      { name:"Hakan Calhanoglu", fouls:41, yellows:7, reds:1, foulOdds:2.20 },
      { name:"Alessandro Bastoni",fouls:32,yellows:6, reds:0, foulOdds:2.90 },
    ],
  },
  juventus: {
    scorers: [
      { name:"Dusan Vlahovic",   goals:17, assists:4,  apps:30, scoreOdds:2.10, form:"🔥🔥🔥⬜🔥" },
      { name:"Federico Chiesa",  goals:9,  assists:7,  apps:24, scoreOdds:3.50, form:"🔥🔥⬜⬜🔥" },
      { name:"Adrien Rabiot",    goals:6,  assists:8,  apps:31, scoreOdds:4.80, form:"⬜🔥⬜🔥⬜" },
    ],
    foulers: [
      { name:"Manuel Locatelli", fouls:48, yellows:9, reds:0, foulOdds:2.00 },
      { name:"Gleison Bremer",   fouls:40, yellows:8, reds:1, foulOdds:2.30 },
    ],
  },
  psg: {
    scorers: [
      { name:"Kylian Mbappe",    goals:28, assists:8,  apps:29, scoreOdds:1.65, form:"🔥🔥🔥🔥🔥" },
      { name:"Ousmane Dembele",  goals:12, assists:14, apps:31, scoreOdds:2.80, form:"🔥🔥🔥🔥⬜" },
      { name:"Marco Asensio",    goals:8,  assists:6,  apps:28, scoreOdds:4.20, form:"🔥🔥⬜⬜🔥" },
      { name:"Goncalo Ramos",    goals:11, assists:5,  apps:25, scoreOdds:3.10, form:"🔥🔥🔥⬜⬜" },
    ],
    foulers: [
      { name:"Fabian Ruiz",      fouls:43, yellows:7, reds:0, foulOdds:2.20 },
      { name:"Warren Zaire-Emery",fouls:36,yellows:5, reds:0, foulOdds:2.70 },
      { name:"Marquinhos",       fouls:31, yellows:6, reds:0, foulOdds:3.10 },
    ],
  },
  marseille: {
    scorers: [
      { name:"Pierre-Emerick Aubameyang",goals:14,assists:6,apps:28,scoreOdds:2.60,form:"🔥🔥🔥⬜⬜" },
      { name:"Iliman Ndiaye",    goals:10, assists:8,  apps:30, scoreOdds:3.20, form:"🔥🔥⬜🔥⬜" },
    ],
    foulers: [
      { name:"Valentin Rongier", fouls:46, yellows:8, reds:0, foulOdds:2.10 },
      { name:"Leonardo Balerdi", fouls:38, yellows:9, reds:1, foulOdds:2.30 },
    ],
  },
  france: {
    scorers: [
      { name:"Kylian Mbappe",    goals:45, assists:26, apps:80, scoreOdds:1.80, form:"🔥🔥🔥🔥🔥" },
      { name:"Antoine Griezmann",goals:44, assists:27, apps:125,scoreOdds:3.20, form:"🔥🔥🔥⬜🔥" },
      { name:"Ousmane Dembele",  goals:15, assists:12, apps:48, scoreOdds:3.80, form:"🔥🔥⬜🔥⬜" },
      { name:"Marcus Thuram",    goals:12, assists:6,  apps:32, scoreOdds:3.50, form:"🔥🔥🔥⬜⬜" },
    ],
    foulers: [
      { name:"N'Golo Kante",     fouls:3,  yellows:1, reds:0, foulOdds:5.00 },
      { name:"Aurelien Tchouameni",fouls:18,yellows:3,reds:0, foulOdds:2.80 },
      { name:"Jules Kounde",     fouls:14, yellows:4, reds:0, foulOdds:3.20 },
    ],
  },
  germany: {
    scorers: [
      { name:"Florian Wirtz",    goals:12, assists:14, apps:30, scoreOdds:2.50, form:"🔥🔥🔥🔥🔥" },
      { name:"Jamal Musiala",    goals:14, assists:11, apps:38, scoreOdds:2.40, form:"🔥🔥🔥🔥⬜" },
      { name:"Kai Havertz",      goals:22, assists:8,  apps:58, scoreOdds:2.90, form:"🔥🔥🔥⬜⬜" },
      { name:"Leroy Sane",       goals:16, assists:18, apps:55, scoreOdds:3.20, form:"🔥🔥⬜🔥⬜" },
    ],
    foulers: [
      { name:"Leon Goretzka",    fouls:32, yellows:6, reds:0, foulOdds:2.40 },
      { name:"Joshua Kimmich",   fouls:28, yellows:5, reds:0, foulOdds:2.70 },
    ],
  },
  brazil: {
    scorers: [
      { name:"Vinicius Jr",      goals:22, assists:12, apps:48, scoreOdds:1.90, form:"🔥🔥🔥🔥🔥" },
      { name:"Rodrygo",          goals:15, assists:10, apps:45, scoreOdds:2.80, form:"🔥🔥🔥🔥⬜" },
      { name:"Raphinha",         goals:18, assists:14, apps:50, scoreOdds:2.60, form:"🔥🔥🔥⬜🔥" },
      { name:"Endrick",          goals:8,  assists:3,  apps:18, scoreOdds:3.40, form:"🔥🔥⬜🔥⬜" },
    ],
    foulers: [
      { name:"Casemiro",         fouls:28, yellows:6, reds:0, foulOdds:2.80 },
      { name:"Bruno Guimaraes",  fouls:24, yellows:4, reds:0, foulOdds:3.10 },
    ],
  },
  argentina: {
    scorers: [
      { name:"Lionel Messi",     goals:109,assists:56, apps:187,scoreOdds:2.20, form:"🔥🔥🔥🔥🔥" },
      { name:"Lautaro Martinez", goals:30, assists:14, apps:68, scoreOdds:2.30, form:"🔥🔥🔥🔥⬜" },
      { name:"Julian Alvarez",   goals:20, assists:12, apps:55, scoreOdds:3.00, form:"🔥🔥🔥⬜⬜" },
      { name:"Angel Di Maria",   goals:31, assists:29, apps:131,scoreOdds:4.20, form:"🔥⬜🔥⬜🔥" },
    ],
    foulers: [
      { name:"Rodrigo De Paul",  fouls:38, yellows:8, reds:0, foulOdds:2.10 },
      { name:"Cristian Romero",  fouls:44, yellows:9, reds:1, foulOdds:1.90 },
      { name:"Lisandro Martinez",fouls:30, yellows:6, reds:0, foulOdds:2.60 },
    ],
  },
  lafc: {
    scorers: [
      { name:"Carlos Vela",      goals:10, assists:8,  apps:22, scoreOdds:2.90, form:"🔥🔥🔥⬜⬜" },
      { name:"Denis Bouanga",    goals:14, assists:6,  apps:26, scoreOdds:2.40, form:"🔥🔥🔥🔥⬜" },
    ],
    foulers: [
      { name:"Kellyn Acosta",    fouls:38, yellows:7, reds:0, foulOdds:2.20 },
      { name:"Aaron Long",       fouls:29, yellows:5, reds:0, foulOdds:2.80 },
    ],
  },
  lagalaxy: {
    scorers: [
      { name:"Riqui Puig",       goals:8,  assists:10, apps:24, scoreOdds:3.40, form:"🔥🔥⬜🔥⬜" },
      { name:"Gabriel Pec",      goals:11, assists:7,  apps:25, scoreOdds:2.80, form:"🔥🔥🔥⬜⬜" },
    ],
    foulers: [
      { name:"Raheem Edwards",   fouls:31, yellows:5, reds:0, foulOdds:2.60 },
      { name:"Eriq Zavaleta",    fouls:27, yellows:4, reds:0, foulOdds:3.00 },
    ],
  },
};

const LINEUPS = {
  arsenal:    ["Raya","White","Saliba","Gabriel","Zinchenko","Odegaard","Partey","Rice","Saka","Havertz","Martinelli"],
  mancity:    ["Ederson","Walker","Dias","Akanji","Gvardiol","Rodri","De Bruyne","Silva","Doku","Haaland","Foden"],
  liverpool:  ["Alisson","Alexander-Arnold","Konate","Van Dijk","Robertson","Mac Allister","Gravenberch","Salah","Nunez","Diaz","Jones"],
  realmadrid: ["Courtois","Carvajal","Militao","Alaba","Mendy","Valverde","Kroos","Camavinga","Bellingham","Vinicius","Rodrygo"],
  barcelona:  ["ter Stegen","Kounde","Araujo","Inigo","Balde","Pedri","Gavi","de Jong","Yamal","Lewandowski","Raphinha"],
  france:     ["Maignan","Pavard","Upamecano","Saliba","Theo","Tchouameni","Camavinga","Griezmann","Dembele","Mbappe","Thuram"],
  germany:    ["Neuer","Kimmich","Rudiger","Schlotterbeck","Raum","Kroos","Andrich","Musiala","Havertz","Gnabry","Wirtz"],
  brazil:     ["Alisson","Danilo","Marquinhos","Gabriel M","Guilherme","Casemiro","Lucas P","Raphinha","Rodrygo","Vinicius","Endrick"],
  argentina:  ["Martinez","Molina","Romero","Lisandro","Acuna","De Paul","Enzo","Mac Allister","Di Maria","Messi","Lautaro"],
  chelsea:    ["Sanchez","Gusto","Disasi","Colwill","Chilwell","Caicedo","Fernandez","Gallagher","Palmer","Jackson","Sterling"],
  psg:        ["Donnarumma","Hakimi","Marquinhos","Pacho","Nuno M","Vitinha","Fabian","Lee K","Dembele","Ramos","Barcola"],
  bayern:     ["Neuer","Kimmich","Kim","Dier","Davies","Laimer","Goretzka","Musiala","Sane","Kane","Muller"],
  dortmund:   ["Kobel","Ryerson","Hummels","Schlotterbeck","Maatsen","Can","Brandt","Sancho","Sabitzer","Fullkrug","Adeyemi"],
  leverkusen: ["Hradecky","Frimpong","Tah","Tapsoba","Grimaldo","Xhaka","Andrich","Wirtz","Adli","Boniface","Hofmann"],
  inter:      ["Sommer","Pavard","Acerbi","Bastoni","Darmian","Barella","Calhanoglu","Mkhitaryan","Dumfries","Martinez","Thuram"],
  juventus:   ["Szczesny","Danilo","Bremer","Gatti","Cambiaso","Fagioli","Locatelli","Rabiot","Kostic","Vlahovic","Chiesa"],
  atletico:   ["Oblak","Molina","Gimenez","Savic","Reinildo","Koke","Llorente","De Paul","Correa","Griezmann","Morata"],
  marseille:  ["Pau Lopez","Clauss","Balerdi","Mbemba","Murillo","Rongier","Veretout","Harit","Ndiaye","Sanchez","Aubameyang"],
  lafc:       ["Lloris","Segura","Long","Hincapie","Hollingshead","Acosta","Bogdan","Arango","Bouanga","Vela","Cifuentes"],
  lagalaxy:   ["Bond","Yamane","Zavaleta","Yoshida","Thomas","Edwards","Grandsir","Puig","Pec","Riquelme","Fagundez"],
};

const LEAGUES_LIST = [
  { id:"all",        label:"All" },
  { id:"live",       label:"🔴 Live" },
  { id:"intl",       label:"🌍 Internationals" },
  { id:"ucl",        label:"UCL" },
  { id:"epl",        label:"Premier League" },
  { id:"laliga",     label:"La Liga" },
  { id:"bundesliga", label:"Bundesliga" },
  { id:"seriea",     label:"Serie A" },
  { id:"ligue1",     label:"Ligue 1" },
  { id:"mls",        label:"MLS" },
];

const DAYS_SHORT = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

function getDays() {
  const today = new Date();
  return Array.from({length:8},(_,i) => {
    const d = new Date(today); d.setDate(today.getDate() + (i-1));
    return { label: i===1?"Today":i===2?"Tomorrow":DAYS_SHORT[d.getDay()], date:d.toLocaleDateString("en-GB",{day:"numeric",month:"short"}), offset:i-1 };
  });
}

function makeMomentum() {
  return Array.from({length:20},(_,i)=>({ min:(i+1)*4, home:Math.round(30+Math.random()*40), away:Math.round(30+Math.random()*40) }));
}
function makeStats() {
  return { possession:[54,46], shots:[9,6], shotsOnTarget:[4,2], corners:[6,3], fouls:[10,12], yellowCards:[1,2], passes:[334,291], passAccuracy:[88,82], xG:[1.6,0.9] };
}
function makeEvents(f) {
  const e=[];
  if(f.homeScore>0) e.push({min:22,type:"goal",team:"home",player:"Striker"});
  if(f.homeScore>1) e.push({min:63,type:"goal",team:"home",player:"Winger"});
  if(f.awayScore>0) e.push({min:44,type:"goal",team:"away",player:"Forward"});
  if(f.awayScore>1) e.push({min:79,type:"goal",team:"away",player:"Midfielder"});
  e.push({min:33,type:"yellow",team:"home",player:"Defender"});
  return e.sort((a,b)=>a.min-b.min);
}
function makeSubs() {
  return [{min:60,team:"home",out:"Midfielder A",in:"Sub A"},{min:73,team:"away",out:"Winger B",in:"Sub B"}];
}

const RAW_FIXTURES = [
  {id:1,  league:"intl",       leagueName:"UEFA Nations League",    home:"france",     away:"germany",    status:"live",     minute:67, homeScore:1,awayScore:1, homeOdds:2.1, drawOdds:3.2,awayOdds:3.5, homePct:48,drawPct:26,awayPct:26, venue:"Parc des Princes",  injuries:{home:["Mbappe (doubt)"],away:["Gnabry (out)"]},   dayOffset:0},
  {id:2,  league:"ucl",        leagueName:"Champions League",       home:"realmadrid", away:"barcelona",  status:"live",     minute:82, homeScore:2,awayScore:1, homeOdds:1.9, drawOdds:3.6,awayOdds:3.8, homePct:62,drawPct:18,awayPct:20, venue:"Bernabeu",           injuries:{home:["Alaba (out)"],away:["Pedri (doubt)"]},       dayOffset:0},
  {id:3,  league:"epl",        leagueName:"Premier League",         home:"arsenal",    away:"mancity",    status:"upcoming", kickoff:"20:00", homeOdds:3.0,drawOdds:3.4,awayOdds:2.2, homePct:38,drawPct:24,awayPct:38, venue:"Emirates Stadium",   injuries:{home:["Tierney (out)"],away:["De Bruyne (doubt)"]},  dayOffset:0},
  {id:4,  league:"intl",       leagueName:"CONMEBOL Qualifier",     home:"brazil",     away:"argentina",  status:"upcoming", kickoff:"22:00", homeOdds:2.3,drawOdds:3.1,awayOdds:2.9, homePct:42,drawPct:28,awayPct:30, venue:"Maracana",           injuries:{home:["Neymar (out)"],away:[]},                     dayOffset:0},
  {id:5,  league:"laliga",     leagueName:"La Liga",                home:"barcelona",  away:"atletico",   status:"upcoming", kickoff:"21:00", homeOdds:1.85,drawOdds:3.5,awayOdds:4.0,homePct:54,drawPct:22,awayPct:24, venue:"Olimpic Stadium",    injuries:{home:["Fati (doubt)"],away:["Felix (doubt)"]},      dayOffset:0},
  {id:6,  league:"bundesliga", leagueName:"Bundesliga",             home:"leverkusen", away:"dortmund",   status:"upcoming", kickoff:"18:30", homeOdds:2.0,drawOdds:3.3,awayOdds:3.6, homePct:45,drawPct:25,awayPct:30, venue:"BayArena",           injuries:{home:[],away:["Sancho (out)"]},                     dayOffset:0},
  {id:7,  league:"seriea",     leagueName:"Serie A",                home:"inter",      away:"juventus",   status:"upcoming", kickoff:"20:45", homeOdds:2.1,drawOdds:3.2,awayOdds:3.3, homePct:44,drawPct:30,awayPct:26, venue:"San Siro",           injuries:{home:["Bastoni (doubt)"],away:["Chiesa (out)"]},    dayOffset:0},
  {id:8,  league:"ligue1",     leagueName:"Ligue 1",                home:"psg",        away:"marseille",  status:"upcoming", kickoff:"21:05", homeOdds:1.5,drawOdds:4.0,awayOdds:5.5, homePct:65,drawPct:18,awayPct:17, venue:"Parc des Princes",  injuries:{home:[],away:["Payet (out)"]},                      dayOffset:0},
  {id:9,  league:"mls",        leagueName:"MLS",                    home:"lafc",       away:"lagalaxy",   status:"ft",       homeScore:3,awayScore:2, homeOdds:2.2,drawOdds:3.1,awayOdds:3.0, homePct:52,drawPct:22,awayPct:26, venue:"BMO Stadium",       injuries:{home:[],away:[]},                                  dayOffset:0},
  {id:10, league:"epl",        leagueName:"Premier League",         home:"liverpool",  away:"chelsea",    status:"ft",       homeScore:1,awayScore:2, homeOdds:1.8,drawOdds:3.5,awayOdds:4.0, homePct:55,drawPct:20,awayPct:25, venue:"Anfield",           injuries:{home:[],away:[]},                                  dayOffset:0},
  {id:11, league:"epl",        leagueName:"Premier League",         home:"mancity",    away:"chelsea",    status:"upcoming", kickoff:"15:00", homeOdds:1.7,drawOdds:3.8,awayOdds:4.5, homePct:60,drawPct:20,awayPct:20, venue:"Etihad Stadium",     injuries:{home:[],away:[]},                                  dayOffset:1},
  {id:12, league:"ucl",        leagueName:"Champions League",       home:"barcelona",  away:"inter",      status:"upcoming", kickoff:"20:00", homeOdds:2.0,drawOdds:3.3,awayOdds:3.4, homePct:50,drawPct:24,awayPct:26, venue:"Olimpic Stadium",    injuries:{home:[],away:[]},                                  dayOffset:1},
  {id:13, league:"laliga",     leagueName:"La Liga",                home:"realmadrid", away:"atletico",   status:"upcoming", kickoff:"21:00", homeOdds:1.9,drawOdds:3.4,awayOdds:3.8, homePct:55,drawPct:22,awayPct:23, venue:"Bernabeu",           injuries:{home:[],away:[]},                                  dayOffset:2},
  {id:14, league:"bundesliga", leagueName:"Bundesliga",             home:"bayern",     away:"dortmund",   status:"upcoming", kickoff:"18:30", homeOdds:1.6,drawOdds:3.9,awayOdds:5.0, homePct:62,drawPct:20,awayPct:18, venue:"Allianz Arena",      injuries:{home:[],away:[]},                                  dayOffset:2},
  {id:15, league:"intl",       leagueName:"Friendly International", home:"france",     away:"brazil",     status:"upcoming", kickoff:"20:45", homeOdds:2.2,drawOdds:3.0,awayOdds:3.1, homePct:45,drawPct:28,awayPct:27, venue:"Stade de France",    injuries:{home:[],away:[]},                                  dayOffset:3},
  {id:16, league:"seriea",     leagueName:"Serie A",                home:"juventus",   away:"inter",      status:"upcoming", kickoff:"20:45", homeOdds:2.8,drawOdds:3.1,awayOdds:2.5, homePct:38,drawPct:28,awayPct:34, venue:"Juventus Stadium",   injuries:{home:[],away:[]},                                  dayOffset:3},
  {id:17, league:"ligue1",     leagueName:"Ligue 1",                home:"marseille",  away:"psg",        status:"upcoming", kickoff:"21:00", homeOdds:4.5,drawOdds:3.8,awayOdds:1.7, homePct:22,drawPct:20,awayPct:58, venue:"Velodrome",          injuries:{home:[],away:[]},                                  dayOffset:4},
  {id:18, league:"epl",        leagueName:"Premier League",         home:"arsenal",    away:"liverpool",  status:"upcoming", kickoff:"17:30", homeOdds:2.5,drawOdds:3.2,awayOdds:2.7, homePct:42,drawPct:26,awayPct:32, venue:"Emirates Stadium",   injuries:{home:[],away:[]},                                  dayOffset:4},
  {id:19, league:"mls",        leagueName:"MLS",                    home:"lagalaxy",   away:"lafc",       status:"upcoming", kickoff:"22:30", homeOdds:2.8,drawOdds:3.0,awayOdds:2.4, homePct:36,drawPct:26,awayPct:38, venue:"Dignity Health Park", injuries:{home:[],away:[]},                                 dayOffset:5},
  {id:20, league:"ucl",        leagueName:"Champions League",       home:"realmadrid", away:"inter",      status:"upcoming", kickoff:"20:00", homeOdds:1.8,drawOdds:3.5,awayOdds:4.2, homePct:56,drawPct:22,awayPct:22, venue:"Bernabeu",           injuries:{home:[],away:[]},                                  dayOffset:5},
  {id:21, league:"bundesliga", leagueName:"Bundesliga",             home:"dortmund",   away:"leverkusen", status:"upcoming", kickoff:"15:30", homeOdds:2.8,drawOdds:3.1,awayOdds:2.4, homePct:40,drawPct:24,awayPct:36, venue:"Signal Iduna Park",  injuries:{home:[],away:[]},                                  dayOffset:6},
  {id:22, league:"laliga",     leagueName:"La Liga",                home:"atletico",   away:"barcelona",  status:"upcoming", kickoff:"18:00", homeOdds:3.0,drawOdds:3.2,awayOdds:2.2, homePct:36,drawPct:26,awayPct:38, venue:"Metropolitano",      injuries:{home:[],away:[]},                                  dayOffset:6},
];

const ALL_FIXTURES = RAW_FIXTURES.map(f => ({
  ...f,
  momentum: f.status==="live" ? makeMomentum() : null,
  stats:    (f.status==="live"||f.status==="ft") ? makeStats() : null,
  events:   (f.status==="live"||f.status==="ft") ? makeEvents(f) : [],
  subs:     f.status==="live" ? makeSubs() : [],
}));

// ─── AI ENGINE ────────────────────────────────────────────────────────────────
class AIEngine {
  constructor(d) {
    this.predictions   = d?.predictions   || [];
    this.weights       = d?.weights       || {form:0.30,odds:0.25,h2h:0.20,home:0.15,xg:0.10};
    this.accuracy      = d?.accuracy      || {total:0,correct:0,pct:0};
    this.leagueAcc     = d?.leagueAcc     || {};
    this.streak        = d?.streak        || 0;
    this.xp            = d?.xp            || 0;
  }
  record(matchId, pick, match) {
    if(this.predictions.find(p=>p.matchId===matchId&&!p.resolved)) return;
    this.predictions.push({matchId,pick,ts:Date.now(),league:match.league,odds:pick==="home"?match.homeOdds:pick==="away"?match.awayOdds:match.drawOdds});
  }
  confidence(match, pick) {
    const base = pick==="home"?match.homePct:pick==="away"?match.awayPct:match.drawPct;
    const imp  = pick==="home"?(1/match.homeOdds)*100:pick==="away"?(1/match.awayOdds)*100:(1/match.drawOdds)*100;
    return Math.min(95,Math.max(20,Math.round(base*this.weights.form + imp*this.weights.odds + (this.accuracy.pct||50)*this.weights.h2h)));
  }
  serialize() { return {predictions:this.predictions,weights:this.weights,accuracy:this.accuracy,leagueAcc:this.leagueAcc,streak:this.streak,xp:this.xp}; }
}

// ─── SMALL COMPONENTS ─────────────────────────────────────────────────────────
const LiveDot = ({s=7}) => <span style={{width:s,height:s,borderRadius:"50%",background:"#00e676",display:"inline-block",boxShadow:"0 0 6px #00e676",animation:"pulseDot 1.3s infinite"}} />;

function ProbBar({h=5,hp,dp,ap}) {
  return (
    <div style={{display:"flex",borderRadius:3,overflow:"hidden",height:h,gap:2,marginTop:7}}>
      <div style={{width:`${hp}%`,background:"linear-gradient(90deg,#00e676,#00b050)",transition:"width .6s"}}/>
      <div style={{width:`${dp}%`,background:"#252d42"}}/>
      <div style={{width:`${ap}%`,background:"linear-gradient(90deg,#ff5252,#c62828)",transition:"width .6s"}}/>
    </div>
  );
}

function OddsBox({label,val,color="#8890a8",small=false}) {
  return (
    <div style={{flex:1,background:"rgba(255,255,255,0.04)",borderRadius:8,padding:small?"5px 3px":"7px 4px",textAlign:"center"}}>
      <div style={{fontSize:9,color:"#3a4258",fontWeight:700,letterSpacing:"0.07em",textTransform:"uppercase",marginBottom:2}}>{label}</div>
      <div style={{fontSize:small?13:15,fontWeight:800,color,fontFamily:"'JetBrains Mono',monospace"}}>{val}</div>
    </div>
  );
}

function StatBar({label,h,a}) {
  const t=h+a||1, hp=Math.round((h/t)*100);
  return (
    <div style={{marginBottom:9}}>
      <div style={{display:"flex",justifyContent:"space-between",fontSize:12,marginBottom:3}}>
        <span style={{fontWeight:700,color:"#00e676"}}>{h}</span>
        <span style={{fontSize:10,color:"#3a4258",fontWeight:700,letterSpacing:"0.06em",textTransform:"uppercase"}}>{label}</span>
        <span style={{fontWeight:700,color:"#ff5252"}}>{a}</span>
      </div>
      <div style={{display:"flex",borderRadius:3,overflow:"hidden",height:4,gap:1}}>
        <div style={{width:`${hp}%`,background:"#00e676",transition:"width .6s"}}/>
        <div style={{width:`${100-hp}%`,background:"#ff5252"}}/>
      </div>
    </div>
  );
}

function MomentumLine({data}) {
  if(!data||!data.length) return null;
  const W=340,H=60;
  const hPath=data.map((d,i)=>`${i===0?"M":"L"}${(i/(data.length-1))*(W-20)+10},${H-(d.home/100)*(H-10)}`).join(" ");
  const aPath=data.map((d,i)=>`${i===0?"M":"L"}${(i/(data.length-1))*(W-20)+10},${H-(d.away/100)*(H-10)}`).join(" ");
  return (
    <div style={{marginTop:10}}>
      <div style={{fontSize:9,color:"#3a4258",fontWeight:700,letterSpacing:"0.1em",textTransform:"uppercase",marginBottom:4}}>Match Momentum</div>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{overflow:"visible"}}>
        <path d={hPath} fill="none" stroke="#00e676" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        <path d={aPath} fill="none" stroke="#ff5252" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
      <div style={{display:"flex",justifyContent:"space-between",fontSize:9,color:"#3a4258",marginTop:1}}>
        <span>0'</span><span style={{display:"flex",gap:10}}><span style={{color:"#00e676"}}>● Home</span><span style={{color:"#ff5252"}}>● Away</span></span><span>90'</span>
      </div>
    </div>
  );
}

function PitchLineup({homeId,awayId}) {
  const hNames=LINEUPS[homeId]||Array.from({length:11},(_,i)=>`P${i+1}`);
  const aNames=LINEUPS[awayId]||Array.from({length:11},(_,i)=>`P${i+1}`);
  const hTeam=TEAMS[homeId]||{color:"#00e676"};
  const aTeam=TEAMS[awayId]||{color:"#ff5252"};
  const rows=(names,color,flip=false)=>{
    const groups=flip?[[8,9,10],[5,6,7],[1,2,3,4],[0]]:[[0],[1,2,3,4],[5,6,7],[8,9,10]];
    return groups.map((grp,ri)=>(
      <div key={ri} style={{display:"flex",justifyContent:"center",gap:4,marginBottom:4}}>
        {grp.map(i=>(
          <div key={i} style={{display:"flex",flexDirection:"column",alignItems:"center",width:50}}>
            <div style={{width:28,height:28,borderRadius:"50%",background:`${color}22`,border:`2px solid ${color}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:800,color:"#fff"}}>{i+1}</div>
            <div style={{fontSize:8,color:"#8890a8",marginTop:2,textAlign:"center",maxWidth:50,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{names[i]?.split(" ").pop()}</div>
          </div>
        ))}
      </div>
    ));
  };
  return (
    <div style={{background:"linear-gradient(180deg,#081a0e 0%,#0c2212 50%,#081a0e 100%)",borderRadius:12,padding:"14px 6px",border:"1px solid rgba(0,230,118,0.08)"}}>
      <div style={{fontSize:10,fontWeight:800,color:"#00e676",letterSpacing:"0.1em",textTransform:"uppercase",textAlign:"center",marginBottom:10}}>
        {hTeam.name||homeId} {hTeam.emoji} vs {aTeam.emoji} {aTeam.name||awayId}
      </div>
      {rows(hNames,hTeam.color,false)}
      <div style={{height:1,background:"rgba(255,255,255,0.07)",margin:"8px 10%"}}/>
      {rows(aNames,aTeam.color,true)}
    </div>
  );
}

// ─── TOP SCORERS & FOULERS PANEL ──────────────────────────────────────────────
function PlayerStatsPanel({homeId, awayId, homeTeam, awayTeam}) {
  const [side, setSide] = useState("home");
  const teamId   = side==="home" ? homeId : awayId;
  const team     = side==="home" ? homeTeam : awayTeam;
  const data     = TEAM_PLAYERS[teamId] || {scorers:[],foulers:[]};
  const [view, setView] = useState("scorers");

  return (
    <div style={{marginTop:4}}>
      {/* Home / Away toggle */}
      <div style={{display:"flex",gap:6,marginBottom:10}}>
        {[{id:"home",label:`${homeTeam.emoji} ${homeTeam.name}`},{id:"away",label:`${awayTeam.emoji} ${awayTeam.name}`}].map(t=>(
          <button key={t.id} onClick={()=>setSide(t.id)} style={{
            flex:1,padding:"7px 6px",borderRadius:8,border:"none",cursor:"pointer",fontFamily:"inherit",
            fontWeight:800,fontSize:11,letterSpacing:"0.04em",transition:"all 0.2s",
            background: side===t.id ? (t.id==="home"?homeTeam.color:awayTeam.color) : "rgba(255,255,255,0.05)",
            color: side===t.id ? "#080c14" : "#6b7280",
          }}>{t.label}</button>
        ))}
      </div>

      {/* Scorers / Foulers toggle */}
      <div style={{display:"flex",background:"rgba(255,255,255,0.03)",borderRadius:8,padding:3,marginBottom:12,gap:3}}>
        {[{id:"scorers",icon:"⚽",label:"Top Scorers"},{id:"foulers",icon:"🟨",label:"Top Foulers"}].map(v=>(
          <button key={v.id} onClick={()=>setView(v.id)} style={{
            flex:1,padding:"6px 4px",borderRadius:6,border:"none",cursor:"pointer",fontFamily:"inherit",
            fontWeight:800,fontSize:11,transition:"all 0.2s",
            background: view===v.id ? "rgba(0,230,118,0.15)" : "transparent",
            color: view===v.id ? "#00e676" : "#4a5568",
          }}>{v.icon} {v.label}</button>
        ))}
      </div>

      {/* Scorers list */}
      {view==="scorers" && (
        <div>
          <div style={{display:"grid",gridTemplateColumns:"1fr auto auto auto auto",gap:"0 8px",marginBottom:6,paddingBottom:4,borderBottom:"1px solid rgba(255,255,255,0.05)"}}>
            {["Player","G","A","Apps","Score Odds"].map(h=>(
              <div key={h} style={{fontSize:9,color:"#3a4258",fontWeight:700,letterSpacing:"0.08em",textTransform:"uppercase",textAlign:h==="Player"?"left":"center"}}>{h}</div>
            ))}
          </div>
          {data.scorers.map((p,i)=>(
            <div key={i} style={{display:"grid",gridTemplateColumns:"1fr auto auto auto auto",gap:"0 8px",padding:"8px 0",borderBottom:"1px solid rgba(255,255,255,0.03)",alignItems:"center"}}>
              <div>
                <div style={{fontSize:13,fontWeight:700,color:"#e8ecf4"}}>{p.name}</div>
                <div style={{fontSize:10,color:"#4a5568",marginTop:1}}>{p.form}</div>
              </div>
              <div style={{textAlign:"center",fontSize:14,fontWeight:900,color:"#00e676",fontFamily:"'JetBrains Mono',monospace"}}>{p.goals}</div>
              <div style={{textAlign:"center",fontSize:13,fontWeight:700,color:"#6b7280",fontFamily:"'JetBrains Mono',monospace"}}>{p.assists}</div>
              <div style={{textAlign:"center",fontSize:12,color:"#4a5568"}}>{p.apps}</div>
              <div>
                <div style={{
                  background: p.scoreOdds < 2.5 ? "rgba(0,230,118,0.15)" : p.scoreOdds < 3.5 ? "rgba(251,191,36,0.12)" : "rgba(255,82,82,0.10)",
                  color:      p.scoreOdds < 2.5 ? "#00e676"               : p.scoreOdds < 3.5 ? "#fbbf24"              : "#ff7070",
                  borderRadius:6,padding:"3px 7px",textAlign:"center",fontSize:12,fontWeight:800,fontFamily:"'JetBrains Mono',monospace",
                }}>{p.scoreOdds.toFixed(2)}</div>
              </div>
            </div>
          ))}
          {data.scorers.length===0 && <div style={{textAlign:"center",padding:"20px 0",color:"#3a4258",fontSize:12}}>No player data</div>}

          {/* Value scorer callout */}
          {data.scorers.length>0 && (
            <div style={{marginTop:10,background:"rgba(251,191,36,0.07)",border:"1px solid rgba(251,191,36,0.15)",borderRadius:10,padding:"10px 12px"}}>
              <div style={{fontSize:10,color:"#fbbf24",fontWeight:800,letterSpacing:"0.08em",textTransform:"uppercase",marginBottom:4}}>💡 Best Scorer Value</div>
              <div style={{fontSize:12,color:"#a0aec0",lineHeight:1.5}}>
                {(() => {
                  const best = [...data.scorers].sort((a,b) => (b.goals/b.apps) - (a.goals/a.apps))[0];
                  return `${best.name} — ${best.goals} goals in ${best.apps} apps (${(best.goals/best.apps*100).toFixed(0)}% rate). Scoring odds: ${best.scoreOdds.toFixed(2)}`;
                })()}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Foulers list */}
      {view==="foulers" && (
        <div>
          <div style={{display:"grid",gridTemplateColumns:"1fr auto auto auto auto",gap:"0 8px",marginBottom:6,paddingBottom:4,borderBottom:"1px solid rgba(255,255,255,0.05)"}}>
            {["Player","Fouls","🟨","🟥","Card Odds"].map(h=>(
              <div key={h} style={{fontSize:9,color:"#3a4258",fontWeight:700,letterSpacing:"0.08em",textTransform:"uppercase",textAlign:h==="Player"?"left":"center"}}>{h}</div>
            ))}
          </div>
          {data.foulers.map((p,i)=>(
            <div key={i} style={{display:"grid",gridTemplateColumns:"1fr auto auto auto auto",gap:"0 8px",padding:"8px 0",borderBottom:"1px solid rgba(255,255,255,0.03)",alignItems:"center"}}>
              <div style={{fontSize:13,fontWeight:700,color:"#e8ecf4"}}>{p.name}</div>
              <div style={{textAlign:"center",fontSize:14,fontWeight:900,color:"#ff7070",fontFamily:"'JetBrains Mono',monospace"}}>{p.fouls}</div>
              <div style={{textAlign:"center",fontSize:13,fontWeight:700,color:"#fbbf24",fontFamily:"'JetBrains Mono',monospace"}}>{p.yellows}</div>
              <div style={{textAlign:"center",fontSize:13,fontWeight:700,color:"#ff5252",fontFamily:"'JetBrains Mono',monospace"}}>{p.reds}</div>
              <div>
                <div style={{
                  background: p.foulOdds < 2.2 ? "rgba(255,82,82,0.18)" : p.foulOdds < 3.0 ? "rgba(251,191,36,0.12)" : "rgba(255,255,255,0.05)",
                  color:      p.foulOdds < 2.2 ? "#ff5252"               : p.foulOdds < 3.0 ? "#fbbf24"              : "#6b7280",
                  borderRadius:6,padding:"3px 7px",textAlign:"center",fontSize:12,fontWeight:800,fontFamily:"'JetBrains Mono',monospace",
                }}>{p.foulOdds.toFixed(2)}</div>
              </div>
            </div>
          ))}
          {data.foulers.length===0 && <div style={{textAlign:"center",padding:"20px 0",color:"#3a4258",fontSize:12}}>No player data</div>}

          {data.foulers.length>0 && (
            <div style={{marginTop:10,background:"rgba(255,82,82,0.06)",border:"1px solid rgba(255,82,82,0.15)",borderRadius:10,padding:"10px 12px"}}>
              <div style={{fontSize:10,color:"#ff5252",fontWeight:800,letterSpacing:"0.08em",textTransform:"uppercase",marginBottom:4}}>⚠️ Disciplinary Risk</div>
              <div style={{fontSize:12,color:"#a0aec0",lineHeight:1.5}}>
                {(() => {
                  const top = data.foulers[0];
                  return `${top.name} leads with ${top.fouls} fouls and ${top.yellows} yellows this season. Card odds: ${top.foulOdds.toFixed(2)}`;
                })()}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── MATCH MODAL ──────────────────────────────────────────────────────────────
function MatchModal({match,ai,onClose,onPredict,userPick}) {
  const [tab,setTab] = useState("overview");
  const hT = TEAMS[match.home] || { name: match.homeName || match.home, emoji: "⚽", color:"#00e676", logo: match.homeLogo };
  const aT = TEAMS[match.away] || { name: match.awayName || match.away, emoji: "⚽", color:"#ff5252", logo: match.awayLogo };
  const isLive=match.status==="live", isFT=match.status==="ft";
  const conf = userPick ? ai.confidence(match,userPick) : null;
  const TABS = ["overview","players","lineup","stats","odds","predict"];

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.88)",zIndex:500,backdropFilter:"blur(10px)",display:"flex",alignItems:"flex-end"}} onClick={onClose}>
      <div style={{background:"#0b0f1c",borderRadius:"22px 22px 0 0",width:"100%",maxWidth:480,margin:"0 auto",maxHeight:"94vh",overflowY:"auto"}} onClick={e=>e.stopPropagation()}>

        {/* Header */}
        <div style={{background:"linear-gradient(135deg,#0e1628,#121d30)",padding:"18px 16px 0",borderRadius:"22px 22px 0 0",position:"sticky",top:0,zIndex:10}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
            <div style={{fontSize:10,color:"#3a4258",fontWeight:700,letterSpacing:"0.09em",textTransform:"uppercase"}}>{match.leagueName} · {match.venue}</div>
            <button onClick={onClose} style={{background:"rgba(255,255,255,0.07)",border:"none",borderRadius:7,width:26,height:26,cursor:"pointer",color:"#e8ecf4",fontSize:14,display:"flex",alignItems:"center",justifyContent:"center"}}>✕</button>
          </div>
          {/* Score row */}
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
            <div style={{flex:1,textAlign:"center"}}>
              {hT.logo ? <img src={hT.logo} style={{width:40,height:40,objectFit:"contain",margin:"0 auto",display:"block"}} onError={e=>{e.target.style.display="none"}}/> : <div style={{fontSize:30}}>{hT.emoji}</div>}
              <div style={{fontSize:14,fontWeight:800,color:"#e8ecf4",marginTop:3}}>{hT.name}</div>
            </div>
            <div style={{textAlign:"center",padding:"0 12px"}}>
              {(isLive||isFT) ? (
                <>
                  <div style={{fontSize:36,fontWeight:900,fontFamily:"'Barlow Condensed',sans-serif",color:isLive?"#00e676":"#e8ecf4",letterSpacing:"0.04em"}}>{match.homeScore}–{match.awayScore}</div>
                  {isLive && <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:5,fontSize:12,color:"#00e676",fontWeight:800,marginTop:2}}><LiveDot s={6}/>{match.minute}'</div>}
                  {isFT  && <div style={{fontSize:10,color:"#3a4258",fontWeight:800,letterSpacing:"0.09em"}}>FULL TIME</div>}
                </>
              ) : (
                <>
                  <div style={{fontSize:22,fontWeight:900,color:"#3a4258"}}>VS</div>
                  <div style={{fontSize:13,color:"#8890a8",fontWeight:600,marginTop:3}}>⏰ {match.kickoff}</div>
                </>
              )}
            </div>
            <div style={{flex:1,textAlign:"center"}}>
              {aT.logo ? <img src={aT.logo} style={{width:40,height:40,objectFit:"contain",margin:"0 auto",display:"block"}} onError={e=>{e.target.style.display="none"}}/> : <div style={{fontSize:30}}>{aT.emoji}</div>}
              <div style={{fontSize:14,fontWeight:800,color:"#e8ecf4",marginTop:3}}>{aT.name}</div>
            </div>
          </div>
          {/* Tabs */}
          <div style={{display:"flex",borderTop:"1px solid rgba(255,255,255,0.04)",overflowX:"auto"}}>
            {TABS.map(t=>(
              <button key={t} style={{flex:"0 0 auto",padding:"9px 11px",border:"none",cursor:"pointer",fontFamily:"inherit",fontWeight:800,fontSize:10,letterSpacing:"0.07em",textTransform:"uppercase",background:"transparent",color:tab===t?"#00e676":"#3a4258",borderBottom:tab===t?"2px solid #00e676":"2px solid transparent",whiteSpace:"nowrap",transition:"color 0.15s"}} onClick={()=>setTab(t)}>
                {t==="predict"?"🤖 AI":t==="players"?"👟 Players":t}
              </button>
            ))}
          </div>
        </div>

        <div style={{padding:"14px 16px"}}>

          {/* OVERVIEW */}
          {tab==="overview" && <>
            {isLive && <MomentumLine data={match.momentum}/>}
            <div style={{marginTop:12}}>
              <div style={{fontSize:9,fontWeight:800,color:"#3a4258",letterSpacing:"0.12em",textTransform:"uppercase",marginBottom:6}}>Win Probability</div>
              <div style={{display:"flex",justifyContent:"space-between",fontSize:12,marginBottom:4}}>
                <span style={{color:"#00e676",fontWeight:700}}>{match.homePct}%</span>
                <span style={{color:"#4a5568"}}>Draw {match.drawPct}%</span>
                <span style={{color:"#ff5252",fontWeight:700}}>{match.awayPct}%</span>
              </div>
              <ProbBar hp={match.homePct} dp={match.drawPct} ap={match.awayPct} h={8}/>
            </div>
            {/* Events */}
            {match.events?.length>0 && <>
              <div style={{fontSize:9,fontWeight:800,color:"#3a4258",letterSpacing:"0.12em",textTransform:"uppercase",marginBottom:6,marginTop:14}}>Match Events</div>
              {match.events.map((e,i)=>(
                <div key={i} style={{display:"flex",alignItems:"center",gap:10,padding:"6px 0",borderBottom:"1px solid rgba(255,255,255,0.03)",fontSize:12}}>
                  <span style={{width:28,fontSize:10,color:"#3a4258",fontWeight:700,fontFamily:"'JetBrains Mono',monospace"}}>{e.min}'</span>
                  <span>{e.type==="goal"?"⚽":e.type==="yellow"?"🟨":"🟥"}</span>
                  <span style={{color:"#e8ecf4"}}>{e.player}</span>
                  <span style={{marginLeft:"auto",fontSize:9,color:e.team==="home"?"#00e676":"#ff5252",fontWeight:800,letterSpacing:"0.06em"}}>{e.team.toUpperCase()}</span>
                </div>
              ))}
            </>}
            {/* Injuries */}
            {((match.injuries?.home?.length||0)+(match.injuries?.away?.length||0))>0 && <>
              <div style={{fontSize:9,fontWeight:800,color:"#3a4258",letterSpacing:"0.12em",textTransform:"uppercase",marginBottom:6,marginTop:14}}>🏥 Injuries & Doubts</div>
              {match.injuries.home.map((p,i)=>(
                <div key={i} style={{display:"flex",gap:8,padding:"4px 0",fontSize:12}}>
                  <span style={{background:"rgba(0,230,118,0.1)",color:"#00e676",borderRadius:5,padding:"2px 7px",fontSize:9,fontWeight:800}}>{hT.name}</span>
                  <span style={{color:"#fbbf24"}}>⚠️ {p}</span>
                </div>
              ))}
              {match.injuries.away.map((p,i)=>(
                <div key={i} style={{display:"flex",gap:8,padding:"4px 0",fontSize:12}}>
                  <span style={{background:"rgba(255,82,82,0.1)",color:"#ff5252",borderRadius:5,padding:"2px 7px",fontSize:9,fontWeight:800}}>{aT.name}</span>
                  <span style={{color:"#fbbf24"}}>⚠️ {p}</span>
                </div>
              ))}
            </>}
            {/* Subs */}
            {match.subs?.length>0 && <>
              <div style={{fontSize:9,fontWeight:800,color:"#3a4258",letterSpacing:"0.12em",textTransform:"uppercase",marginBottom:6,marginTop:14}}>🔄 Substitutions</div>
              {match.subs.map((s,i)=>(
                <div key={i} style={{display:"flex",alignItems:"center",gap:8,padding:"5px 0",fontSize:12}}>
                  <span style={{background:"rgba(255,255,255,0.05)",color:"#8890a8",borderRadius:5,padding:"2px 6px",fontSize:9,fontWeight:700}}>{s.min}'</span>
                  <span style={{color:"#ff5252"}}>↓ {s.out}</span>
                  <span style={{color:"#00e676"}}>↑ {s.in}</span>
                  <span style={{marginLeft:"auto",fontSize:9,color:s.team==="home"?"#00e676":"#ff5252",fontWeight:800}}>{s.team.toUpperCase()}</span>
                </div>
              ))}
            </>}
          </>}

          {/* PLAYERS */}
          {tab==="players" && <PlayerStatsPanel homeId={match.home} awayId={match.away} homeTeam={hT} awayTeam={aT}/>}

          {/* LINEUP */}
          {tab==="lineup" && <PitchLineup homeId={match.home} awayId={match.away}/>}

          {/* STATS */}
          {tab==="stats" && (match.stats ? (
            <div style={{marginTop:6}}>
              <div style={{display:"flex",justifyContent:"space-between",fontSize:10,fontWeight:800,color:"#3a4258",letterSpacing:"0.06em",marginBottom:12}}>
                <span style={{color:"#00e676"}}>{hT.name}</span><span>MATCH STATS</span><span style={{color:"#ff5252"}}>{aT.name}</span>
              </div>
              {[["Possession","possession"],[" Shots","shots"],["On Target","shotsOnTarget"],["Corners","corners"],["Fouls","fouls"],["Passes","passes"],["xG","xG"]].map(([l,k])=>(
                <StatBar key={k} label={l} h={match.stats[k][0]} a={match.stats[k][1]}/>
              ))}
            </div>
          ) : <div style={{textAlign:"center",padding:"40px 0",color:"#3a4258"}}><div style={{fontSize:32,marginBottom:8}}>📊</div>Stats available once match starts</div>)}

          {/* ODDS */}
          {tab==="odds" && <div style={{marginTop:6}}>
            <div style={{fontSize:9,fontWeight:800,color:"#3a4258",letterSpacing:"0.12em",textTransform:"uppercase",marginBottom:8}}>Current Odds</div>
            <div style={{display:"flex",gap:8,marginBottom:14}}>
              <OddsBox label={hT.name} val={match.homeOdds.toFixed(2)} color="#00e676"/>
              <OddsBox label="Draw" val={match.drawOdds.toFixed(2)} color="#a0aec0"/>
              <OddsBox label={aT.name} val={match.awayOdds.toFixed(2)} color="#ff5252"/>
            </div>
            <div style={{background:"rgba(255,255,255,0.02)",borderRadius:10,padding:12,marginBottom:12}}>
              <div style={{fontSize:10,color:"#3a4258",fontWeight:700,letterSpacing:"0.08em",textTransform:"uppercase",marginBottom:10}}>Implied Probability</div>
              {[[hT.name,match.homeOdds,"#00e676"],[" Draw",match.drawOdds,"#a0aec0"],[aT.name,match.awayOdds,"#ff5252"]].map(([l,o,c])=>{
                const imp=Math.round((1/o)*100);
                return (
                  <div key={l} style={{marginBottom:8}}>
                    <div style={{display:"flex",justifyContent:"space-between",fontSize:12,marginBottom:2}}>
                      <span style={{color:"#8890a8"}}>{l}</span><span style={{color:c,fontWeight:800}}>{imp}%</span>
                    </div>
                    <div style={{background:"rgba(255,255,255,0.04)",borderRadius:3,height:5,overflow:"hidden"}}>
                      <div style={{width:`${imp}%`,height:"100%",background:c,borderRadius:3,transition:"width .6s"}}/>
                    </div>
                  </div>
                );
              })}
            </div>
            <div style={{background:"rgba(251,191,36,0.07)",border:"1px solid rgba(251,191,36,0.14)",borderRadius:10,padding:12}}>
              <div style={{fontSize:10,color:"#fbbf24",fontWeight:800,letterSpacing:"0.08em",textTransform:"uppercase",marginBottom:5}}>💡 Value Bet</div>
              <div style={{fontSize:12,color:"#a0aec0",lineHeight:1.5}}>
                {match.homePct>Math.round((1/match.homeOdds)*100)+5
                  ?`${hT.name} win — model (${match.homePct}%) vs implied (${Math.round((1/match.homeOdds)*100)}%). Edge found.`
                  :match.awayPct>Math.round((1/match.awayOdds)*100)+5
                  ?`${aT.name} win — model (${match.awayPct}%) vs implied (${Math.round((1/match.awayOdds)*100)}%). Edge found.`
                  :"No significant value edge detected for this match."}
              </div>
            </div>
          </div>}

          {/* PREDICT / AI */}
          {tab==="predict" && <div style={{marginTop:6}}>
            <div style={{background:"linear-gradient(135deg,rgba(0,230,118,0.07),rgba(0,230,118,0.02))",border:"1px solid rgba(0,230,118,0.13)",borderRadius:12,padding:14,marginBottom:14}}>
              <div style={{fontSize:10,color:"#00e676",fontWeight:800,letterSpacing:"0.1em",textTransform:"uppercase",marginBottom:7}}>🤖 AI Analysis</div>
              <div style={{fontSize:12,color:"#8890a8",lineHeight:1.6,marginBottom:conf?10:0}}>
                Model trained on <strong style={{color:"#e8ecf4"}}>{ai.accuracy.total}</strong> matches · <strong style={{color:"#00e676"}}>{ai.accuracy.pct||"--"}%</strong> accuracy.
                {ai.accuracy.total>10?" Weights auto-adapting.":" Keep predicting to improve."}
              </div>
              {conf && <>
                <div style={{display:"flex",justifyContent:"space-between",fontSize:11,marginBottom:4}}>
                  <span style={{color:"#4a5568"}}>Confidence for your pick</span>
                  <span style={{color:conf>65?"#00e676":conf>45?"#fbbf24":"#ff5252",fontWeight:800}}>{conf}%</span>
                </div>
                <div style={{background:"rgba(255,255,255,0.05)",borderRadius:3,height:6,overflow:"hidden"}}>
                  <div style={{width:`${conf}%`,height:"100%",background:conf>65?"#00e676":conf>45?"#fbbf24":"#ff5252",borderRadius:3,transition:"width .6s"}}/>
                </div>
              </>}
            </div>
            <div style={{fontSize:9,fontWeight:800,color:"#3a4258",letterSpacing:"0.12em",textTransform:"uppercase",marginBottom:8}}>Make Your Prediction</div>
            <div style={{display:"flex",gap:7,marginBottom:14}}>
              {[{l:hT.name,sub:match.homeOdds.toFixed(2),v:"home",c:"#00e676"},{l:"Draw",sub:match.drawOdds.toFixed(2),v:"draw",c:"#a0aec0"},{l:aT.name,sub:match.awayOdds.toFixed(2),v:"away",c:"#ff5252"}].map(b=>(
                <button key={b.v} onClick={()=>onPredict(match.id,b.v,match)} style={{
                  flex:1,padding:"11px 4px",borderRadius:10,border:"none",
                  background:userPick===b.v?b.c:"rgba(255,255,255,0.04)",
                  color:userPick===b.v?"#080c14":b.c,
                  fontWeight:800,fontSize:11,cursor:"pointer",fontFamily:"inherit",transition:"all 0.2s",lineHeight:1.3,
                }}>
                  <div>{b.l}</div>
                  <div style={{fontSize:16,fontWeight:900,marginTop:3,fontFamily:"'JetBrains Mono',monospace"}}>{b.sub}</div>
                </button>
              ))}
            </div>
            {userPick && <div style={{background:"rgba(0,230,118,0.05)",border:"1px solid rgba(0,230,118,0.13)",borderRadius:8,padding:10,textAlign:"center",fontSize:12,color:"#00e676",fontWeight:700}}>✓ Prediction saved — AI is learning</div>}
            {/* Model weights */}
            <div style={{marginTop:14}}>
              <div style={{fontSize:9,fontWeight:800,color:"#3a4258",letterSpacing:"0.12em",textTransform:"uppercase",marginBottom:8}}>AI Model Weights</div>
              {Object.entries(ai.weights).map(([k,v])=>(
                <div key={k} style={{marginBottom:7}}>
                  <div style={{display:"flex",justifyContent:"space-between",fontSize:11,marginBottom:2}}>
                    <span style={{color:"#6b7280",textTransform:"capitalize",letterSpacing:"0.05em"}}>{k}</span>
                    <span style={{color:"#8890a8",fontWeight:700}}>{Math.round(v*100)}%</span>
                  </div>
                  <div style={{background:"rgba(255,255,255,0.04)",borderRadius:3,height:4,overflow:"hidden"}}>
                    <div style={{width:`${v*100}%`,height:"100%",background:"linear-gradient(90deg,#00e676,#00b050)",borderRadius:3}}/>
                  </div>
                </div>
              ))}
            </div>
          </div>}
        </div>
      </div>
    </div>
  );
}

// ─── MATCH CARD ───────────────────────────────────────────────────────────────
function MatchCard({match,picks,onOpen,onPredict,ai,favs,onFav}) {
  const hT = TEAMS[match.home] || { name: match.homeName || match.home, emoji: match.homeLogo ? null : "⚽", color:"#00e676", logo: match.homeLogo };
  const aT = TEAMS[match.away] || { name: match.awayName || match.away, emoji: match.awayLogo ? null : "⚽", color:"#ff5252", logo: match.awayLogo };
  const isLive=match.status==="live", isFT=match.status==="ft";
  const pick=picks[match.id];
  const isFav=favs.has(match.home)||favs.has(match.away);

  const hData=TEAM_PLAYERS[match.home];
  const aData=TEAM_PLAYERS[match.away];
  const hTop=hData?.scorers?.[0];
  const aTop=aData?.scorers?.[0];

  return (
    <div onClick={onOpen} style={{
      background: isLive?"linear-gradient(145deg,#0c1e18,#0e1c16)":"linear-gradient(145deg,#0f1520,#111927)",
      border: isLive?"1px solid rgba(0,230,118,0.18)":"1px solid rgba(255,255,255,0.05)",
      borderRadius:14,padding:"13px 14px",marginBottom:9,position:"relative",overflow:"hidden",cursor:"pointer",
      boxShadow: isLive?"0 0 18px rgba(0,230,118,0.05)":"none",
      transition:"transform 0.15s ease,box-shadow 0.15s ease",
    }}
      onMouseEnter={e=>{e.currentTarget.style.transform="translateY(-2px)";e.currentTarget.style.boxShadow="0 8px 28px rgba(0,0,0,0.5)";}}
      onMouseLeave={e=>{e.currentTarget.style.transform="";e.currentTarget.style.boxShadow=isLive?"0 0 18px rgba(0,230,118,0.05)":"none";}}
    >
      {isFav && <div style={{position:"absolute",top:0,left:0,right:0,height:2,background:`linear-gradient(90deg,${hT.color},${aT.color})`,borderRadius:"14px 14px 0 0"}}/>}

      {/* League + status */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:9}}>
        <div style={{display:"flex",alignItems:"center",gap:6}}>
          <span style={{fontSize:10,color:"#3a4258",fontWeight:700,letterSpacing:"0.08em",textTransform:"uppercase"}}>{match.leagueName}</span>
          {isFav && <span style={{fontSize:10,color:"#fbbf24"}}>★</span>}
        </div>
        <div style={{display:"flex",alignItems:"center",gap:7}}>
          {pick && <span style={{background:"rgba(0,230,118,0.1)",color:"#00e676",borderRadius:5,padding:"2px 7px",fontSize:9,fontWeight:800,letterSpacing:"0.06em"}}>PICKED</span>}
          {isLive && <span style={{display:"flex",alignItems:"center",gap:4,fontSize:12,color:"#00e676",fontWeight:800}}><LiveDot s={6}/>{match.minute}'</span>}
          {isFT  && <span style={{fontSize:9,color:"#3a4258",fontWeight:800,letterSpacing:"0.1em"}}>FT</span>}
          {!isLive&&!isFT && <span style={{fontSize:11,color:"#6b7280",fontWeight:600}}>⏰ {match.kickoff}</span>}
        </div>
      </div>

      {/* Teams + score */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
        <div style={{flex:1}}>
          <div style={{fontSize:14,fontWeight:800,color:"#e8ecf4",display:"flex",alignItems:"center",gap:6,marginBottom:4}}>
            {hT.logo ? <img src={hT.logo} style={{width:20,height:20,objectFit:"contain"}} onError={e=>{e.target.style.display="none"}}/> : <span style={{fontSize:18}}>{hT.emoji}</span>}
            {hT.name}
            {hTop && <span style={{fontSize:9,color:"#00e676",background:"rgba(0,230,118,0.1)",borderRadius:4,padding:"1px 5px",fontWeight:800,marginLeft:2}}>⚽{hTop.goals}</span>}
          </div>
          <div style={{fontSize:14,fontWeight:800,color:"#e8ecf4",display:"flex",alignItems:"center",gap:6}}>
            {aT.logo ? <img src={aT.logo} style={{width:20,height:20,objectFit:"contain"}} onError={e=>{e.target.style.display="none"}}/> : <span style={{fontSize:18}}>{aT.emoji}</span>}
            {aT.name}
            {aTop && <span style={{fontSize:9,color:"#ff7070",background:"rgba(255,82,82,0.1)",borderRadius:4,padding:"1px 5px",fontWeight:800,marginLeft:2}}>⚽{aTop.goals}</span>}
          </div>
        </div>
        <div style={{paddingLeft:10}}>
          {(isLive||isFT) ? (
            <span style={{fontSize:28,fontWeight:900,fontFamily:"'Barlow Condensed',sans-serif",color:isLive?"#00e676":"#e8ecf4",letterSpacing:"0.05em"}}>{match.homeScore}–{match.awayScore}</span>
          ) : (
            <div style={{display:"flex",gap:5}}>
              <OddsBox label="H" val={match.homeOdds.toFixed(1)} color="#00e676" small/>
              <OddsBox label="D" val={match.drawOdds.toFixed(1)} color="#a0aec0" small/>
              <OddsBox label="A" val={match.awayOdds.toFixed(1)} color="#ff5252" small/>
            </div>
          )}
        </div>
      </div>

      {/* Top scorer odds callout */}
      {hTop && aTop && !isFT && (
        <div style={{display:"flex",gap:6,marginBottom:7}}>
          <div style={{flex:1,background:"rgba(0,230,118,0.05)",borderRadius:7,padding:"4px 8px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <span style={{fontSize:10,color:"#6b7280",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:90}}>{hTop.name.split(" ").pop()}</span>
            <span style={{fontSize:11,fontWeight:800,color:"#00e676",fontFamily:"'JetBrains Mono',monospace"}}>{hTop.scoreOdds.toFixed(2)}</span>
          </div>
          <div style={{display:"flex",alignItems:"center",fontSize:9,color:"#3a4258",fontWeight:700,letterSpacing:"0.08em"}}>ANYTIME</div>
          <div style={{flex:1,background:"rgba(255,82,82,0.05)",borderRadius:7,padding:"4px 8px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <span style={{fontSize:11,fontWeight:800,color:"#ff7070",fontFamily:"'JetBrains Mono',monospace"}}>{aTop.scoreOdds.toFixed(2)}</span>
            <span style={{fontSize:10,color:"#6b7280",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:90,textAlign:"right"}}>{aTop.name.split(" ").pop()}</span>
          </div>
        </div>
      )}

      {/* Prob bar */}
      <ProbBar hp={match.homePct} dp={match.drawPct} ap={match.awayPct}/>
      <div style={{display:"flex",justifyContent:"space-between",fontSize:9,color:"#3a4258",marginTop:3}}>
        <span style={{color:"#00e676",fontWeight:700}}>{match.homePct}%</span>
        <span>Draw {match.drawPct}%</span>
        <span style={{color:"#ff5252",fontWeight:700}}>{match.awayPct}%</span>
      </div>

      {/* Quick predict */}
      {match.status==="upcoming" && (
        <div style={{display:"flex",gap:5,marginTop:9}} onClick={e=>e.stopPropagation()}>
          {[{l:hT.name.split(" ")[0],v:"home",c:"#00e676"},{l:"Draw",v:"draw",c:"#a0aec0"},{l:aT.name.split(" ")[0],v:"away",c:"#ff5252"}].map(b=>(
            <button key={b.v} onClick={()=>onPredict(match.id,b.v,match)} style={{
              flex:1,padding:"6px 3px",borderRadius:7,border:"none",
              background:pick===b.v?b.c:"rgba(255,255,255,0.04)",
              color:pick===b.v?"#080c14":b.c,
              fontWeight:800,fontSize:11,cursor:"pointer",fontFamily:"inherit",transition:"all 0.2s",
            }}>{b.l}</button>
          ))}
        </div>
      )}

      {/* Live momentum mini */}
      {isLive && match.momentum && <MomentumLine data={match.momentum.slice(-10)}/>}

      {/* FT pick badge */}
      {isFT && pick && (
        <div style={{marginTop:7,padding:"5px 9px",borderRadius:5,background:"rgba(251,191,36,0.07)",border:"1px solid rgba(251,191,36,0.12)",fontSize:11,color:"#fbbf24",fontWeight:700}}>
          Your pick: {pick.toUpperCase()} · Tap for details
        </div>
      )}
    </div>
  );
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
export default function App() {
  const [nav,setNav]         = useState("fixtures");
  const [league,setLeague]   = useState("all");
  const [dayIdx,setDayIdx]   = useState(1);
  const [picks,setPicks]     = useState({});
  const [favs,setFavs]       = useState(new Set(["arsenal","liverpool","realmadrid"]));
  const [openMatch,setOpen]  = useState(null);
  const [uploadMsg,setMsg]   = useState("");

  // ── LIVE DATA STATE ──
  const [liveFixtures, setLiveFixtures]       = useState([]);
  const [apiStatus, setApiStatus]             = useState("loading"); // loading | live | offline
  const [lastUpdated, setLastUpdated]         = useState(null);
  const refreshTimer                          = useRef(null);

  const [ai,setAI] = useState(()=>{
    try { const d=localStorage.getItem("pulse_ai"); return new AIEngine(d?JSON.parse(d):null); }
    catch { return new AIEngine(null); }
  });

  useEffect(()=>{
    try { localStorage.setItem("pulse_ai",JSON.stringify(ai.serialize())); } catch {}
  },[ai]);

  // ── FETCH FROM RAILWAY API ──
  const loadMatches = useCallback(async () => {
    try {
      const [live, upcoming] = await Promise.allSettled([
        fetchLiveMatches(),
        fetchUpcomingMatches(),
      ]);
      const liveData     = live.status === "fulfilled" ? live.value : [];
      const upcomingData = upcoming.status === "fulfilled" ? upcoming.value : [];

      // Merge — deduplicate by id, live takes priority
      const seen = new Set();
      const merged = [...liveData, ...upcomingData, ...ALL_FIXTURES].filter(m => {
        if (seen.has(m.id)) return false;
        seen.add(m.id);
        return true;
      });

      setLiveFixtures(merged);
      setApiStatus("live");
      setLastUpdated(new Date());
    } catch {
      setApiStatus("offline");
      setLiveFixtures(ALL_FIXTURES);
    }
  }, []);

  useEffect(() => {
    loadMatches();
    refreshTimer.current = setInterval(loadMatches, REFRESH_INTERVAL);
    return () => clearInterval(refreshTimer.current);
  }, [loadMatches]);

  const days = getDays();
  const allFixtures = liveFixtures.length > 0 ? liveFixtures : ALL_FIXTURES;

  const handlePredict = useCallback((matchId,pick,match)=>{
    setPicks(p=>({...p,[matchId]:pick}));
    setAI(a=>{const n=new AIEngine(a.serialize()); n.record(matchId,pick,match); return n;});
  },[]);

  const toggleFav = id => setFavs(f=>{const n=new Set(f); n.has(id)?n.delete(id):n.add(id); return n;});

  const dayFixtures  = allFixtures.filter(f=>f.dayOffset===(days[dayIdx]?.offset??0));
  const shown        = dayFixtures.filter(f=>league==="all"?true:league==="live"?f.status==="live":f.league===league);
  const liveCount    = allFixtures.filter(f=>f.status==="live").length;
  const totalPicks   = Object.keys(picks).length;

  const exportData = ()=>{
    const b=new Blob([JSON.stringify(ai.serialize(),null,2)],{type:"application/json"});
    const a=document.createElement("a"); a.href=URL.createObjectURL(b); a.download="pulse_ai_data.json"; a.click();
  };

  const importData = e=>{
    const f=e.target.files?.[0]; if(!f) return;
    const r=new FileReader();
    r.onload=ev=>{
      try { const d=JSON.parse(ev.target.result); setAI(new AIEngine(d)); setMsg(`✓ Loaded ${d.predictions?.length||0} predictions`); }
      catch { setMsg("⚠️ Invalid JSON file"); }
    };
    r.readAsText(f);
  };

  return (
    <div style={{minHeight:"100vh",background:"#080c14",fontFamily:"'Barlow',sans-serif",color:"#e8ecf4",maxWidth:480,margin:"0 auto",paddingBottom:82}}>
      <style>{`
        ${FONT_IMPORT}
        *{box-sizing:border-box;margin:0;padding:0;}
        ::-webkit-scrollbar{display:none;}
        @keyframes pulseDot{0%,100%{opacity:1;transform:scale(1);}50%{opacity:.35;transform:scale(.7);}}
        @keyframes fadeUp{from{opacity:0;transform:translateY(10px);}to{opacity:1;transform:translateY(0);}}
      `}</style>

      {/* ── HEADER ── */}
      <div style={{padding:"18px 16px 0",position:"sticky",top:0,background:"rgba(8,12,20,0.97)",backdropFilter:"blur(20px)",zIndex:200,borderBottom:"1px solid rgba(255,255,255,0.04)"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",paddingBottom:12}}>
          <div>
            <div style={{display:"flex",alignItems:"baseline",gap:6}}>
              <span style={{fontSize:24,fontWeight:900,fontFamily:"'Barlow Condensed',sans-serif",letterSpacing:"-0.02em",background:"linear-gradient(130deg,#fff 30%,#3a4a6a)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}}>PULSE</span>
              <span style={{fontSize:24,fontWeight:900,fontFamily:"'Barlow Condensed',sans-serif",letterSpacing:"-0.02em",color:"#00e676"}}>FOOTBALL</span>
            </div>
            <div style={{display:"flex",gap:10,alignItems:"center",marginTop:2,fontSize:11,color:"#3a4258"}}>
              {liveCount>0 && <span style={{display:"flex",alignItems:"center",gap:4,color:"#00e676",fontWeight:700}}><LiveDot s={6}/>{liveCount} live</span>}
              {apiStatus==="live" && <span style={{color:"#00e676",fontSize:9,fontWeight:700,letterSpacing:"0.06em"}}>● LIVE DATA</span>}
              {apiStatus==="offline" && <span style={{color:"#ff5252",fontSize:9,fontWeight:700,letterSpacing:"0.06em"}}>● OFFLINE</span>}
              {apiStatus==="loading" && <span style={{color:"#fbbf24",fontSize:9,fontWeight:700,letterSpacing:"0.06em"}}>● LOADING…</span>}
              {lastUpdated && <span style={{color:"#3a4258",fontSize:9}}>{lastUpdated.toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}</span>}
            </div>
          </div>
          <div style={{display:"flex",gap:10,alignItems:"flex-start"}}>
            <div style={{textAlign:"right"}}>
              <div style={{fontSize:9,color:"#3a4258",fontWeight:700,letterSpacing:"0.1em",textTransform:"uppercase"}}>AI Accuracy</div>
              <div style={{fontSize:22,fontWeight:900,fontFamily:"'Barlow Condensed',sans-serif",color:ai.accuracy.pct>=60?"#00e676":ai.accuracy.pct>=40?"#fbbf24":"#ff5252"}}>{ai.accuracy.total>0?`${ai.accuracy.pct}%`:"--"}</div>
            </div>
            <div style={{textAlign:"right"}}>
              <div style={{fontSize:9,color:"#3a4258",fontWeight:700,letterSpacing:"0.1em",textTransform:"uppercase"}}>XP</div>
              <div style={{fontSize:22,fontWeight:900,fontFamily:"'Barlow Condensed',sans-serif",color:"#fbbf24"}}>{ai.xp}</div>
            </div>
          </div>
        </div>

        {nav==="fixtures" && (
          <div style={{display:"flex",gap:7,paddingBottom:11}}>
            {[{l:"Picks",v:totalPicks},{l:"Streak",v:`${ai.streak}🔥`},{l:"Correct",v:ai.accuracy.correct}].map(s=>(
              <div key={s.l} style={{flex:1,background:"rgba(255,255,255,0.03)",borderRadius:7,padding:"6px 8px",textAlign:"center",border:"1px solid rgba(255,255,255,0.04)"}}>
                <div style={{fontSize:16,fontWeight:800,color:"#e8ecf4"}}>{s.v}</div>
                <div style={{fontSize:9,color:"#3a4258",fontWeight:700,letterSpacing:"0.08em",textTransform:"uppercase"}}>{s.l}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── FIXTURES ── */}
      {nav==="fixtures" && <>
        {/* Day bar */}
        <div style={{overflowX:"auto",display:"flex",background:"rgba(8,12,20,0.85)",borderBottom:"1px solid rgba(255,255,255,0.04)"}}>
          {days.map((d,i)=>(
            <button key={i} onClick={()=>setDayIdx(i)} style={{flex:"0 0 auto",padding:"9px 13px",border:"none",cursor:"pointer",fontFamily:"inherit",fontWeight:800,fontSize:11,letterSpacing:"0.06em",textTransform:"uppercase",background:"transparent",color:dayIdx===i?"#00e676":"#3a4258",borderBottom:dayIdx===i?"2px solid #00e676":"2px solid transparent",transition:"color 0.15s",whiteSpace:"nowrap"}}>
              <div>{d.label}</div>
              <div style={{fontSize:9,marginTop:1,opacity:.55,fontWeight:600}}>{d.date}</div>
            </button>
          ))}
        </div>
        {/* League filter */}
        <div style={{overflowX:"auto",display:"flex",gap:5,padding:"10px 16px 4px"}}>
          {LEAGUES_LIST.map(l=>(
            <button key={l.id} onClick={()=>setLeague(l.id)} style={{padding:"5px 12px",borderRadius:18,border:"none",fontWeight:700,fontSize:11,cursor:"pointer",letterSpacing:"0.05em",fontFamily:"inherit",whiteSpace:"nowrap",transition:"all 0.18s",background:league===l.id?"#00e676":"rgba(255,255,255,0.05)",color:league===l.id?"#080c14":"#6b7280"}}>{l.label}</button>
          ))}
        </div>
        {/* Cards */}
        <div style={{padding:"8px 16px 0",animation:"fadeUp .3s ease"}}>
          {shown.filter(m=>m.status==="live").length>0 && <>
            <div style={{fontSize:9,fontWeight:800,color:"#3a4258",letterSpacing:"0.14em",textTransform:"uppercase",marginBottom:7,marginTop:4,display:"flex",alignItems:"center",gap:5}}><LiveDot s={5}/>Live Now</div>
            {shown.filter(m=>m.status==="live").map(m=><MatchCard key={m.id} match={m} picks={picks} onOpen={()=>setOpen(m)} onPredict={handlePredict} ai={ai} favs={favs} onFav={toggleFav}/>)}
          </>}
          {shown.filter(m=>m.status==="upcoming").length>0 && <>
            <div style={{fontSize:9,fontWeight:800,color:"#3a4258",letterSpacing:"0.14em",textTransform:"uppercase",marginBottom:7,marginTop:12}}>Upcoming</div>
            {shown.filter(m=>m.status==="upcoming").map(m=><MatchCard key={m.id} match={m} picks={picks} onOpen={()=>setOpen(m)} onPredict={handlePredict} ai={ai} favs={favs} onFav={toggleFav}/>)}
          </>}
          {shown.filter(m=>m.status==="ft").length>0 && <>
            <div style={{fontSize:9,fontWeight:800,color:"#3a4258",letterSpacing:"0.14em",textTransform:"uppercase",marginBottom:7,marginTop:12}}>Results</div>
            {shown.filter(m=>m.status==="ft").map(m=><MatchCard key={m.id} match={m} picks={picks} onOpen={()=>setOpen(m)} onPredict={handlePredict} ai={ai} favs={favs} onFav={toggleFav}/>)}
          </>}
          {shown.length===0 && <div style={{textAlign:"center",padding:"56px 0",color:"#252d42"}}>
            <div style={{fontSize:44,marginBottom:10}}>⚽</div>
            <div style={{fontSize:16,fontWeight:700}}>No matches</div>
            <div style={{fontSize:12,marginTop:4,color:"#1e2535"}}>Try a different day or league</div>
          </div>}
        </div>
      </>}

      {/* ── FAVOURITES ── */}
      {nav==="favourites" && <div style={{padding:"14px 16px",animation:"fadeUp .3s ease"}}>
        <div style={{fontSize:9,fontWeight:800,color:"#3a4258",letterSpacing:"0.14em",textTransform:"uppercase",marginBottom:10}}>⭐ My Teams</div>
        <div style={{display:"flex",flexWrap:"wrap",gap:7,marginBottom:18}}>
          {Object.entries(TEAMS).map(([id,t])=>{
            const on=favs.has(id);
            return (
              <button key={id} onClick={()=>toggleFav(id)} style={{padding:"7px 13px",borderRadius:18,border:`1px solid ${on?t.color:"rgba(255,255,255,0.07)"}`,background:on?`${t.color}16`:"rgba(255,255,255,0.03)",color:on?"#e8ecf4":"#4a5568",fontWeight:700,fontSize:11,cursor:"pointer",fontFamily:"inherit",display:"flex",alignItems:"center",gap:5,transition:"all 0.2s"}}>
                {t.emoji} {t.name} {on?"★":"☆"}
              </button>
            );
          })}
        </div>
        <div style={{fontSize:9,fontWeight:800,color:"#3a4258",letterSpacing:"0.14em",textTransform:"uppercase",marginBottom:8}}>Favourite Matches</div>
        {ALL_FIXTURES.filter(f=>favs.has(f.home)||favs.has(f.away)).slice(0,10).map(m=>(
          <MatchCard key={m.id} match={m} picks={picks} onOpen={()=>setOpen(m)} onPredict={handlePredict} ai={ai} favs={favs} onFav={toggleFav}/>
        ))}
        {ALL_FIXTURES.filter(f=>favs.has(f.home)||favs.has(f.away)).length===0 && (
          <div style={{textAlign:"center",padding:"36px 0",color:"#252d42"}}>
            <div style={{fontSize:36,marginBottom:8}}>⭐</div>
            <div>Select teams above to track their fixtures</div>
          </div>
        )}
      </div>}

      {/* ── AI STATS ── */}
      {nav==="ai" && <div style={{padding:"14px 16px",animation:"fadeUp .3s ease"}}>
        <div style={{fontSize:9,fontWeight:800,color:"#3a4258",letterSpacing:"0.14em",textTransform:"uppercase",marginBottom:10}}>🤖 AI Learning System</div>
        <div style={{background:"linear-gradient(135deg,rgba(0,230,118,0.07),rgba(0,230,118,0.02))",border:"1px solid rgba(0,230,118,0.11)",borderRadius:12,padding:14,marginBottom:14}}>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:12}}>
            {[{l:"Predictions",v:ai.accuracy.total},{l:"Correct",v:ai.accuracy.correct},{l:"Accuracy",v:`${ai.accuracy.pct||0}%`},{l:"Streak",v:`${ai.streak}🔥`}].map(s=>(
              <div key={s.l} style={{textAlign:"center"}}>
                <div style={{fontSize:22,fontWeight:900,fontFamily:"'Barlow Condensed',sans-serif",color:"#00e676"}}>{s.v}</div>
                <div style={{fontSize:9,color:"#3a4258",fontWeight:700,letterSpacing:"0.08em",textTransform:"uppercase",marginTop:2}}>{s.l}</div>
              </div>
            ))}
          </div>
          <div style={{background:"rgba(255,255,255,0.02)",borderRadius:8,padding:10}}>
            <div style={{fontSize:9,color:"#3a4258",fontWeight:700,letterSpacing:"0.08em",textTransform:"uppercase",marginBottom:8}}>Model Weights (Auto-Adapting)</div>
            {Object.entries(ai.weights).map(([k,v])=>(
              <div key={k} style={{display:"flex",alignItems:"center",gap:10,marginBottom:6}}>
                <span style={{width:60,fontSize:11,color:"#6b7280",textTransform:"capitalize"}}>{k}</span>
                <div style={{flex:1,background:"rgba(255,255,255,0.04)",borderRadius:3,height:4,overflow:"hidden"}}>
                  <div style={{width:`${v*100}%`,height:"100%",background:"#00e676",borderRadius:3,transition:"width .6s"}}/>
                </div>
                <span style={{width:28,fontSize:11,fontWeight:700,color:"#00e676",textAlign:"right"}}>{Math.round(v*100)}%</span>
              </div>
            ))}
          </div>
        </div>
        {Object.keys(ai.leagueAcc).length>0 && <>
          <div style={{fontSize:9,fontWeight:800,color:"#3a4258",letterSpacing:"0.14em",textTransform:"uppercase",marginBottom:8}}>League Accuracy</div>
          <div style={{marginBottom:14}}>
            {Object.entries(ai.leagueAcc).map(([lg,d])=>(
              <div key={lg} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 0",borderBottom:"1px solid rgba(255,255,255,0.04)",fontSize:12}}>
                <span style={{color:"#8890a8",textTransform:"uppercase",fontSize:10,fontWeight:700,letterSpacing:"0.06em"}}>{lg}</span>
                <span style={{color:"#4a5568",fontSize:11}}>{d.correct}/{d.total}</span>
                <span style={{color:d.pct>=60?"#00e676":d.pct>=40?"#fbbf24":"#ff5252",fontWeight:800}}>{d.pct}%</span>
              </div>
            ))}
          </div>
        </>}
        {ai.predictions.filter(p=>p.resolved).length>0 && <>
          <div style={{fontSize:9,fontWeight:800,color:"#3a4258",letterSpacing:"0.14em",textTransform:"uppercase",marginBottom:8}}>Recent Predictions</div>
          {ai.predictions.filter(p=>p.resolved).slice(-8).reverse().map((p,i)=>(
            <div key={i} style={{display:"flex",alignItems:"center",gap:10,padding:"7px 10px",background:"rgba(255,255,255,0.02)",borderRadius:7,marginBottom:5,border:`1px solid ${p.correct?"rgba(0,230,118,0.1)":"rgba(255,82,82,0.1)"}`}}>
              <span style={{fontSize:15}}>{p.correct?"✅":"❌"}</span>
              <div style={{flex:1}}>
                <div style={{fontSize:11,color:"#a0aec0",fontWeight:700,textTransform:"capitalize"}}>Match #{p.matchId} · {p.pick}</div>
                <div style={{fontSize:10,color:"#3a4258"}}>{p.league?.toUpperCase()} · Odds {p.odds?.toFixed(2)}</div>
              </div>
              <span style={{fontSize:12,fontWeight:700,color:p.correct?"#00e676":"#ff5252"}}>{p.correct?"+XP":"-XP"}</span>
            </div>
          ))}
        </>}
        <div style={{fontSize:9,fontWeight:800,color:"#3a4258",letterSpacing:"0.14em",textTransform:"uppercase",marginBottom:8,marginTop:14}}>💾 Data</div>
        <div style={{display:"flex",gap:7,marginBottom:8}}>
          <label style={{flex:1,padding:"10px 6px",borderRadius:9,border:"1px solid rgba(0,230,118,0.18)",background:"rgba(0,230,118,0.05)",color:"#00e676",fontWeight:700,fontSize:12,cursor:"pointer",textAlign:"center",fontFamily:"inherit"}}>
            📥 Import AI Data<input type="file" accept=".json" onChange={importData} style={{display:"none"}}/>
          </label>
          <button onClick={exportData} style={{flex:1,padding:"10px 6px",borderRadius:9,border:"1px solid rgba(255,255,255,0.08)",background:"rgba(255,255,255,0.03)",color:"#8890a8",fontWeight:700,fontSize:12,cursor:"pointer",fontFamily:"inherit"}}>📤 Export AI Data</button>
        </div>
        {uploadMsg && <div style={{fontSize:12,color:"#00e676",padding:"7px 10px",background:"rgba(0,230,118,0.05)",borderRadius:7,marginBottom:8}}>{uploadMsg}</div>}
        <div style={{fontSize:11,color:"#3a4258",lineHeight:1.6}}>Import your saved prediction JSON to continue AI training across sessions. The model learns from every pick you make and adapts its weights automatically.</div>
      </div>}

      {/* ── BOTTOM NAV ── */}
      <div style={{position:"fixed",bottom:0,left:"50%",transform:"translateX(-50%)",width:"100%",maxWidth:480,background:"rgba(8,12,20,0.98)",backdropFilter:"blur(20px)",borderTop:"1px solid rgba(255,255,255,0.05)",display:"flex",padding:"10px 0 18px",zIndex:300}}>
        {[{id:"fixtures",icon:"📅",label:"Fixtures"},{id:"favourites",icon:"⭐",label:"My Teams"},{id:"ai",icon:"🤖",label:"AI Stats"}].map(t=>(
          <button key={t.id} onClick={()=>setNav(t.id)} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:3,cursor:"pointer",background:"none",border:"none",padding:0,position:"relative"}}>
            {t.id==="fixtures"&&liveCount>0&&<div style={{position:"absolute",top:0,right:"50%",transform:"translateX(60%)",background:"#ff3b30",color:"#fff",borderRadius:7,fontSize:8,fontWeight:800,padding:"1px 4px"}}>{liveCount}</div>}
            <span style={{fontSize:21}}>{t.icon}</span>
            <span style={{fontSize:9,fontWeight:800,letterSpacing:"0.08em",textTransform:"uppercase",color:nav===t.id?"#00e676":"#3a4258"}}>{t.label}</span>
            {nav===t.id&&<div style={{width:16,height:2,borderRadius:1,background:"#00e676"}}/>}
          </button>
        ))}
      </div>

      {/* ── MODAL ── */}
      {openMatch && <MatchModal match={openMatch} ai={ai} onClose={()=>setOpen(null)} onPredict={handlePredict} userPick={picks[openMatch.id]}/>}
    </div>
  );
}
