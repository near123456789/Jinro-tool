// app.js — 人狼解析ツール v3 (候補ボタン/自己学習/スマホ共有)
console.log('[JinroTool] v3.1 buttons+MC+Learning');

let ALL_NAMES = [
  'アンナ','マイク','エリック','バニラ','メアリー','ジェイ','ショーン','ローラ','ビル','ミカ',
  'リリアン','メリル','ゲイル','スーザン','ロディ','エマ','フランク','トーマス','クリス','ジェシカ',
  'サンドラ','フェイ','ヒュー','マリアンヌ','ニック','ソフィア','チャン','カミラ','フレディ','アーニー',
  'ケイト','ウィル','セリーヌ','ポール','モーガン','ペネロペ','一'
];

const CO_OPTIONS = ['—','占いCO','霊能CO','狩人CO'];
const TRUE_ROLE_OPTIONS = ['未設定','村人','人狼','狂人','占い師','霊能者','狩人'];
const COLOR_OPTIONS = ['白','黒'];

const els = {
  candWrap:q('#candWrap'),
  addName:q('#addName'), newName:q('#newName'), reloadCandidates:q('#reloadCandidates'),
  clearAll:q('#clearAll'),
  selectedRoster:q('#selectedRoster'),
  dayTabs:q('#dayTabs'), lynchSel:q('#lynchSel'), killSel:q('#killSel'),
  applyDay:q('#applyDay'), undoDay:q('#undoDay'),
  historyBody:q('#historyBody'),
  chart:q('#chart'), rankingWrap:q('#rankingWrap'),
  seerRows:q('#seerRows'), addSeerRow:q('#addSeerRow'),
  medRows:q('#medRows'), addMedRow:q('#addMedRow'),
  err:q('#err'),
  // 共有UI
  exportModelText:q('#exportModelText'), importModelText:q('#importModelText'),
  exportModelFile:q('#exportModelFile'), resetModelBtn:q('#resetModel'),
  importFile:q('#importFile'), pasteModal:q('#pasteModal'),
  pasteArea:q('#pasteArea'), pasteApply:q('#pasteApply'), pasteCancel:q('#pasteCancel'),
};
function q(s){ return document.querySelector(s); }

// ======= 学習ストア =======
const MODEL_KEY = 'jinro_model_v1';
function loadModel(){ try{ return JSON.parse(localStorage.getItem(MODEL_KEY)||'{}'); }catch{ return {}; } }
function saveModel(m){ localStorage.setItem(MODEL_KEY, JSON.stringify(m)); }
function betaEstimate(a,b){ return a>0||b>0 ? (a)/(a+b) : 0.5; }
function updateBeta(a,b, wins, trials){ return {a:a+wins, b:b+(trials-wins)}; }
let MODEL = loadModel();

// ======= 状態 =======
const selected = new Map();
const days = [];
let currentDay = 2;
const seerResultsByDay = new Map();
const mediumResultsByDay = new Map();
const daySummaries = new Map();
let tempSeerRows = [];
let tempMedRows  = [];

// ======= 初期化 =======
document.addEventListener('DOMContentLoaded', init);
function init(){
  renderCandidateButtons(); renderSelected();
  buildDayTabs([2,3,4,5,6]); setActiveDay(2);

  els.addName.addEventListener('click', onAddName);
  els.newName.addEventListener('keydown', e=>{ if(e.key==='Enter'){ e.preventDefault(); onAddName(); }});
  els.reloadCandidates?.addEventListener('click', renderCandidateButtons);
  els.clearAll.addEventListener('click', clearAll);

  els.addSeerRow.addEventListener('click', ()=>{
    const seersAlive=getAliveNamesByCO('占いCO'); if(seersAlive.length===0) return;
    tempSeerRows.push({seer:seersAlive[0], target:'', color:''}); rebuildSeerRowsUI();
  });
  els.addMedRow.addEventListener('click', ()=>{
    const medsAlive=getAliveNamesByCO('霊能CO'); if(medsAlive.length===0) return;
    const prev=days.find(r=>r.day===currentDay-1); const suggested=prev?.lynch||'';
    tempMedRows.push({medium:medsAlive[0], target:suggested, color:''}); rebuildMediumRowsUI();
  });

  els.applyDay.addEventListener('click', applyDay);
  els.undoDay.addEventListener('click', undoDay);

  // 共有UI
  els.exportModelText?.addEventListener('click', exportModelText);
  els.importModelText?.addEventListener('click', openPasteModal);
  els.exportModelFile?.addEventListener('click', exportModelFile);
  els.resetModelBtn?.addEventListener('click', resetModel);
  els.importFile?.addEventListener('change', importModelFromFile);
  els.pasteApply?.addEventListener('click', applyPasteImport);
  els.pasteCancel?.addEventListener('click', closePasteModal);
}

// ======= 候補（ボタン） =======
function renderCandidateButtons(){
  els.candWrap.innerHTML='';
  const uniq = Array.from(new Set(ALL_NAMES.map(s => (s||'').trim()).filter(Boolean)));
  ALL_NAMES = uniq;

  uniq.forEach(n=>{
    const b=document.createElement('button');
    b.className='chip';
    b.textContent=n;
    b.title=`${n} を右に追加`;
    b.addEventListener('click',()=> addToRoster([n]));
    els.candWrap.appendChild(b);
  });
}
function onAddName(){
  const raw=(els.newName.value||'').trim(); if(!raw) return;
  const name=raw.replace(/\s+/g,' ');
  if(!ALL_NAMES.includes(name)){ ALL_NAMES.push(name); renderCandidateButtons(); }
  addToRoster([name]);
  els.newName.value='';
}

// ======= 右ロスター =======
function addToRoster(names){
  names.forEach(n=>{
    if(!selected.has(n)){ selected.set(n,{co:'—',trueRole:'未設定',alive:true}); }
  });
  renderSelected(); rebuildSeerRowsUI(); rebuildMediumRowsUI(); refreshEventSelectors();
}
function clearAll(){
  selected.clear(); days.length=0; daySummaries.clear();
  seerResultsByDay.clear(); mediumResultsByDay.clear();
  tempSeerRows=[]; tempMedRows=[];
  renderCandidateButtons(); renderSelected(); renderHistory(); renderChart(); renderRanking(null);
}
function renderSelected(){
  els.selectedRoster.innerHTML='';
  [...selected.keys()].forEach(name=>{
    const st=selected.get(name);
    const row=document.createElement('div'); row.className='row'+(st?.alive===false?' dead':'');
    const label=document.createElement('div'); label.className='name'; label.textContent=name;

    const coSel=document.createElement('select'); coSel.className='slim';
    CO_OPTIONS.forEach(opt=>{const o=document.createElement('option');o.value=opt;o.textContent=opt;coSel.appendChild(o);});
    coSel.value=st?.co||'—';
    coSel.addEventListener('change',()=>{ selected.set(name,{...(selected.get(name)||{}),co:coSel.value}); rebuildSeerRowsUI(); rebuildMediumRowsUI(); refreshEventSelectors(); });

    const roleSel=document.createElement('select'); roleSel.className='slim';
    TRUE_ROLE_OPTIONS.forEach(opt=>{const o=document.createElement('option');o.value=opt;o.textContent=opt;roleSel.appendChild(o);});
    roleSel.value=st?.trueRole||'未設定';
    roleSel.addEventListener('change',()=>{ selected.set(name,{...(selected.get(name)||{}),trueRole:roleSel.value}); });

    const rm=document.createElement('button'); rm.className='jj-btn jj-btn--ghost'; rm.textContent='削除';
    rm.onclick=()=>{ selected.delete(name); renderSelected(); rebuildSeerRowsUI(); rebuildMediumRowsUI(); refreshEventSelectors(); renderHistory(); };

    row.appendChild(label); row.appendChild(coSel); row.appendChild(roleSel); row.appendChild(rm);
    els.selectedRoster.appendChild(row);
  });
}

// ======= 日タブ =======
function buildDayTabs(listDays){
  els.dayTabs.innerHTML='';
  listDays.forEach(d=>{
    const b=document.createElement('button');
    b.className='tab'; b.dataset.day=String(d); b.textContent=`${d}d`;
    b.onclick=()=> setActiveDay(d);
    els.dayTabs.appendChild(b);
  });
}
function setActiveDay(d){
  currentDay=d;
  [...els.dayTabs.children].forEach(btn=>btn.classList.toggle('active',+btn.dataset.day===d));
  tempSeerRows=(seerResultsByDay.get(currentDay)?.map(x=>({...x}))??[]);
  tempMedRows =(mediumResultsByDay.get(currentDay)?.map(x=>({...x}))??[]);
  rebuildSeerRowsUI(); rebuildMediumRowsUI(); refreshEventSelectors();
}

// ======= 吊り/噛み セレクタ =======
function refreshEventSelectors(){
  const aliveNames=getAliveNames();
  const setOpts=(sel,names,ph)=>{
    sel.innerHTML='';
    const none=document.createElement('option'); none.value=''; none.textContent=ph; sel.appendChild(none);
    names.forEach(n=>{const o=document.createElement('option');o.value=n;o.textContent=n;sel.appendChild(o);});
    const rec=days.find(r=>r.day===currentDay);
    sel.value = rec ? (sel===els.lynchSel?(rec.lynch||''):(rec.kill||'')) : '';
  };
  setOpts(els.lynchSel, aliveNames, '— 吊り先 —');
  setOpts(els.killSel , aliveNames, '— 噛み先 —');
}
function getAliveNames(){ return [...selected.entries()].filter(([,v])=>v.alive!==false).map(([n])=>n); }
function getAliveNamesByCO(co){ return [...selected.entries()].filter(([,v])=>v.alive!==false && v.co===co).map(([n])=>n); }

// ======= 占い/霊能 入力UI =======
function rebuildSeerRowsUI(){
  els.seerRows.innerHTML='';
  const seersAlive=getAliveNamesByCO('占いCO');
  const namesAlive=getAliveNames();
  if(tempSeerRows.length===0 && seersAlive.length>0){
    tempSeerRows.push({seer:seersAlive[0], target:'', color:''});
  }
  tempSeerRows.forEach((row,idx)=>{
    const seerSel=selFrom(seersAlive,row.seer,(v)=>{row.seer=v;}, true);
    const tgtSel =selFrom(['',...namesAlive],row.target,(v)=>{row.target=v;});
    const colSel =selFrom(['',...COLOR_OPTIONS],row.color,(v)=>{row.color=v;});
    const del=mkBtn('×',()=>{tempSeerRows.splice(idx,1); rebuildSeerRowsUI();});
    els.seerRows.appendChild(seerSel); els.seerRows.appendChild(tgtSel); els.seerRows.appendChild(colSel); els.seerRows.appendChild(del);
  });
  els.addSeerRow.disabled=(seersAlive.length===0);
}
function rebuildMediumRowsUI(){
  els.medRows.innerHTML='';
  const medsAlive=getAliveNamesByCO('霊能CO');
  const namesAll=[...selected.keys()];
  const prev=days.find(r=>r.day===currentDay-1);
  const suggested=prev?.lynch||'';
  if(tempMedRows.length===0 && medsAlive.length>0){
    tempMedRows.push({medium:medsAlive[0], target:suggested, color:''});
  }
  tempMedRows.forEach((row,idx)=>{
    const mSel  =selFrom(medsAlive,row.medium,(v)=>{row.medium=v;}, true);
    if(!row.target){ row.target = suggested; }
    const tgtSel=selFrom(['',...namesAll],row.target,(v)=>{row.target=v;});
    const colSel=selFrom(['',...COLOR_OPTIONS],row.color,(v)=>{row.color=v;});
    const del=mkBtn('×',()=>{tempMedRows.splice(idx,1); rebuildMediumRowsUI();});
    els.medRows.appendChild(mSel); els.medRows.appendChild(tgtSel); els.medRows.appendChild(colSel); els.medRows.appendChild(del);
  });
  els.addMedRow.disabled=(medsAlive.length===0);
}

// ======= この日を確定 =======
function applyDay(){
  const lynch=els.lynchSel.value||null;
  const kill =els.killSel.value ||null;
  const hasAnySeer=tempSeerRows.some(r=>r.seer&&r.target&&r.color);
  const hasAnyMed =tempMedRows .some(r=>r.medium&&r.target&&r.color);
  if(!lynch && !kill && !hasAnySeer && !hasAnyMed){
    return showErr('吊り/噛み/占い/霊能のいずれかを入力してください。');
  }
  hideErr();

  let rec=days.find(r=>r.day===currentDay);
  if(!rec){ rec={day:currentDay}; days.push(rec); }
  if(lynch) rec.lynch=lynch;
  if(kill ) rec.kill =kill;

  if(lynch && selected.has(lynch)) selected.get(lynch).alive=false;
  if(kill  && selected.has(kill)  && kill!==lynch) selected.get(kill).alive=false;

  const cleanedSeer=tempSeerRows.filter(r=>r.seer&&r.target&&r.color);
  if(cleanedSeer.length>0) seerResultsByDay.set(currentDay, cleanedSeer);
  else seerResultsByDay.delete(currentDay);

  const cleanedMed=tempMedRows.filter(r=>r.medium&&r.target&&r.color);
  if(cleanedMed.length>0) mediumResultsByDay.set(currentDay, cleanedMed);
  else mediumResultsByDay.delete(currentDay);

  renderSelected(); renderHistory();

  const s=snapshotStateForDay(currentDay);
  const ranking = runEVRankingWithLearning(s);
  const bestEV=(ranking[0]?.ev??0.5);
  daySummaries.set(currentDay,{villageEV:bestEV, ranking});
  renderChart(); renderRanking(currentDay);

  setActiveDay(currentDay+1<=6?currentDay+1:currentDay);
}

function undoDay(){
  if(days.length===0 && !seerResultsByDay.has(currentDay) && !mediumResultsByDay.has(currentDay)) return;
  days.sort((a,b)=>a.day-b.day);
  const lastDay=days.length?days[days.length-1].day:currentDay;

  seerResultsByDay.delete(lastDay);
  mediumResultsByDay.delete(lastDay);
  if(days.length && days[days.length-1].day===lastDay) days.pop();

  selected.forEach(v=>v.alive=true);
  days.forEach(r=>{
    if(r.lynch && selected.has(r.lynch)) selected.get(r.lynch).alive=false;
    if(r.kill  && selected.has(r.kill) && r.kill!==r.lynch) selected.get(r.kill).alive=false;
  });

  daySummaries.delete(lastDay);
  renderSelected(); renderHistory(); renderChart(); renderRanking(days.length?days[days.length-1].day:null);
  setActiveDay(lastDay);
}

// ======= 履歴 =======
function renderHistory(){
  days.sort((a,b)=>a.day-b.day);
  els.historyBody.innerHTML = days.map(r=>{
    const aliveCount=getAliveNames().length;
    const semiCount =countSemiWhiteUpToDay(r.day);
    const grayCount = Math.max(0, aliveCount - semiCount);
    const medRows = mediumResultsByDay.get(r.day) || [];
    const medStr  = medRows.length ? medRows.map(m=>`${m.medium}:${m.target}=${m.color}`).join(' / ') : '—';
    return `<tr><td>${r.day}d</td><td>${r.lynch||'—'}</td><td>${r.kill||'—'}</td><td>${medStr}</td><td>${aliveCount}</td><td>${grayCount}</td></tr>`;
  }).join('');
}

// ======= 特徴抽出 =======
function countSemiWhiteUpToDay(day){
  const aliveNames=new Set(getAliveNames());
  const whites=new Set();
  [...seerResultsByDay.keys()].sort((a,b)=>a-b).forEach(d=>{
    if(d>day) return;
    (seerResultsByDay.get(d)||[]).forEach(r=>{
      if(r.color==='白'){ if(aliveNames.has(r.target)) whites.add(r.target); }
    });
  });
  return whites.size;
}
function snapshotStateForDay(day){
  const alive=[...selected.entries()].filter(([,v])=>v.alive!==false).map(([n,v])=>({name:n,co:v.co,trueRole:v.trueRole}));
  const sc=alive.filter(x=>x.co==='占いCO').length;
  const mc=alive.filter(x=>x.co==='霊能CO').length;
  const hc=alive.filter(x=>x.co==='狩人CO').length;
  const semi=countSemiWhiteUpToDay(day);

  const medRowsUpTo=[...mediumResultsByDay.entries()].filter(([d])=>d<=day).flatMap(([,rows])=>rows);
  const medBlack=medRowsUpTo.filter(r=>r.color==='黒').length;
  const medWhite=medRowsUpTo.filter(r=>r.color==='白').length;

  const seerConfirmed=(sc===1);
  const medConfirmed =(mc===1);

  const aliveCount=alive.length;
  const grayCount =Math.max(0, aliveCount - semi);

  return {day,sc,mc,hc,semi,medBlack,medWhite,seerConfirmed,medConfirmed,aliveCount,grayCount};
}

// ======= 候補列挙 =======
function enumerateCandidatesByDay(s){
  const acts = [];
  if (s.day === 2) {
    acts.push('灰吊り');
    if (s.sc === 2 && s.mc === 2) {
      acts.push('霊能ロラ');
      acts.push('霊能決め打ち');
    }
  } else {
    let baseActs = ['占い決め打ち','霊能決め打ち','灰決め打ち'];
    if (s.seerConfirmed) baseActs = baseActs.filter(a=>a!=='占い決め打ち');
    if (s.medConfirmed)  baseActs = baseActs.filter(a=>a!=='霊能決め打ち');
    acts.push(...baseActs);
  }
  const guardPlans = (s.hc >= 2) ? ['クロス','貫通'] : [null];
  const out=[];
  for(const a of acts){ for(const g of guardPlans){ out.push({a,g,label: g?`${a} × ${g}`:`${a}`}); } }
  return out;
}

// ======= MonteCarlo + 学習 =======
function runEVRankingWithLearning(state){
  const cands = enumerateCandidatesByDay(state);
  const simsPerCand = (state.day===2 ? 300 : 400);
  const results = cands.map(c=>{
    const evSim = simulatePolicy(state, c, simsPerCand);
    const key = contextKey(state, c);
    const entry = MODEL[key] || {a:1, b:1, seen:0};
    const updated = updateBeta(entry.a, entry.b, Math.round(evSim*simsPerCand), simsPerCand);
    MODEL[key] = {...updated, seen: (entry.seen||0) + simsPerCand};
    saveModel(MODEL);
    const evLearn = betaEstimate(MODEL[key].a, MODEL[key].b);
    const weight = Math.min(0.7, (MODEL[key].seen||0) / 4000);
    const ev = clamp01( (1-weight)*evSim + weight*evLearn );
    return { label:c.label, ev, evSim, evLearn, seen:MODEL[key].seen };
  }).sort((a,b)=> b.ev - a.ev);
  return results;
}
function contextKey(s, cand){
  const grayBucket = Math.min(6, Math.max(0, s.grayCount));
  return `d${s.day}|sc${s.sc}|mc${s.mc}|hc${s.hc}|g${grayBucket}|act:${cand.a}|guard:${cand.g||'-'}`;
}
function simulatePolicy(state, cand, n=400){
  let wins=0; for(let i=0;i<n;i++){ if(runOneGameWithPolicy(state, cand)) wins++; }
  return wins/n;
}

// ======= 1試行 =======
function runOneGameWithPolicy(state, cand){
  const roles = assignRoles9(state);
  if(!checkConsistencyUpToCurrentDay(roles)) return Math.random() < 0.5;

  let alive = [...selected.keys()].filter(p => selected.get(p)?.alive !== false);
  let day = state.day;

  const has2ClaimedHunter = (state.hc >= 2);
  let hunterClaims = getAliveNamesByCO('狩人CO');

  while(true){
    const lynch = pickLynch(alive, roles, day, cand, state, has2ClaimedHunter, hunterClaims);
    if(!lynch) return Math.random()<0.5;
    alive = alive.filter(p=>p!==lynch);

    let wolves = alive.filter(p=>roles[p]==='人狼');
    let vill   = alive.filter(p=>roles[p]!=='人狼');
    if(wolves.length===0) return true;
    if(wolves.length>=vill.length) return false;

    const kill = pickKill(alive, roles, cand, state);
    if(kill){ alive = alive.filter(p=>p!==kill); }

    wolves = alive.filter(p=>roles[p]==='人狼');
    vill   = alive.filter(p=>roles[p]!=='人狼');
    if(wolves.length===0) return true;
    if(wolves.length>=vill.length) return false;

    day++;
  }
}

// ======= 役職割当（9スタ） =======
function buildRolePool9(){ return ['村人','村人','村人','人狼','人狼','狂人','占い師','霊能者','狩人']; }
function assignRoles9(state){
  const allPlayers = [...selected.keys()];
  if(allPlayers.length !== 9) throw new Error(`9スタ前提：選択が${allPlayers.length}人。9人にして下さい。`);
  const roles={};
  allPlayers.forEach(p=>{
    const tr=selected.get(p)?.trueRole;
    if(tr && tr!=='未設定'){ roles[p]=tr; }
  });
  const pool = buildRolePool9();
  Object.values(roles).forEach(r=>{ const i=pool.indexOf(r); if(i>=0) pool.splice(i,1); });
  const remaining = allPlayers.filter(p=>!roles[p]);
  remaining.forEach(p=>{ const idx = Math.floor(Math.random()*pool.length); roles[p] = pool.splice(idx,1)[0]; });
  return roles;
}

// ======= 整合性チェック =======
function checkConsistencyUpToCurrentDay(roles){
  for(const [d,results] of seerResultsByDay){
    if(d>currentDay) continue;
    for(const r of results){
      if(r.color==='白' && roles[r.target]==='人狼') return false;
      if(r.color==='黒' && roles[r.target]!=='人狼') return false;
    }
  }
  for(const [d,results] of mediumResultsByDay){
    if(d>currentDay) continue;
    for(const r of results){
      if(r.color==='白' && roles[r.target]==='人狼') return false;
      if(r.color==='黒' && roles[r.target]!=='人狼') return false;
    }
  }
  return true;
}

// ======= 昼の吊り =======
function pickLynch(alive, roles, day, cand, state, has2ClaimedHunter, hunterClaims){
  const byCO = (co)=> alive.filter(p=> selected.get(p)?.co === co);
  const grays= alive.filter(p=>{
    const co = selected.get(p)?.co;
    return co!=='占いCO' && co!=='霊能CO' && co!=='狩人CO';
  });

  if(day===2){
    if(cand.a==='霊能ロラ'){
      const meds = byCO('霊能CO'); if(meds.length===0) return randomPick(grays)||randomPick(alive);
      return randomPick(meds);
    }
    if(cand.a==='霊能決め打ち'){
      const meds = byCO('霊能CO'); if(meds.length>=2) return randomPick(meds);
      return randomPick(grays)||randomPick(alive);
    }
    if(cand.g==='貫通' && has2ClaimedHunter){
      hunterClaims = hunterClaims.filter(h=> alive.includes(h));
      if(hunterClaims.length>0) return randomPick(hunterClaims);
    }
    return randomPick(grays)||randomPick(alive);
  }

  if(cand.a==='占い決め打ち'){
    const seers = byCO('占いCO'); if(seers.length>=2) return randomPick(seers);
    return randomPick(grays)||randomPick(alive);
  }
  if(cand.a==='霊能決め打ち'){
    const meds = byCO('霊能CO'); if(meds.length>=2) return randomPick(meds);
    return randomPick(grays)||randomPick(alive);
  }
  if(cand.a==='灰決め打ち'){
    if(cand.g==='貫通' && has2ClaimedHunter){
      hunterClaims = hunterClaims.filter(h=> alive.includes(h));
      if(hunterClaims.length>0) return randomPick(hunterClaims);
    }
    return randomPick(grays)||randomPick(alive);
  }
  return randomPick(grays)||randomPick(alive);
}

// ======= 夜の噛み =======
function pickKill(alive, roles, cand, state){
  const seers = alive.filter(p=> selected.get(p)?.co==='占いCO');
  const meds  = alive.filter(p=> selected.get(p)?.co==='霊能CO');
  const villagers = alive.filter(p=> roles[p]!=='人狼');

  let targets = [...seers, ...meds];
  if(targets.length===0) targets = villagers;

  if(cand.g==='クロス' && (seers.length>0 && meds.length>0)){
    if(Math.random()<0.4) return null;
  }
  return randomPick(targets);
}

function randomPick(arr){ if(!arr||arr.length===0) return null; return arr[Math.floor(Math.random()*arr.length)]; }

// ======= グラフ＆ランキング =======
function renderChart(){
  if(daySummaries.size===0){ els.chart.innerHTML='※ 確定した日がありません。'; return; }
  const entries = [...daySummaries.entries()].sort((a,b)=>a[0]-b[0]);
  const daysArr = entries.map(([d])=>d);
  const vill    = entries.map(([,s])=>s.villageEV);
  const w=680, h=220, pad=32;
  const x=(i)=> pad + (w-2*pad) * (i/(daysArr.length-1 || 1));
  const y=(p)=> pad + (h-2*pad) * (1 - p);
  const dots = vill.map((p,i)=> `<circle cx="${x(i).toFixed(1)}" cy="${y(p).toFixed(1)}" r="3" fill="#9ad09a" />`).join('');
  const gridY=[0,0.25,0.5,0.75,1].map(v=>{
    const yy=y(v).toFixed(1);
    return `<line x1="${pad}" y1="${yy}" x2="${w-pad}" y2="${yy}" stroke="#2b1f24" stroke-width="1"/>
            <text x="4" y="${(+yy)+4}" fill="#bfa9a0" font-size="10">${Math.round(v*100)}%</text>`;
  }).join('');
  const poly = `<polyline fill="none" stroke="#9ad09a" stroke-width="2" points="${vill.map((p,i)=>`${x(i)},${y(p)}`).join(' ')}" />`;
  const labels = daysArr.map((d,i)=>`<text x="${x(i)}" y="${h-6}" text-anchor="middle" fill="#cbb" font-size="11">${d}d</text>`).join('');
  els.chart.innerHTML = `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${gridY}${poly}${dots}${labels}</svg>`;
}
function renderRanking(day){
  if(day==null || !daySummaries.has(day)){ els.rankingWrap.innerHTML='※ 当日の記録がありません。'; return; }
  const { ranking } = daySummaries.get(day);
  els.rankingWrap.classList.remove('placeholder');
  els.rankingWrap.innerHTML = ranking.map((r,i)=>{
    const pct=(r.ev*100).toFixed(1)+'%';
    const tip=`学習:${(r.evLearn*100).toFixed(1)}% / 試行:${(r.evSim*100).toFixed(1)}% / n=${r.seen}`;
    return `<div title="${tip}"><strong>${i+1}. ${r.label}</strong><span class="pill">${pct}</span></div>`;
  }).join('');
}

// ======= 共有（テキスト/ファイル/リセット） =======
function exportModelText(){
  const json = localStorage.getItem(MODEL_KEY) || "{}";
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(json).then(()=> alert('学習データをコピーしました。'))
    .catch(()=> showFallbackText(json));
  } else { showFallbackText(json); }
}
function showFallbackText(text){
  if(!els.pasteArea || !els.pasteModal){ alert('コピーできない場合は長押しで選択→コピーしてください。'); return; }
  els.pasteArea.value = text;
  els.pasteModal.style.display = 'block';
  els.pasteArea.select();
  try { document.execCommand('copy'); } catch {}
}
function exportModelFile(){
  try{
    const json = localStorage.getItem(MODEL_KEY) || "{}";
    const blob = new Blob([json], {type:"application/json"});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    const stamp = new Date().toISOString().replace(/[:.]/g,'-');
    a.download = `jinro_model_v1_${stamp}.json`;
    document.body.appendChild(a);
    a.click();
    URL.revokeObjectURL(a.href);
    a.remove();
  }catch(e){ alert('保存に失敗しました。'); }
}
function importModelFromFile(e){
  const file = e.target.files?.[0]; if(!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try{ const incoming = JSON.parse(String(reader.result||"{}")); mergeOrOverwrite(incoming); }
    catch{ alert('読み込みに失敗しました（ファイル形式を確認）'); }
  };
  reader.readAsText(file, 'utf-8'); e.target.value = '';
}
function openPasteModal(){ els.pasteArea.value=''; els.pasteModal.style.display='block'; els.pasteArea.focus(); }
function closePasteModal(){ els.pasteModal.style.display='none'; }
function applyPasteImport(){
  try{ const incoming = JSON.parse(els.pasteArea.value || "{}"); mergeOrOverwrite(incoming); }
  catch{ alert('JSONの形式が不正です。'); }
  finally{ closePasteModal(); }
}
function mergeOrOverwrite(incoming){
  if(confirm('読み込んだ学習で上書きしますか？（キャンセルでマージ）')){
    localStorage.setItem(MODEL_KEY, JSON.stringify(incoming)); MODEL = incoming || {};
  }else{
    const mine = JSON.parse(localStorage.getItem(MODEL_KEY) || "{}");
    for(const k in incoming){
      const m = mine[k] || {a:1,b:1,seen:0};
      const t = incoming[k] || {};
      mine[k] = { a:(m.a||1)+(t.a||0), b:(m.b||1)+(t.b||0), seen:(m.seen||0)+(t.seen||0) };
    }
    localStorage.setItem(MODEL_KEY, JSON.stringify(mine)); MODEL = mine;
  }
  alert('学習データを取り込みました。ページを更新します。');
  location.reload();
}
function resetModel(){
  if(confirm('学習データをリセットしますか？（元に戻せません）')){
    localStorage.removeItem(MODEL_KEY); MODEL = {}; location.reload();
  }
}

// ======= 小物 =======
function selFrom(list, value, onChange, requireNonEmpty){
  const sel=document.createElement('select');
  list.forEach(v=>{
    const o=document.createElement('option'); o.value=String(v); o.textContent=String(v||'—'); sel.appendChild(o);
  });
  if(requireNonEmpty && (!value || !list.includes(value))) value=list[0]||'';
  sel.value = value ?? '';
  sel.addEventListener('change', ()=> onChange(sel.value) );
  return sel;
}
function mkBtn(text, on){ const b=document.createElement('button'); b.className='btn-icon'; b.textContent=text; b.addEventListener('click', on); return b; }
function clamp01(x){ return Math.max(0, Math.min(1, x)); }
function showErr(msg){ els.err.textContent=msg; els.err.style.display='block'; }
function hideErr(){ els.err.style.display='none'; }
