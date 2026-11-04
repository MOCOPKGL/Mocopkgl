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

    async function getTable(table, query) {
      const url = `${SUPABASE_URL}/rest/v1/${table}?${query || "select=*"}`;
      const response = await fetch(url, { headers });
      const text = await response.text();
      if (!response.ok) throw new Error(text || `Unable to load ${table}`);
      return text ? JSON.parse(text) : [];
    }

    const [teamsRaw,coursesRaw,holesRaw,eventsRaw,matchesRaw] = await Promise.all([
      getTable("pkgl_teams","select=id,nickname"),
      getTable("pkgl_courses","select=id,name"),
      getTable("pkgl_holes","select=course_id,hole_number,par&order=hole_number.asc"),
      getTable("pkgl_events","select=id,event_order,month_name,course_id&order=event_order.asc"),
      getTable("pkgl_matches","select=id,event_id,home_team_id,away_team_id,home_scores,away_scores,status")
    ]);

    const teams = teamsRaw.map(t => ({ id:t.id, name:t.nickname }));
    const teamName = Object.fromEntries(teams.map(t => [t.id,t.name]));

    const holesByCourse = {};
    for (const h of holesRaw) {
      if (!holesByCourse[h.course_id]) holesByCourse[h.course_id] = [];
      holesByCourse[h.course_id].push({
        hole_number:Number(h.hole_number),
        par:Number(h.par)
      });
    }

    const eventById = Object.fromEntries(eventsRaw.map(e => [e.id,e]));
    const finalMatches = matchesRaw.filter(m => m.status === "final");

    const standings = {};
    for (const t of teams) {
      standings[t.id] = { id:t.id, name:t.name, gp:0, w:0, l:0, t:0, pts:0 };
    }

    let eagles=0;
    let birdies=0;
    let pars=0;
    let holesPlayed=0;
    let estimatedHours=0;

    for (const m of finalMatches) {
      const home=standings[m.home_team_id];
      const away=standings[m.away_team_id];
      if (!home || !away) continue;

      const event=eventById[m.event_id];
      const holes=event ? (holesByCourse[event.course_id] || []) : [];
      const hs=Array.isArray(m.home_scores) ? m.home_scores : [];
      const as=Array.isArray(m.away_scores) ? m.away_scores : [];

      const homeTotal=hs.reduce((n,v)=>n+(Number(v)||0),0);
      const awayTotal=as.reduce((n,v)=>n+(Number(v)||0),0);

      home.gp++;
      away.gp++;

      if (homeTotal < awayTotal) {
        home.w++; away.l++; home.pts+=3;
      } else if (awayTotal < homeTotal) {
        away.w++; home.l++; away.pts+=3;
      } else {
        home.t++; away.t++; home.pts++; away.pts++;
      }

      // Two parent-kid teams play every hole in a match.
      holesPlayed += holes.length * 2;
      estimatedHours += (holes.length / 9) * 4;

      holes.forEach((hole,i)=>{
        [Number(hs[i]),Number(as[i])].forEach(score=>{
          if (!Number.isFinite(score) || score < 1) return;
          const diff=score-hole.par;
          if (diff===-2) eagles++;
          else if (diff===-1) birdies++;
          else if (diff===0) pars++;
        });
      });
    }

    const standingsRows = Object.values(standings).sort((a,b)=>
      b.pts-a.pts ||
      b.w-a.w ||
      a.name.localeCompare(b.name)
    );

    const teamOfMonth=[];
    for (const event of eventsRaw) {
      const all=matchesRaw.filter(m=>m.event_id===event.id);
      const finals=all.filter(m=>m.status==="final");
      if (!all.length || finals.length !== all.length) continue;

      const scores=[];
      for (const m of finals) {
        const homeTotal=(m.home_scores||[]).reduce((n,v)=>n+(Number(v)||0),0);
        const awayTotal=(m.away_scores||[]).reduce((n,v)=>n+(Number(v)||0),0);
        scores.push({team:teamName[m.home_team_id] || "Team",score:homeTotal});
        scores.push({team:teamName[m.away_team_id] || "Team",score:awayTotal});
      }
      scores.sort((a,b)=>a.score-b.score || a.team.localeCompare(b.team));
      if (scores[0]) {
        teamOfMonth.push({
          event_order:Number(event.event_order)||0,
          month:event.month_name,
          team:scores[0].team,
          score:scores[0].score
        });
      }
    }

    teamOfMonth.sort((a,b)=>a.event_order-b.event_order);

    const body={
      stats:{
        teams:teams.length,
        matchesPlayed:finalMatches.length,
        holesPlayed,
        estimatedHours:Math.round(estimatedHours),
        eagles,
        birdies,
        pars,
        completedMonths:teamOfMonth.length
      },
      teamOfMonth:teamOfMonth.map(({month,team,score})=>({month,team,score})),
      standings:standingsRows
    };

    return {
      statusCode:200,
      headers:{
        "Content-Type":"application/json",
        "Cache-Control":"no-store, max-age=0"
      },
      body:JSON.stringify(body)
    };
  } catch (error) {
    return {
      statusCode:500,
      headers:{ "Content-Type":"application/json" },
      body:JSON.stringify({ error:error.message || "Unable to load guest data." })
    };
  }
};
