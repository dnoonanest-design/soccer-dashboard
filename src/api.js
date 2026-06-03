const BASE = "https://soccer-ai-predictor-production.up.railway.app/api";

async function get(path) {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`${res.status} ${path}`);
  return res.json();
}

export const api = {
  matches: (status, leagueId) => {
    const p = new URLSearchParams();
    if (status) p.set("status", status);
    if (leagueId) p.set("league_id", leagueId);
    return get(`/matches?${p}`);
  },
  summary: () => get("/summary"),
  leagues: () => get("/leagues"),
  prediction: (id) => get(`/matches/${id}/prediction`),
  stats: (id) => get(`/matches/${id}/stats`),
  probabilityHistory: (id) => get(`/matches/${id}/probability-history`),
  teamProfile: (teamId, leagueId) => get(`/teams/${teamId}/profile${leagueId ? `?league_id=${leagueId}` : ""}`),
  upcomingFixtures: (days = 3) => get(`/fixtures/upcoming?days=${days}`),
  valueCentre: (minEdge = 3) => get(`/value-centre?min_edge=${minEdge}`),
  trackRecord: () => get("/track-record"),
  accuracy: () => get("/accuracy"),
  h2h: (homeId, awayId) => get(`/matches/h2h?home=${homeId}&away=${awayId}`),
};
