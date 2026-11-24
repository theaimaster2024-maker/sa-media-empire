'use strict';
/* Sale pipeline — five slots, every channel built to be sold. Owner only. */
const PL={rows:[]};
const PL_SLOTS=5,PL_LIST_AT=1000,PL_LOW=12,PL_HIGH=20;
const PL_STAGE={building:['Building','grey','ti-hammer'],monetized:['Earning','','ti-cash'],listed:['Listed for sale','sun','ti-tag'],sold:['Sold','','ti-circle-check'],dropped:['Dropped','grey','ti-minus']};
const PL_TREND={up:['ti-trending-up','Growing','up'],flat:['ti-minus','Steady','flat'],down:['ti-trending-down','Falling','down']};

function usd(v){return '$'+Math.round(n(v)).toLocaleString('en-US')}
function plActive(){return PL.rows.filter(r=>['building','monetized','listed'].includes(r.stage)).sort((a,b)=>a.position-b.position||String(a.created_at).localeCompare(String(b.created_at)))}
function plPast(){return PL.rows.filter(r=>['sold','dropped'].includes(r.stage)).sort((a,b)=>String(b.sold_on||b.updated_at||'').localeCompare(String(a.sold_on||a.updated_at||'')))}
function plChannel(r){return D.channels.find(c=>c.id===r.channel_id)||null}
function plFlippa(r){
  if(!r.monetized_on)return null;
  const d=new Date(r.monetized_on+'T00:00:00');d.setMonth(d.getMonth()+6);
  const iso=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const days=Math.ceil((d-new Date(todayISO()+'T00:00:00'))/864e5);
  return {iso,days};
}
/* The one line that says what to do with this channel next. */
function plNext(r){
  const m=n(r.monthly_usd);
  if(r.stage==='building')return ['ti-hammer','','Get it monetized.'];
  if(r.stage==='monetized'){
    if(r.trend==='down')return ['ti-alert-triangle','rose','Income is falling. List it this month.'];
    if(m>=PL_LIST_AT)return ['ti-tag','sun',`Passed ${usd(PL_LIST_AT)}. List it and keep growing.`];
    return ['ti-seeding','',`Grow to ${usd(PL_LIST_AT)} a month, then list.`];
  }
  if(r.trend==='down')return ['ti-alert-triangle','rose',r.floor_usd?`Falling while listed. Take any offer above ${usd(r.floor_usd)}.`:'Falling while listed. Set your lowest price now.'];
  return ['ti-rocket','','Listed. Keep uploading until the day it sells.'];
}

async function renderPipeline(){
  const v=$('#view');
  if(!PL.rows.length)v.innerHTML=head('Sale pipeline','Five slots. Every channel is built to be sold.')+'<div class="glass card empty"><div class="spin" style="margin:auto"></div></div>';
  const r=await sb.from('sale_pipeline').select('*').order('position');
  if(r.error){v.innerHTML=head('Sale pipeline')+errorBox(r.error.message);return}
  PL.rows=r.data||[];drawPipeline();
}

function drawPipeline(){
  const act=plActive(),past=plPast(),sold=past.filter(r=>r.stage==='sold');
  const running=act.reduce((s,r)=>s+n(r.monthly_usd),0),soldSum=sold.reduce((s,r)=>s+n(r.sold_usd),0);
  const open=Math.max(0,PL_SLOTS-act.length);
  $('#view').innerHTML=head('Sale pipeline','Five slots. Every channel is built to be sold.',`<button class="btn btn-primary" onclick="plEdit()"><i class="ti ti-plus"></i>Start a channel</button>`)+
  `<div class="row r-4" style="margin-bottom:18px">
    ${kpi('ti-layout-grid','Slots in use',`${act.length} of ${PL_SLOTS}`,open?`${open} open`:'Sell one to open a slot',open?'':'sun')}
    ${kpi('ti-cash','Running income',usd(running)+'<span class="pl-per"> /mo</span>','From channels not yet sold')}
    ${kpi('ti-tag','Pipeline value',usd(running*PL_LOW),`At ${PL_LOW}× monthly. ${PL_HIGH}× would be ${usd(running*PL_HIGH)}`)}
    ${kpi('ti-circle-check','Sold so far',usd(soldSum),`${sold.length} channel${sold.length===1?'':'s'}`)}
  </div>
  <div class="pl-grid">${act.map(plCard).join('')}${Array.from({length:open},()=>`<button class="pl-open" onclick="plEdit()"><i class="ti ti-plus"></i><b>Open slot</b><span>Start the next channel</span></button>`).join('')}</div>
  <div class="row r-2-1" style="margin-top:18px">
    <section class="glass card"><div class="card-h"><h2>Sold and dropped</h2><span class="sub">What each one taught</span></div>
      ${past.length?`<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Channel</th><th>Result</th><th>Date</th><th class="r">Price</th><th></th></tr></thead><tbody>${past.map(r=>`<tr><td><b>${esc(r.name)}</b>${r.notes?`<div class="li-s" style="white-space:normal">${esc(r.notes)}</div>`:''}</td><td><span class="pill ${PL_STAGE[r.stage][1]}">${PL_STAGE[r.stage][0]}</span></td><td>${fmtDate(r.sold_on)}</td><td class="r"><b>${r.stage==='sold'?usd(r.sold_usd):'—'}</b>${r.stage==='sold'&&n(r.monthly_usd)>0?`<div class="li-s">${(n(r.sold_usd)/n(r.monthly_usd)).toFixed(0)}× monthly</div>`:''}</td><td class="r"><details class="menu"><summary class="icon-btn" aria-label="More"><i class="ti ti-dots"></i></summary><div class="menu-pop"><button onclick="plEdit('${r.id}')">Edit</button><button class="danger" onclick="plDelete('${r.id}')">Delete</button></div></details></td></tr>`).join('')}</tbody></table></div>`:'<div class="empty">Nothing sold yet. The first sale proves the model.</div>'}
    </section>
    <section class="glass card pl-rules"><div class="card-h"><h2>The system</h2></div>
      <ol><li><b>Five slots.</b> Never more.</li><li><b>Built to sell.</b> The strongest channel goes first.</li><li><b>List at ${usd(PL_LIST_AT)},</b> aim for ${usd(2000)}. Ask ${PL_HIGH}×, hold at ${PL_LOW}×.</li><li><b>First drop, list.</b> Do not wait for it to recover.</li></ol>
    </section>
  </div>`;
}

function plCard(r){
  const c=plChannel(r),st=PL_STAGE[r.stage],tr=PL_TREND[r.trend]||PL_TREND.flat,m=n(r.monthly_usd),t=n(r.target_usd)||2000;
  const pct=Math.min(100,m/t*100),tick=Math.min(100,PL_LIST_AT/t*100),fl=plFlippa(r),nx=plNext(r);
  const facts=[];
  if(m>0)facts.push(['Likely price',`${usd(m*PL_LOW)} – ${usd(m*PL_HIGH)}`]);
  if(r.ask_usd)facts.push(['Asking',`${usd(r.ask_usd)}${m>0?` <i>${(n(r.ask_usd)/m).toFixed(0)}×</i>`:''}`]);
  if(r.floor_usd)facts.push(['Lowest I take',usd(r.floor_usd)]);
  if(fl)facts.push(['Flippa',fl.days>0?`${fmtDate(fl.iso)} <i>${fl.days} days</i>`:'Eligible now']);
  if(r.platforms)facts.push(['Listed on',esc(r.platforms)]);
  if(c&&n(c.partner_share)>0)facts.push(['Partner',`${esc(c.partner_name||'Partner')} ${n(c.partner_share)}%`]);
  return `<article class="glass pl-card">
    <header>${avatar(c||{name:r.name,initials:r.name.slice(0,2).toUpperCase()},40)}<div class="pl-id"><b>${esc(r.name)}</b><span class="pill ${st[1]}"><i class="ti ${st[2]}"></i>${st[0]}</span></div>
      <details class="menu"><summary class="icon-btn" aria-label="More"><i class="ti ti-dots"></i></summary><div class="menu-pop"><button onclick="plEdit('${r.id}')">Edit</button>${r.stage!=='building'?`<button onclick="plSold('${r.id}')">Mark as sold</button>`:''}<button onclick="plDrop('${r.id}')">Drop this channel</button><button class="danger" onclick="plDelete('${r.id}')">Delete</button></div></details></header>
    <div class="pl-money"><strong>${usd(m)}</strong><span>/mo</span><em class="pl-trend ${tr[2]}"><i class="ti ${tr[0]}"></i>${tr[1]}</em></div>
    <div class="pl-bar" role="img" aria-label="${usd(m)} of ${usd(t)} sell target"><div class="pl-fill" style="width:${pct}%"></div>${tick<100?`<div class="pl-tick" style="left:${tick}%"></div>`:''}</div>
    <div class="pl-scale"><span>$0</span>${tick<100?`<span style="left:${tick}%">List ${usd(PL_LIST_AT)}</span>`:''}<span>Sell ${usd(t)}</span></div>
    ${facts.length?`<dl class="pl-facts">${facts.map(([k,v])=>`<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>`:''}
    <p class="pl-next ${nx[1]}"><i class="ti ${nx[0]}"></i>${nx[2]}</p>
  </article>`;
}

function plEdit(id){
  const r=id?PL.rows.find(x=>x.id===id):{stage:'building',trend:'flat',target_usd:2000};
  if(!id&&plActive().length>=PL_SLOTS){confirmDialog('All five slots are in use','Sell or drop a channel first. The limit is what keeps every channel good enough to sell.','OK',false);return}
  const sel=(obj,cur)=>Object.entries(obj).map(([k,v])=>`<option value="${k}" ${k===cur?'selected':''}>${v[0]==='ti-trending-up'||v[0]==='ti-minus'||v[0]==='ti-trending-down'?v[1]:v[0]}</option>`).join('');
  dialog(`<form><h2>${id?'Edit channel':'Start a channel'}</h2><p class="dlg-sub">Income is in US dollars, as YouTube Studio shows it.</p><div class="grid2">
   <label class="fld"><span>Channel in this app</span><select class="inp" name="channel_id">${chOpts(r.channel_id,{none:'Not added yet'})}</select></label>
   <label class="fld"><span>Name</span><input class="inp" name="name" required value="${esc(r.name||'')}" placeholder="e.g. HomeFit"></label>
   <label class="fld"><span>Stage</span><select class="inp" name="stage">${sel(PL_STAGE,r.stage)}</select></label>
   <label class="fld"><span>Trend</span><select class="inp" name="trend">${sel(PL_TREND,r.trend)}</select></label>
   <label class="fld"><span>Income last 28 days ($)</span><input class="inp" name="monthly_usd" type="number" min="0" step="any" value="${esc(r.monthly_usd??0)}"></label>
   <label class="fld"><span>Sell target per month ($)</span><input class="inp" name="target_usd" type="number" min="1" step="any" required value="${esc(r.target_usd??2000)}"></label>
   <label class="fld"><span>Asking price ($)</span><input class="inp" name="ask_usd" type="number" min="0" step="any" value="${esc(r.ask_usd??'')}"></label>
   <label class="fld"><span>Lowest price I take ($)</span><input class="inp" name="floor_usd" type="number" min="0" step="any" value="${esc(r.floor_usd??'')}"></label>
   <label class="fld"><span>Monetized on</span><input class="inp" name="monetized_on" type="date" value="${esc(r.monetized_on||'')}"></label>
   <label class="fld"><span>Listed on</span><input class="inp" name="platforms" value="${esc(r.platforms||'')}" placeholder="Hypertube, Fameswap"></label>
   <label class="fld full"><span>Notes</span><input class="inp" name="notes" value="${esc(r.notes||'')}"></label></div><p class="err" role="alert"></p>
   <footer><button type="button" class="btn btn-ghost" data-close>Cancel</button><button class="btn btn-primary" type="submit">${id?'Save':'Start channel'}</button></footer></form>`,d=>{
    const f=d.querySelector('form');
    f.channel_id.onchange=()=>{if(!f.name.value.trim())f.name.value=chName(f.channel_id.value)};
    f.onsubmit=async e=>{e.preventDefault();const fd=Object.fromEntries(new FormData(f));const num=k=>fd[k]===''?null:n(fd[k]);
      const row={name:fd.name.trim(),channel_id:fd.channel_id||null,stage:fd.stage,trend:fd.trend,monthly_usd:n(fd.monthly_usd),target_usd:n(fd.target_usd)||2000,ask_usd:num('ask_usd'),floor_usd:num('floor_usd'),monetized_on:fd.monetized_on||null,platforms:fd.platforms.trim()||null,notes:fd.notes.trim()||null};
      if(!id)row.position=Math.max(0,...PL.rows.map(x=>x.position||0))+1;
      const res=id?await sb.from('sale_pipeline').update(row).eq('id',id).select('id'):await sb.from('sale_pipeline').insert(row).select('id');
      if(res.error){d.querySelector('.err').textContent=res.error.message;return}d.close();toast(id?'Saved':'Channel added');renderPipeline()};
  });
}
function plSold(id){
  const r=PL.rows.find(x=>x.id===id);if(!r)return;
  dialog(`<form><h2>Mark ${esc(r.name)} as sold</h2><p class="dlg-sub">This frees its slot. Add the money to Transactions when it reaches the bank.</p><div class="grid2">
   <label class="fld"><span>Sale price ($)</span><input class="inp" name="sold_usd" type="number" min="1" step="any" required value="${esc(r.ask_usd??'')}"></label>
   <label class="fld"><span>Sold on</span><input class="inp" name="sold_on" type="date" required value="${todayISO()}"></label></div><p class="err" role="alert"></p>
   <footer><button type="button" class="btn btn-ghost" data-close>Cancel</button><button class="btn btn-primary" type="submit">Mark as sold</button></footer></form>`,d=>{
    d.querySelector('form').onsubmit=async e=>{e.preventDefault();const fd=Object.fromEntries(new FormData(e.target));
      const res=await sb.from('sale_pipeline').update({stage:'sold',sold_usd:n(fd.sold_usd),sold_on:fd.sold_on}).eq('id',id).select('id');
      if(res.error){d.querySelector('.err').textContent=res.error.message;return}d.close();toast('Sold. A slot is open.');renderPipeline()};
  });
}
async function plDrop(id){
  const r=PL.rows.find(x=>x.id===id);if(!r)return;
  if(!await confirmDialog(`Drop ${esc(r.name)}?`,'It moves to the history below and its slot opens. Nothing else in the app changes.','Drop channel'))return;
  const {error}=await sb.from('sale_pipeline').update({stage:'dropped',sold_on:todayISO()}).eq('id',id);
  if(error)toast(error.message);else{toast('Channel dropped');renderPipeline()}
}
async function plDelete(id){
  const r=PL.rows.find(x=>x.id===id);if(!r)return;
  if(!await confirmDialog(`Delete ${esc(r.name)} from the pipeline?`,'This removes it from this page for good. The channel and its money records stay.','Delete'))return;
  const {error}=await sb.from('sale_pipeline').delete().eq('id',id);
  if(error)toast(error.message);else{toast('Deleted');renderPipeline()}
}
