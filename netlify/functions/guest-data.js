function compareMonthlyCountback(a,b,holeCount,teamName){

  if(a.score!==b.score){
    return a.score-b.score;
  }

  const sumRange=(row,start,end)=>
    row.roundScores
      .slice(start,end)
      .reduce((n,v)=>n+(Number(v)||0),0);

  if(holeCount>=18){
    const back9=sumRange(a,9,18)-sumRange(b,9,18);
    if(back9!==0)return back9;

    const last6=sumRange(a,12,18)-sumRange(b,12,18);
    if(last6!==0)return last6;

    const last3=sumRange(a,15,18)-sumRange(b,15,18);
    if(last3!==0)return last3;

    const lastHole=(Number(a.roundScores[17])||0)-(Number(b.roundScores[17])||0);
    if(lastHole!==0)return lastHole;
  } else {
    const last6=sumRange(a,3,9)-sumRange(b,3,9);
    if(last6!==0)return last6;

    const last3=sumRange(a,6,9)-sumRange(b,6,9);
    if(last3!==0)return last3;

    const lastHole=(Number(a.roundScores[8])||0)-(Number(b.roundScores[8])||0);
    if(lastHole!==0)return lastHole;
  }

  if(a.birdies!==b.birdies){
    return b.birdies-a.birdies;
  }

  return (teamName[a.teamId]||"Team")
    .localeCompare(teamName[b.teamId]||"Team");
}


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

    const [teamsRaw,holesRaw,eventsRaw,matchesRaw,scoresRaw] = await Promise.all([
      getTable("pkgl_teams","select=id,nickname&is_admin=eq.false"),
      getTable("pkgl_holes","select=course_id,hole_number,par&order=hole_number.asc"),
      getTable("pkgl_events","select=id,event_order,month_name,course_id&order=event_order.asc"),
      getTable("pkgl_matches","select=id,event_id,home_team_id,away_team_id,status,match_order"),
      getTable("pkgl_scores","select=match_id,home_scores,away_scores")
    ]);

    const teams = teamsRaw.map(t => ({ id:t.id, name:t.nickname }));
    const teamName = Object.fromEntries(teams.map(t => [t.id,t.name]));
    const scoresByMatch = Object.fromEntries(scoresRaw.map(s => [s.match_id,s]));

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
      const scoreRow=scoresByMatch[m.id] || {};
      const hs=Array.isArray(scoreRow.home_scores) ? scoreRow.home_scores : [];
      const as=Array.isArray(scoreRow.away_scores) ? scoreRow.away_scores : [];

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

      holesPlayed += holes.length * 2;
      estimatedHours += (holes.length / 9) * 6;

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
    const completedEventIds=new Set();

    for (const event of eventsRaw) {
      const all=matchesRaw.filter(m=>m.event_id===event.id);
      const finals=all.filter(m=>m.status==="final");
      if (!all.length || finals.length !== all.length) continue;

      const holes=holesByCourse[event.course_id] || [];
      const roundPar=holes.reduce((n,h)=>n+Number(h.par||0),0);
      const scoreMap={};

      const addRound=(teamId,score,roundScores)=>{
        const cleanScores=holes.map((_,i)=>Number((roundScores||[])[i])||0);

        let birdies=0;

        holes.forEach((hole,i)=>{
          const value=cleanScores[i];
          if(
            value>=1
            &&
            value===Number(hole.par)-1
          ){
            birdies++;
          }
        });

        scoreMap[teamId]={
          teamId,
          score,
          par:roundPar,
          birdies,
          roundScores:cleanScores
        };
      };

      for (const m of finals) {
        const scoreRow=scoresByMatch[m.id] || {};
        const hs=Array.isArray(scoreRow.home_scores) ? scoreRow.home_scores : [];
        const as=Array.isArray(scoreRow.away_scores) ? scoreRow.away_scores : [];
        const homeTotal=hs.reduce((n,v)=>n+(Number(v)||0),0);
        const awayTotal=as.reduce((n,v)=>n+(Number(v)||0),0);

        addRound(m.home_team_id,homeTotal,hs);
        addRound(m.away_team_id,awayTotal,as);
      }

      const winner=Object.values(scoreMap)
        .sort((a,b)=>
          compareMonthlyCountback(
            a,
            b,
            holes.length,
            teamName
          )
        )[0];

      if(!winner) continue;

      const relative=winner.score-winner.par;
      const toParLabel=
        relative<0
        ?`${Math.abs(relative)} under`
        :relative>0
        ?`${relative} over`
        :"Even par";

      teamOfMonth.push({
        event_id:event.id,
        event_order:Number(event.event_order)||0,
        month:event.month_name,
        team:teamName[winner.teamId] || "Team",
        score:winner.score,
        birdies:winner.birdies,
        relative,
        toParLabel
      });

      completedEventIds.add(event.id);
    }

    teamOfMonth.sort((a,b)=>a.event_order-b.event_order);

    return {
      statusCode:200,
      headers:{
        "Content-Type":"application/json",
        "Cache-Control":"no-store, max-age=0"
      },
      body:JSON.stringify({
        stats:{
          teams:teams.length,
          matchesPlayed:finalMatches.length,
          holesPlayed,
          estimatedHours:Math.round(estimatedHours),
          eagles,
          birdies,
          pars,
          completedMonths:completedEventIds.size
        },
        teamOfMonth:teamOfMonth.map(({month,team,score,birdies,relative,toParLabel})=>({month,team,score,birdies,relative,toParLabel})),
        standings:standingsRows
      })
    };
  } catch (error) {
    return {
      statusCode:500,
      headers:{ "Content-Type":"application/json" },
      body:JSON.stringify({ error:error.message || "Unable to load guest data." })
    };
  }
};
