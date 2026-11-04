exports.handler = async function (event) {
  try {
    if (event.httpMethod !== "GET") {
      return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }) };
    }

    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!SUPABASE_URL || !SERVICE_KEY) {
      throw new Error("Server configuration is missing.");
    }

    const headers = {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`
    };

    async function getTable(table, query="select=*") {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, { headers });
      const text = await r.text();
      if (!r.ok) throw new Error(text || `Unable to load ${table}`);
      return text ? JSON.parse(text) : [];
    }

    const [teamsRaw,coursesRaw,holesRaw,eventsRaw,matchesRaw] = await Promise.all([
      getTable("pkgl_teams"),
      getTable("pkgl_courses"),
      getTable("pkgl_holes","select=*&order=hole_number.asc"),
      getTable("pkgl_events","select=*&order=event_order.asc"),
      getTable("pkgl_matches","select=*&status=eq.final")
    ]);

    const teams = teamsRaw.map(t => ({
      id: t.id,
      nickname: t.nickname,
      players: t.players || ""
    }));

    const teamNames = Object.fromEntries(teams.map(t => [t.id,t.nickname]));

    const courses = coursesRaw.map(c => ({
      id: c.id,
      name: c.name,
      holes: holesRaw
        .filter(h => h.course_id === c.id)
        .map(h => ({
          hole_number: h.hole_number,
          par: h.par,
          rule_name: h.rule_name || "",
          rule_description: h.rule_description || ""
        }))
    }));

    const events = eventsRaw.map(e => ({
      id: e.id,
      event_order: e.event_order,
      month_name: e.month_name,
      course_id: e.course_id
    }));

    const matches = matchesRaw.map(m => ({
      id: m.id,
      event_id: m.event_id,
      home_team_id: m.home_team_id,
      away_team_id: m.away_team_id,
      home_team: teamNames[m.home_team_id] || m.home_team || "Team",
      away_team: teamNames[m.away_team_id] || m.away_team || "Team",
      status: "final",
      home_scores: m.home_scores || [],
      away_scores: m.away_scores || []
    }));

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store, max-age=0"
      },
      body: JSON.stringify({ teams, courses, events, matches })
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: error.message || "Unable to load public league data." })
    };
  }
};
