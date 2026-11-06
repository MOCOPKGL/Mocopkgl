/* PKGL Records & Awards - read-only calculations. No database/API/auth writes. */
'use strict';
function pkglAwardsData(){
  const s=(typeof D!=='undefined'&&D)||{},teams=Array.isArray(s.teams)?s.teams:[],events=Array.isArray(s.events)?s.events:[],courses=Array.isArray(s.courses)?s.courses:[],matches=Array.isArray(s.matches)?s.matches:[];
  const names=new Map(teams.map(t=>[String(t.id),String(t.nickname||'Team')]));
  const em=new Map(events.map(e=>[String(e.id),e])),cm=new Map(courses.map(c=>[String(c.id),c]));
  const rows=[],games=[];
  for(const m of matches){
    if(!m||m.status!=='final')continue;
    const e=em.get(String(m.event_id)),c=e&&cm.get(String(e.course_id)),holes=c&&Array.isArray(c.holes)?c.holes:[];
    if(!e||!c||holes.length<3)continue;
    const pars=holes.map(h=>Number(h.par));
    if(!pars.every(p=>Number.isInteger(p)&&p>=2&&p<=7))continue;
    const scores=a=>Array.isArray(a)&&a.length===pars.length&&a.every(n=>n!==null&&n!==''&&Number.isInteger(Number(n))&&Number(n)>=1&&Number(n)<=20)?a.map(Number):null;
    const hs=scores(m.home_scores),as=scores(m.away_scores),hid=String(m.home_team_id),aid=String(m.away_team_id);
    if(!hs||!as||!names.has(hid)||!names.has(aid)||hid===aid)continue;
    const make=(id,a)=>{
      const d=a.map((n,i)=>n-pars[i]),relative=d.reduce((n,x)=>n+x,0);
      let streak=0,longest=0;
      d.forEach(x=>{streak=x<=0?streak+1:0;longest=Math.max(longest,streak)});
      return {id,name:names.get(id),month:String(e.month_name||'Event'),order:Number(e.event_order)||0,courseId:String(c.id),course:String(c.name||'Course'),count:a.length,scores:a,diffs:d,strokes:a.reduce((n,x)=>n+x,0),relative,birdies:d.filter(x=>x===-1).length,doubles:d.filter(x=>x>=2).length,pars:d.filter(x=>x<=0).length,longest,per9:relative*9/a.length,first3:d.slice(0,3).reduce((n,x)=>n+x,0)};
    };
    const home=make(hid,hs),away=make(aid,as);rows.push(home,away);games.push({e,home,away});
  }
  const tstats=new Map(teams.map(t=>[String(t.id),{id:String(t.id),name:String(t.nickname||'Team'),rounds:[],clutchSum:0,clutchN:0,comebacks:0,upsets:0,bounceYes:0,bounceN:0}]));
  rows.forEach(r=>{const t=tstats.get(r.id);if(t)t.rounds.push(r)});
  const rankCache=new Map();
  for(const g of games){
    const h=tstats.get(g.home.id),a=tstats.get(g.away.id),n=g.home.count,homeLead=g.home.scores.slice(0,n-3).reduce((v,x)=>v+x,0)-g.away.scores.slice(0,n-3).reduce((v,x)=>v+x,0),margin=g.home.strokes-g.away.strokes,homeLast=g.home.scores.slice(-3).reduce((v,x)=>v+x,0),awayLast=g.away.scores.slice(-3).reduce((v,x)=>v+x,0);
    h.clutchSum+=awayLast-homeLast;h.clutchN++;a.clutchSum+=homeLast-awayLast;a.clutchN++;
    if(homeLead>0&&margin<0)h.comebacks++;
    if(homeLead<0&&margin>0)a.comebacks++;
    if(margin!==0&&typeof rankingsBeforeEvent==='function'){
      const order=Number(g.e.event_order);
      if(Number.isFinite(order)){
        if(!rankCache.has(order))rankCache.set(order,rankingsBeforeEvent(order));
        const ranks=rankCache.get(order)||[],hi=ranks.findIndex(x=>String(x.id)===g.home.id),ai=ranks.findIndex(x=>String(x.id)===g.away.id);
        if(hi>=0&&ai>=0&&ranks[hi].gp&&ranks[ai].gp){
          if(margin<0&&hi>ai)h.upsets++;
          if(margin>0&&ai>hi)a.upsets++;
        }
      }
    }
  }
  for(const t of tstats.values()){
    t.rounds.sort((a,b)=>a.order-b.order);
    const rr=t.rounds;let diff=[];
    for(const r of rr){
      diff=diff.concat(r.diffs);
      for(let i=0;i<r.count-1;i++)if(r.diffs[i]>=1){t.bounceN++;if(r.diffs[i+1]<=0)t.bounceYes++}
    }
    t.holes=diff.length;
    t.birdies=rr.reduce((n,r)=>n+r.birdies,0);
    t.clean=diff.length?100*diff.filter(x=>x<2).length/diff.length:null;
    t.parRate=diff.length?100*diff.filter(x=>x<=0).length/diff.length:null;
    t.birdiesPer9=diff.length?t.birdies*9/diff.length:null;
    t.bounce=t.bounceN?100*t.bounceYes/t.bounceN:null;
    t.longest=rr.length?Math.max(...rr.map(r=>r.longest)):null;
    t.first3=rr.length?rr.reduce((n,r)=>n+r.first3,0)/rr.length:null;
    t.clutch=t.clutchN?t.clutchSum/t.clutchN:null;
    t.upsets=rr.length?t.upsets:null;
    t.comebacks=rr.length?t.comebacks:null;
    t.improve=rr.length>=4?(rr[0].per9+rr[1].per9-rr[rr.length-1].per9-rr[rr.length-2].per9)/2:null;
    if(diff.length>=9){
      const avg=diff.reduce((n,x)=>n+x,0)/diff.length;
      t.variance=Math.sqrt(diff.reduce((n,x)=>n+(x-avg)*(x-avg),0)/diff.length);
    }else t.variance=null;
  }
  return {teams:[...tstats.values()],rounds:rows,games,courses};
}
function pkglAwardsSigned(n,dec){const v=Math.abs(n)<0.0000001?0:n;return (v>0?'+':'')+v.toFixed(dec)}
function pkglAwardsBoard(title,desc,stats,field,format,low){
  const eligible=stats.filter(t=>Number.isFinite(t[field])).slice().sort((a,b)=>(low?a[field]-b[field]:b[field]-a[field])||a.name.localeCompare(b.name));
  let inner='<p class="pkgl-award-desc">'+escapeHtml(desc)+'</p>';
  if(!eligible.length)inner+='<div class="pkgl-award-none">Awaiting enough final scorecards.</div>';
  else{
    const first=eligible[0];
    inner+='<div class="pkgl-award-leading"><span>SEASON LEADER</span><strong>'+escapeHtml(first.name)+'</strong><b>'+escapeHtml(format(first[field]))+'</b></div><ol>';
    eligible.slice(1,4).forEach((t,i)=>{inner+='<li><span>'+(i+2)+'. '+escapeHtml(t.name)+'</span><b>'+escapeHtml(format(t[field]))+'</b></li>'});
    inner+='</ol>';
  }
  return '<article class="pkgl-award-panel"><h4>'+escapeHtml(title)+'</h4>'+inner+'</article>';
}
function pkglAwardsRecord(title,arr,field,format,low){
  const sorted=arr.slice().sort((a,b)=>(low?a[field]-b[field]:b[field]-a[field])||a.name.localeCompare(b.name));
  const best=sorted[0];
  return '<div class="pkgl-award-record"><span>'+escapeHtml(title)+'</span><b>'+(best?escapeHtml(format(best[field])):'—')+'</b><strong>'+(best?escapeHtml(best.name):'Awaiting scorecards')+'</strong><small>'+(best?escapeHtml(best.month+' · '+best.course):'Final rounds only')+'</small></div>';
}
function showRecordsAwards(){
  currentView={type:'records-awards'};
  const outlet=$('#view');
  try{
    const d=pkglAwardsData(),teams=d.teams,rounds=d.rounds,games=d.games;
    const pct=n=>n.toFixed(1)+'%',dec=n=>n.toFixed(2),signed=n=>pkglAwardsSigned(n,1),count=n=>String(n);
    let comebacks=[],pairs=new Map();
    for(const g of games){
      const n=g.home.count,before=g.home.scores.slice(0,n-3).reduce((v,x)=>v+x,0)-g.away.scores.slice(0,n-3).reduce((v,x)=>v+x,0),end=g.home.strokes-g.away.strokes;
      if(before>0&&end<0)comebacks.push(Object.assign({},g.home,{behind:before}));
      if(before<0&&end>0)comebacks.push(Object.assign({},g.away,{behind:-before}));
      const ids=[g.home.id,g.away.id].sort(),key=ids.join('|');
      if(!pairs.has(key))pairs.set(key,{ids,played:0,winA:0,winB:0,ties:0});
      const p=pairs.get(key);p.played++;
      const a=ids[0]===g.home.id?g.home.strokes:g.away.strokes,b=ids[1]===g.home.id?g.home.strokes:g.away.strokes;
      if(a<b)p.winA++;else if(b<a)p.winB++;else p.ties++;
    }
    const rival=[...pairs.values()].sort((a,b)=>b.played-a.played||Math.abs(a.winA-a.winB)-Math.abs(b.winA-b.winB));
    const teamName=id=>{const t=teams.find(x=>x.id===id);return t?t.name:'Team'};
    let html='<section class="pkgl-awards" aria-label="Records and Awards">';
    html+='<div class="pkgl-award-hero"><span>MOCO PKGL · OFFICIAL SEASON TRACKER</span><h2>🏆 Records &amp; Awards</h2><p>League legends are built one hole at a time. All stats automatically update from finalized scorecards.</p><div class="pkgl-award-counts"><span><b>'+games.length+'</b> finalized matches</span><span><b>'+rounds.length+'</b> team rounds</span><span><b>'+teams.filter(t=>t.rounds.length).length+'</b> active teams</span></div></div>';
    if(!games.length)html+='<div class="pkgl-award-none">Final scorecards will populate this page automatically. No additional entry required.</div>';
    html+='<h3 class="pkgl-award-section">🏅 League Record Book</h3><p class="pkgl-award-sub">Single-round highlights; 9-hole and 18-hole records are kept separate.</p><div class="pkgl-award-records">';
    html+=pkglAwardsRecord('Lowest round · 9 holes',rounds.filter(r=>r.count===9),'relative',n=>pkglAwardsSigned(n,0),true);
    html+=pkglAwardsRecord('Lowest round · 18 holes',rounds.filter(r=>r.count===18),'relative',n=>pkglAwardsSigned(n,0),true);
    html+=pkglAwardsRecord('Most birdies · 9 holes',rounds.filter(r=>r.count===9),'birdies',count,false);
    html+=pkglAwardsRecord('Most birdies · 18 holes',rounds.filter(r=>r.count===18),'birdies',count,false);
    html+=pkglAwardsRecord('Longest par-or-better streak',rounds,'longest',n=>n+' holes',false);
    html+=pkglAwardsRecord('Biggest comeback win',comebacks,'behind',n=>n+' strokes',false);
    html+='</div><h3 class="pkgl-award-section">🔥 Season Leaderboards</h3><p class="pkgl-award-sub">Every team ranked from scores already entered into PKGL.</p><div class="pkgl-award-boards">';
    const b=(title,note,key,fmt,low)=>pkglAwardsBoard(title,note,teams,key,fmt,low);
    html+=b('Hottest Team','Longest streak at par or better within a round.','longest',n=>n+' holes');
    html+=b('Birdie Machine','Average birdies per 9 team holes, normalized for longer rounds.','birdiesPer9',n=>dec(n)+' / 9');
    html+=b('Damage Control','Percent of holes without a double bogey or worse.','clean',pct);
    html+=b('Bounce-Back Kings','Par or better immediately after a bogey or worse in the same round.','bounce',pct);
    html+=b('Most Improved','First two vs latest two rounds, improvement in to-par strokes per 9 holes; 4 rounds required.','improve',n=>signed(n)+' / 9');
    html+=b('Giant Killers','Wins against higher-ranked teams entering an event (both with prior matches).','upsets',n=>n+' wins');
    html+=b('Roller Coaster','Most variable hole scores relative to par (standard deviation).','variance',n=>dec(n)+' SD');
    html+=b('Fast Starters','Best average score versus par through the first 3 holes.','first3',n=>signed(n)+' vs par',true);
    html+=b('Par Masters','Percent of team holes scoring par or better.','parRate',pct);
    html+=b('Clutch Kings','Average strokes gained on opponent over final 3 holes.','clutch',n=>signed(n)+' strokes');
    html+=b('Comeback Kings','Wins after trailing with 3 holes left.','comebacks',n=>n+' wins');
    html+='</div><h3 class="pkgl-award-section">⛳ Course Kings</h3><p class="pkgl-award-sub">Lowest average to-par strokes per nine holes, minimum one completed round at that course.</p><div class="pkgl-award-course">';
    const allCourses=d.courses.filter(c=>rounds.some(r=>r.courseId===String(c.id)));
    for(const c of allCourses){
      const ranked=teams.map(t=>{const rs=t.rounds.filter(r=>r.courseId===String(c.id));return {name:t.name,rounds:rs.length,avg:rs.length?rs.reduce((n,r)=>n+r.per9,0)/rs.length:Infinity}}).filter(t=>t.rounds).sort((a,b)=>a.avg-b.avg||a.name.localeCompare(b.name));
      if(ranked.length){const w=ranked[0];html+='<div class="pkgl-award-course-row"><span>'+escapeHtml(String(c.name||'Course'))+'</span><strong>'+escapeHtml(w.name)+'</strong><b>'+escapeHtml(signed(w.avg))+' / 9</b><small>'+w.rounds+' round(s)</small></div>'}
    }
    if(!allCourses.length)html+='<div class="pkgl-award-none">Awaiting completed rounds.</div>';
    html+='</div><h3 class="pkgl-award-section">⚔️ Rivalry Tracker</h3><p class="pkgl-award-sub">Head-to-head histories, ranked by number of meetings.</p><div class="pkgl-award-rivals">';
    for(const p of rival.slice(0,12)){
      html+='<div class="pkgl-award-rival"><strong>'+escapeHtml(teamName(p.ids[0]))+' vs '+escapeHtml(teamName(p.ids[1]))+'</strong><b>'+p.winA+'–'+p.winB+(p.ties?'–'+p.ties:'')+'</b><small>'+p.played+' meeting(s) · wins for each team'+(p.ties?' · ties':'')+'</small></div>';
    }
    if(!rival.length)html+='<div class="pkgl-award-none">Rivalries appear after matches are final.</div>';
    html+='</div><p class="pkgl-award-foot">Read-only. Draft and incomplete scorecards are excluded. Statistics use recorded scores and existing PKGL pars, including league-specific hole rules. This record book covers the season data available to the website.</p></section>';
    outlet.innerHTML=html;
  }catch(e){
    console.error('PKGL records view unavailable:',e);
    outlet.innerHTML='<div class="card"><h2>Records &amp; Awards</h2><p>Statistics are temporarily unavailable. Scores and standings are unchanged.</p></div>';
  }
}
