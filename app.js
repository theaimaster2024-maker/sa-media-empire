'use strict';
/* SA Media Empire — finance workspace */
const SB_URL='https://uftyyfrnqbeoyteafhxj.supabase.co';
const SB_KEY='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVmdHl5ZnJucWJlb3l0ZWFmaHhqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODExNTM5MDEsImV4cCI6MjA5NjcyOTkwMX0.y7WgJABO_QijcghWPKYPRiGlUZycXGuJMRQ5-XPv4d8';
const sb=supabase.createClient(SB_URL,SB_KEY);

let user=null,profile=null;
const D={channels:[],income:[],expenses:[],subs:[],settings:null,legacy:[],loaded:false};
const UI={tx:{type:'all',month:'',channel:'',q:''},rep:{year:null}};

const INCOME_SOURCES=['YouTube AdSense','Sponsorship','Affiliate Income','Channel Sale','Client Payment','Other'];
const EXPENSE_CATS=['Owner Salary','Partnership Payment','Owner Loan','Owner Withdrawal','AI Subscription','Software Subscription','Production Cost','Animation','Editor Payment','Equipment','Bank & Transfer Fees','Channel Purchase','Marketing','Other'];
const METHODS=['Bank Transfer','Wise','bKash','Cash','Card','Binance / USDT','Other'];

/* ── helpers ─────────────────────────────── */
const $=s=>document.querySelector(s);
function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
const finEscape=esc; // used by private-notes.js
function n(v){const x=Number(v);return Number.isFinite(x)?x:0}
function taka(v,{sign=false,short=false}={}){
  const x=n(v),abs=Math.abs(x);let s;
  if(short&&abs>=100000)s=(abs/100000).toFixed(abs>=1000000?1:2).replace(/\.?0+$/,'')+' lakh';
  else s=Math.round(abs).toLocaleString('en-IN');
  return (x<0?'−':sign&&x>0?'+':'')+'৳'+s;
}
function todayISO(){return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Dhaka',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())}
function monthKey(d){return d?String(d).slice(0,7):''}
function monthLabel(k,long){if(!k)return'';const [y,m]=k.split('-').map(Number);return new Date(y,m-1,1).toLocaleDateString('en-GB',{month:long?'long':'short',year:long?'numeric':undefined})}
function fmtDate(d){return d?new Date(String(d).slice(0,10)+'T00:00:00').toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'}):'—'}
function addMonths(k,delta){const [y,m]=k.split('-').map(Number);const d=new Date(y,m-1+delta,1);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`}
function toast(msg){const t=$('#toast');t.textContent=msg;t.classList.add('on');clearTimeout(toast.t);toast.t=setTimeout(()=>t.classList.remove('on'),2600)}
function chName(id){return D.channels.find(c=>c.id===id)?.name||''}
function isOwner(){return profile?.role==='owner'}
function isActive(c){return !c.status||c.status==='active'}

/* Money rules
   - Income counts when its status is "received" (money reached the bank).
   - Expenses count when approval_status is "paid", dated by payment date.
   - Balance = opening balance + received income − paid expenses. */
const incReceived=i=>(i.status||'received')==='received';
const expPaid=e=>e.approval_status==='paid';
const expDate=e=>expPaid(e)?(e.payment_date||e.date):e.date;
const isPartnerPay=(e,c)=>e.category==='Partnership Payment'||/partner|patnar/i.test(e.payee||'')||(c?.partner_name&&(e.payee||'').toLowerCase().includes(c.partner_name.toLowerCase()));

function totals(filterIn=()=>true,filterOut=()=>true){
  const inc=D.income.filter(i=>incReceived(i)&&filterIn(i)).reduce((s,i)=>s+n(i.amount),0);
  const out=D.expenses.filter(e=>expPaid(e)&&filterOut(e)).reduce((s,e)=>s+n(e.amount),0);
  return {inc,out,net:inc-out};
}
function balance(){const t=totals();return n(D.settings?.opening_balance)+t.net}
function partnerFor(c){
  if(!c||!(n(c.partner_share)>0))return null;
  const revenue=D.income.filter(i=>i.channel_id===c.id&&incReceived(i)).reduce((s,i)=>s+n(i.amount),0);
  const chExp=D.expenses.filter(e=>e.channel_id===c.id&&expPaid(e));
  const costs=chExp.filter(e=>!isPartnerPay(e,c)).reduce((s,e)=>s+n(e.amount),0);
  const paid=chExp.filter(e=>isPartnerPay(e,c)).reduce((s,e)=>s+n(e.amount),0);
  const basis=c.partner_basis==='revenue'?'revenue':'profit';
  const base=basis==='revenue'?revenue:revenue-costs;
  const owed=Math.max(0,base)*n(c.partner_share)/100;
  return {revenue,costs,base,owed,paid,due:owed-paid,basis,share:n(c.partner_share),name:c.partner_name||'Partner'};
}

/* ── data ─────────────────────────────── */
const CH_COLS='id,name,tagline,platform,status,monetization_status,subscriber_count,initials,color,photo_url,partner_name,partner_share,partner_basis,created_at';
async function loadData(){
  const [ch,inc,exp,subs,set]=await Promise.all([
    sb.from('finance_channels').select(CH_COLS).order('name'),
    sb.from('finance_income').select('id,date,amount,source,channel_id,description,payment_method,reference_no,status,notes,created_at,origin,hisab_txn_id').order('date',{ascending:false}),
    sb.from('finance_expenses').select('id,date,due_date,payee,amount,description,category,scope,channel_id,payment_method,approval_status,payment_date,reference_no,notes,voucher_number,editor_project_id,created_at,origin,hisab_txn_id').order('date',{ascending:false}),
    sb.from('finance_subscriptions').select('*').order('next_payment'),
    sb.from('finance_settings').select('*').limit(1)
  ]);
  const err=[ch,inc,exp,subs,set].find(r=>r.error);if(err)throw err.error;
  D.channels=ch.data||[];D.income=inc.data||[];D.expenses=exp.data||[];D.subs=subs.data||[];D.settings=set.data?.[0]||null;D.loaded=true;
  shrinkBigPhotos();
}
/* Large channel photos slow every page. Shrink anything over 60 KB to a 192px WebP once. */
async function shrinkBigPhotos(){
  for(const c of D.channels){
    if(!c.photo_url||c.photo_url.length<60000||!isOwner())continue;
    try{const small=await resizeImage(c.photo_url,192);if(small.length<c.photo_url.length){await sb.from('finance_channels').update({photo_url:small}).eq('id',c.id);c.photo_url=small}}catch{}
  }
}
function resizeImage(src,size){return new Promise((ok,bad)=>{const img=new Image();img.onload=()=>{const k=Math.min(1,size/Math.max(img.width,img.height)),cv=document.createElement('canvas');cv.width=Math.round(img.width*k);cv.height=Math.round(img.height*k);cv.getContext('2d').drawImage(img,0,0,cv.width,cv.height);ok(cv.toDataURL('image/webp',.85))};img.onerror=bad;img.src=src})}
async function refresh(){try{await loadData()}catch(e){toast('Could not reload: '+e.message)}route()}

/* ── auth ─────────────────────────────── */
async function init(){
  try{
    const {data:{session}}=await Promise.race([sb.auth.getSession(),new Promise((_,r)=>setTimeout(()=>r(new Error('timeout')),10000))]);
    if(session){await startApp(session.user)}else showAuth();
  }catch(e){console.error(e);showAuth()}
  finally{$('#boot').style.display='none'}
}
function showAuth(){$('#auth').style.display='grid';$('#app').style.display='none'}
$('#login-form').addEventListener('submit',async e=>{
  e.preventDefault();const btn=$('#a-btn'),err=$('#a-err');err.textContent='';btn.disabled=true;btn.textContent='Signing in…';
  const {data,error}=await sb.auth.signInWithPassword({email:$('#a-email').value.trim(),password:$('#a-pass').value});
  if(error){err.textContent=error.message==='Invalid login credentials'?'Email or password is wrong.':error.message;btn.disabled=false;btn.textContent='Sign in';return}
  $('#boot').style.display='grid';await startApp(data.user);$('#boot').style.display='none';
});
$('#logout').onclick=async()=>{if(ownerDoc?.dirty)await saveOwnerDocument();await sb.auth.signOut();location.hash='';location.reload()};
$('#menu-btn').onclick=()=>document.body.classList.toggle('nav-open');
document.addEventListener('click',e=>{if(document.body.classList.contains('nav-open')&&!e.target.closest('.side')&&!e.target.closest('#menu-btn'))document.body.classList.remove('nav-open')});

async function startApp(u){
  user=u;const {data}=await sb.from('profiles').select('id,name,role').eq('id',u.id).single();profile=data;
  $('#auth').style.display='none';$('#app').style.display='block';
  const name=profile?.name||u.email.split('@')[0];$('#me-name').textContent=name;$('#me-av').textContent=name[0].toUpperCase();$('#me-role').textContent=profile?.role||'';
  document.querySelectorAll('.brand-sub').forEach(el=>el.textContent=isOwner()?'Finance workspace':'Team workspace');
  buildNav();
  if(isOwner()){try{await loadData()}catch(e){$('#view').innerHTML=errorBox(e.message)}}
  route();
}

/* ── navigation ─────────────────────────────── */
const PAGES={
  dashboard:{t:'Dashboard',i:'ti-layout-dashboard',g:'',owner:1},
  hisab:{t:'Hisab',i:'ti-wallet',g:'Money',owner:1},
  transactions:{t:'Transactions',i:'ti-arrows-exchange',g:'Money',owner:1},
  channels:{t:'Channels',i:'ti-brand-youtube',g:'Money',owner:1},
  partners:{t:'Partner share',i:'ti-users-group',g:'Money',owner:1},
  subscriptions:{t:'Subscriptions',i:'ti-repeat',g:'Money',owner:1},
  reports:{t:'Reports',i:'ti-chart-histogram',g:'Money',owner:1},
  uploads:{t:'Video upload',i:'ti-cloud-upload',g:'Workspace',all:1},
  notes:{t:'Private notes',i:'ti-lock',g:'Workspace',owner:1},
  settings:{t:'Settings',i:'ti-settings',g:'Workspace',owner:1}
};
function canSee(p){return isOwner()||(!!p.all&&!!profile)}
function buildNav(){
  let html='',g=null;
  for(const [k,p] of Object.entries(PAGES)){if(!canSee(p))continue;if(p.g!==g){g=p.g;if(g)html+=`<div class="nav-group">${g}</div>`}html+=`<a href="#/${k}" data-pg="${k}"><i class="ti ${p.i}"></i>${p.t}</a>`}
  $('#nav').innerHTML=html;
}
window.addEventListener('hashchange',route);
async function route(){
  if(!user)return;
  if(typeof ownerDoc!=='undefined'&&ownerDoc.dirty&&$('#owner-doc-editor'))await saveOwnerDocument();
  const [pg,arg]=(location.hash.replace(/^#\/?/,'')||'').split('/');
  let key=PAGES[pg]?pg:pg==='channel'?'channels':(isOwner()?'dashboard':'uploads');
  if(!canSee(PAGES[key])){$('#view').innerHTML=`<div class="blocked glass"><h1>This page is owner-only</h1><p>Your account can use the Video upload board. Finance and private notes are for the owner.</p><a class="btn btn-primary" href="#/uploads" style="margin-right:8px">Go to Video upload</a><button class="btn btn-ghost" onclick="$('#logout').click()">Sign out</button></div>`;return}
  document.querySelectorAll('#nav a').forEach(a=>a.classList.toggle('on',a.dataset.pg===key));
  document.querySelectorAll('dialog[open]').forEach(d=>d.close());  document.body.classList.remove('nav-open');window.scrollTo(0,0);
  document.title=(pg==='channel'&&arg?chName(arg):PAGES[key].t)+' · SA Media Empire';
  const v=$('#view');
  try{
    if(pg==='channel'&&arg)return renderChannel(arg);
    ({dashboard:renderDashboard,hisab:renderHisab,transactions:renderTransactions,channels:renderChannels,partners:renderPartners,subscriptions:renderSubs,reports:renderReports,uploads:renderUploads,notes:renderNotes,settings:renderSettings})[key]();
  }catch(e){console.error(e);v.innerHTML=errorBox(e.message)}
}
function errorBox(msg){return `<div class="glass card empty"><i class="ti ti-alert-circle"></i><b>Something didn’t load</b>${esc(msg)}<div style="margin-top:14px"><button class="btn btn-ghost" onclick="refresh()">Try again</button></div></div>`}
function head(title,sub,actions=''){return `<div class="page-head"><div><h1>${title}</h1>${sub?`<p>${sub}</p>`:''}</div><div class="actions">${actions}</div></div>`}

/* ── shared pieces ─────────────────────────────── */
function avatar(c,size=44){
  if(!c)return `<div class="avatar" style="width:${size}px;height:${size}px;background:#7E918F"><i class="ti ti-building"></i></div>`;
  return c.photo_url?`<img class="avatar" src="${esc(c.photo_url)}" alt="" style="width:${size}px;height:${size}px">`:`<div class="avatar" style="width:${size}px;height:${size}px;background:${esc(c.color||'#0E7C74')}">${esc(c.initials||c.name?.[0]||'?')}</div>`;
}
function entries(){
  const inc=D.income.map(i=>({kind:'in',id:i.id,date:i.date,title:i.source||'Income',sub:i.description,amount:n(i.amount),channel_id:i.channel_id,done:incReceived(i),raw:i}));
  const exp=D.expenses.map(e=>({kind:'out',id:e.id,date:expDate(e),title:e.payee||e.category||'Expense',sub:e.description||e.category,cat:e.category,amount:n(e.amount),channel_id:e.channel_id,done:expPaid(e),rejected:e.approval_status==='rejected',raw:e}));
  return [...inc,...exp].sort((a,b)=>String(b.date).localeCompare(String(a.date))||String(b.raw.created_at).localeCompare(String(a.raw.created_at)));
}
function entryRow(x,{menu=true}={}){
  const ch=chName(x.channel_id);
  const status=x.rejected?'<span class="pill grey">Rejected</span>':!x.done?(x.kind==='in'?'<span class="pill sun">Waiting</span>':'<span class="pill sun">Not paid</span>'):'';
  return `<div class="li"><div class="li-ic ${x.kind}"><i class="ti ${x.kind==='in'?'ti-arrow-down-left':'ti-arrow-up-right'}"></i></div>
  <div style="min-width:0"><div class="li-t">${esc(x.title)}</div><div class="li-s">${fmtDate(x.date)}${ch?' — '+esc(ch):''}${x.sub&&x.sub!==x.title?' — '+esc(x.sub):''}</div></div>
  <div style="display:flex;align-items:center;gap:8px">${status}<span class="amt ${x.kind}">${x.kind==='in'?'+':'−'}${taka(x.amount)}</span></div>
  ${menu?`<details class="menu"><summary class="icon-btn" aria-label="Options"><i class="ti ti-dots"></i></summary><div class="menu-pop">
    ${!x.done&&!x.rejected?`<button onclick="markDone('${x.kind}','${x.id}')">${x.kind==='in'?'Mark as received':'Mark as paid'}</button>`:''}
    <button onclick="openEntry('${x.kind}','${x.id}')">Edit</button>
    <button class="danger" onclick="deleteEntry('${x.kind}','${x.id}')">Delete</button></div></details>`:'<span></span>'}</div>`;
}
document.addEventListener('click',e=>{document.querySelectorAll('details.menu[open]').forEach(d=>{if(!d.contains(e.target))d.open=false})});

/* ── dashboard ─────────────────────────────── */
function renderDashboard(){
  const now=monthKey(todayISO()),inMonth=d=>monthKey(d)===now;
  const m=totals(i=>inMonth(i.date),e=>inMonth(expDate(e)));
  const bal=balance();
  const waiting=D.income.filter(i=>!incReceived(i));const waitingSum=waiting.reduce((s,i)=>s+n(i.amount),0);
  const unpaid=D.expenses.filter(e=>!expPaid(e)&&e.approval_status!=='rejected');const unpaidSum=unpaid.reduce((s,e)=>s+n(e.amount),0);
  const flowMax=Math.max(m.inc,m.out,1);
  const hour=Number(new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Dhaka',hour:'numeric',hour12:false}).format(new Date()));
  const hi=hour<12?'Good morning':hour<17?'Good afternoon':'Good evening';
  const active=D.channels.filter(isActive);
  const partnerDue=active.map(partnerFor).filter(Boolean).reduce((s,p)=>s+Math.max(0,p.due),0);
  const recent=entries().slice(0,7);
  const nextSubs=D.subs.filter(s=>s.status!=='cancelled').slice(0,4);

  $('#view').innerHTML=head(`${hi}, ${esc((profile?.name||'').split(' ')[0])}`,`Here is where the business stands on ${fmtDate(todayISO())}.`,
    `<button class="btn btn-ghost" onclick="openEntry('in')"><i class="ti ti-plus"></i>Add income</button><button class="btn btn-primary" onclick="openEntry('out')"><i class="ti ti-plus"></i>Add expense</button>`)+
  `<div class="stack">
   ${typeof fromPhone==='function'&&fromPhone().length?`<a class="glass card" style="display:flex;align-items:center;gap:12px;text-decoration:none;color:var(--ink);padding:14px 20px" href="#/hisab" onclick="localStorage.setItem('hisab-tab','business');H.tab='business'"><i class="ti ti-device-mobile" style="font-size:20px;color:var(--sun)"></i><b>${fromPhone().length} business entr${fromPhone().length===1?'y':'ies'} from the Hisab app need your OK</b><span class="hint" style="margin-left:auto">Review</span></a>`:''}
   <div class="row r-2-1">
    <section class="glass slab">
      <div class="slab-label">Money in the business</div>
      <div class="money-xl"><span class="cur">৳</span>${Math.round(bal).toLocaleString('en-IN')}</div>
      <div class="slab-note">Opening balance ${taka(D.settings?.opening_balance)} plus everything received, minus everything paid.</div>
      <div class="flow">
        <div class="flow-bar" aria-hidden="true"><span style="width:${m.inc/flowMax*50}%;background:var(--teal)"></span><span style="width:${m.out/flowMax*50}%;background:var(--rose)"></span></div>
        <div class="flow-legend">
          <div><small style="--c:var(--teal)">Came in this month</small><strong>${taka(m.inc)}</strong></div>
          <div><small style="--c:var(--rose)">Went out this month</small><strong>${taka(m.out)}</strong></div>
          <div><small style="--c:${m.net>=0?'var(--teal)':'var(--rose)'}">Net for ${monthLabel(now,true)}</small><strong class="${m.net>=0?'pos':'neg'}">${taka(m.net,{sign:true})}</strong></div>
        </div>
      </div>
    </section>
    <section class="glass card pending-card">
      <div class="card-h" style="margin-bottom:4px"><h2>Waiting to arrive</h2><span class="pill sun">${waiting.length} payout${waiting.length===1?'':'s'}</span></div>
      <div class="money-md">${taka(waitingSum)}</div>
      <p class="hint">AdSense and other money you’ve earned but that hasn’t reached the bank yet. It joins the balance when you mark it received.</p>
      <div class="pending-list">${waiting.slice(0,3).map(i=>`<div class="li" style="grid-template-columns:minmax(0,1fr) auto;padding:8px 0"><div style="min-width:0"><div class="li-t">${esc(chName(i.channel_id)||i.source)}</div><div class="li-s">${fmtDate(i.date)}</div></div><button class="btn btn-ghost btn-sm" onclick="markDone('in','${i.id}')">Mark ${taka(i.amount)} received</button></div>`).join('')||`<button class="btn btn-ghost" onclick="openEntry('in',null,{status:'pending',source:'YouTube AdSense'})"><i class="ti ti-plus"></i>Log AdSense earnings</button>`}</div>
    </section>
   </div>

   <div class="row r-4">
     ${kpi('ti-receipt','Bills not paid yet',taka(unpaidSum),`${unpaid.length} open`,'rose')}
     ${kpi('ti-users-group','Owed to partners',taka(partnerDue),partnerDue>0?'See partner share':'All settled','sun')}
     ${kpi('ti-repeat','Subscriptions a month',taka(monthlySubs()),`${D.subs.filter(s=>s.status!=='cancelled').length} active`)}
     ${kpi('ti-brand-youtube','Active channels',active.length,`${active.filter(c=>c.monetization_status==='monetized').length} monetized`)}
   </div>

   <section>
     <div class="card-h"><h2>Channels</h2><a class="btn btn-ghost btn-sm" href="#/channels">All channels</a></div>
     <div class="row r-3">${active.map(channelTile).join('')||`<div class="glass card empty"><b>No channels yet</b><a href="#/channels">Add your first channel</a></div>`}</div>
   </section>

   <div class="row r-2-1">
     <section class="glass card"><div class="card-h"><h2>Last six months</h2><div class="legend"><span style="--c:var(--teal)">In</span><span style="--c:var(--rose)">Out</span></div></div>${barsChart(6)}</section>
     <section class="glass card"><div class="card-h"><h2>Coming up</h2><a class="btn btn-ghost btn-sm" href="#/subscriptions">Manage</a></div>
       <div class="list">${nextSubs.map(s=>`<div class="li" style="grid-template-columns:36px minmax(0,1fr) auto"><div class="li-ic out"><i class="ti ti-repeat"></i></div><div style="min-width:0"><div class="li-t">${esc(s.service_name)}</div><div class="li-s">${s.next_payment?(s.next_payment<todayISO()?'Overdue since ':'Due ')+fmtDate(s.next_payment):'No date set'}</div></div><span class="amt out">${taka(s.amount)}</span></div>`).join('')||'<div class="empty">No subscriptions tracked yet.</div>'}</div>
     </section>
   </div>

   <section class="glass card"><div class="card-h"><h2>Latest entries</h2><a class="btn btn-ghost btn-sm" href="#/transactions">See all</a></div>
     <div class="list">${recent.map(x=>entryRow(x)).join('')||'<div class="empty"><i class="ti ti-notes"></i><b>Nothing recorded yet</b>Add your first income or expense.</div>'}</div></section>
  </div>`;
}
function kpi(icon,label,value,note,tone=''){return `<div class="glass kpi ${tone}"><small><i class="ti ${icon}"></i>${label}</small><strong>${value}</strong><p>${note}</p></div>`}
function monthlySubs(){return D.subs.filter(s=>s.status!=='cancelled').reduce((s,x)=>s+(x.billing_cycle==='annual'?n(x.amount)/12:n(x.amount)),0)}
function channelTile(c){
  const now=monthKey(todayISO());
  const t=totals(i=>i.channel_id===c.id,e=>e.channel_id===c.id);
  const tm=totals(i=>i.channel_id===c.id&&monthKey(i.date)===now,e=>e.channel_id===c.id&&monthKey(expDate(e))===now);
  const p=partnerFor(c);
  return `<a class="glass ch-tile" href="#/channel/${c.id}"><div class="ch-top">${avatar(c)}<div><div class="ch-name">${esc(c.name)}</div><div class="ch-meta">${n(c.subscriber_count).toLocaleString('en-IN')} subscribers${p?` — ${p.share}% with ${esc(p.name)}`:''}</div></div>${c.monetization_status==='monetized'?'<span class="pill">Monetized</span>':'<span class="pill grey">Not monetized</span>'}</div>
  <div class="ch-nums"><div><small>Earned, all time</small><b class="pos">${taka(t.inc,{short:true})}</b></div><div><small>Spent, all time</small><b>${taka(t.out,{short:true})}</b></div><div><small>This month</small><b class="${tm.net>=0?'pos':'neg'}">${taka(tm.net,{sign:true,short:true})}</b></div></div></a>`;
}
function barsChart(months,channelId){
  const end=monthKey(todayISO());const keys=Array.from({length:months},(_,i)=>addMonths(end,i-months+1));
  const data=keys.map(k=>totals(i=>monthKey(i.date)===k&&(!channelId||i.channel_id===channelId),e=>monthKey(expDate(e))===k&&(!channelId||e.channel_id===channelId)));
  const max=Math.max(...data.map(d=>Math.max(d.inc,d.out)),1);
  return `<div class="bars">${keys.map((k,i)=>`<div class="bar-col" title="${monthLabel(k,true)}: in ${taka(data[i].inc)}, out ${taka(data[i].out)}"><div class="bar-pair"><span class="bi" style="height:${data[i].inc/max*100}%"></span><span class="bo" style="height:${data[i].out/max*100}%"></span></div><small>${monthLabel(k)}</small></div>`).join('')}</div>`;
}

/* ── transactions ─────────────────────────────── */
function renderTransactions(){
  const months=[...new Set(entries().map(x=>monthKey(x.date)).filter(Boolean))].sort().reverse();
  $('#view').innerHTML=head('Transactions','Every taka in and out, newest first.',
    `<button class="btn btn-ghost" onclick="exportCSV()"><i class="ti ti-download"></i>Export CSV</button><button class="btn btn-ghost" onclick="openEntry('in')"><i class="ti ti-plus"></i>Add income</button><button class="btn btn-primary" onclick="openEntry('out')"><i class="ti ti-plus"></i>Add expense</button>`)+
  `<div class="filters">
    <div class="seg" id="tx-type">${[['all','All'],['in','Income'],['out','Expenses'],['open','Waiting / unpaid']].map(([k,l])=>`<button data-k="${k}" class="${UI.tx.type===k?'on':''}">${l}</button>`).join('')}</div>
    <select class="inp" id="tx-month"><option value="">All months</option>${months.map(k=>`<option value="${k}" ${UI.tx.month===k?'selected':''}>${monthLabel(k,true)}</option>`).join('')}</select>
    <select class="inp" id="tx-ch"><option value="">All channels</option><option value="none" ${UI.tx.channel==='none'?'selected':''}>Whole business</option>${D.channels.map(c=>`<option value="${c.id}" ${UI.tx.channel===c.id?'selected':''}>${esc(c.name)}</option>`).join('')}</select>
    <input class="inp search" id="tx-q" placeholder="Search payee, note or category" value="${esc(UI.tx.q)}">
  </div>
  <section class="glass card"><div id="tx-sum" class="card-h"></div><div class="list" id="tx-list"></div></section>`;
  $('#tx-type').onclick=e=>{const b=e.target.closest('button');if(!b)return;UI.tx.type=b.dataset.k;document.querySelectorAll('#tx-type button').forEach(x=>x.classList.toggle('on',x===b));drawTx()};
  $('#tx-month').onchange=e=>{UI.tx.month=e.target.value;drawTx()};
  $('#tx-ch').onchange=e=>{UI.tx.channel=e.target.value;drawTx()};
  $('#tx-q').oninput=e=>{UI.tx.q=e.target.value;drawTx()};
  drawTx();
}
function filteredTx(){
  const q=UI.tx.q.trim().toLowerCase();
  return entries().filter(x=>(UI.tx.type==='all'||(UI.tx.type==='open'?!x.done&&!x.rejected:x.kind===UI.tx.type))&&(!UI.tx.month||monthKey(x.date)===UI.tx.month)&&(!UI.tx.channel||(UI.tx.channel==='none'?!x.channel_id:x.channel_id===UI.tx.channel))&&(!q||`${x.title} ${x.sub} ${x.cat} ${x.raw.notes} ${chName(x.channel_id)}`.toLowerCase().includes(q)));
}
function drawTx(){
  const rows=filteredTx();const inc=rows.filter(x=>x.kind==='in'&&x.done).reduce((s,x)=>s+x.amount,0),out=rows.filter(x=>x.kind==='out'&&x.done).reduce((s,x)=>s+x.amount,0);
  $('#tx-sum').innerHTML=`<h2>${rows.length} entr${rows.length===1?'y':'ies'}</h2><span class="sub">In ${taka(inc)} — Out ${taka(out)} — Net <b class="${inc-out>=0?'pos':'neg'}">${taka(inc-out,{sign:true})}</b></span>`;
  $('#tx-list').innerHTML=rows.map(x=>entryRow(x)).join('')||'<div class="empty"><i class="ti ti-filter-off"></i><b>No entries match</b>Change the filters or add a new entry.</div>';
}
function exportCSV(rows=filteredTx()){
  const lines=[['Date','Type','Title','Category / Source','Channel','Amount (BDT)','Status','Description','Method','Reference','Notes']];
  rows.forEach(x=>lines.push([x.date,x.kind==='in'?'Income':'Expense',x.title,x.kind==='in'?x.raw.source:x.raw.category,chName(x.channel_id)||'Whole business',x.amount,x.kind==='in'?(x.raw.status||'received'):x.raw.approval_status,x.raw.description,x.raw.payment_method,x.raw.reference_no,x.raw.notes]));
  const csv=lines.map(r=>r.map(v=>`"${String(v??'').replace(/"/g,'""')}"`).join(',')).join('\n');
  const a=document.createElement('a');a.href=URL.createObjectURL(new Blob(['﻿'+csv],{type:'text/csv'}));a.download=`sa-media-empire-${UI.tx.month||'all'}.csv`;a.click();
}

/* ── entry dialog ─────────────────────────────── */
function dialog(html,onReady){
  const d=document.createElement('dialog');d.className='dlg';d.innerHTML=html;document.body.append(d);d.onclose=()=>d.remove();d.showModal();
  d.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>d.close());onReady?.(d);return d;
}
function opts(list,cur){const all=[...new Set([...list,...(cur?[cur]:[])])];return all.map(v=>`<option ${v===cur?'selected':''}>${esc(v)}</option>`).join('')}
function chOpts(cur,{none='Whole business'}={}){return `<option value="">${none}</option>`+D.channels.filter(c=>isActive(c)||c.id===cur).map(c=>`<option value="${c.id}" ${c.id===cur?'selected':''}>${esc(c.name)}</option>`).join('')}
function openEntry(kind,id,preset={}){
  const isIn=kind==='in';
  const r=id?(isIn?D.income:D.expenses).find(x=>x.id===id):null;if(id&&!r){toast('Entry not found');return}
  const v=Object.assign({},preset,r||{});
  const usedCats=[...new Set(D.expenses.map(e=>e.category).filter(Boolean))];
  const linked=!isIn&&r?.editor_project_id;
  const body=isIn?`
    <div class="grid2">
      <label class="fld"><span>Amount (৳)</span><input class="inp" name="amount" type="number" min="1" step="any" required value="${esc(v.amount??'')}"></label>
      <label class="fld"><span>Date</span><input class="inp" name="date" type="date" required value="${esc(v.date||todayISO())}"></label>
      <div class="fld full" style="margin-top:-6px"><span class="hint">Paid in dollars? <input class="inp" id="usd" type="number" min="0" step="any" placeholder="USD" style="width:110px;height:32px;display:inline-block"> × <input class="inp" id="rate" type="number" min="0" step="any" value="${esc(localStorage.getItem('sa-usd-rate')||'121')}" style="width:90px;height:32px;display:inline-block"> taka per dollar fills the amount.</span></div>
      <label class="fld"><span>Source</span><select class="inp" name="source">${opts(INCOME_SOURCES,v.source||'YouTube AdSense')}</select></label>
      <label class="fld"><span>Channel</span><select class="inp" name="channel_id">${chOpts(v.channel_id)}</select></label>
      <label class="fld"><span>Status</span><select class="inp" name="status"><option value="received" ${(v.status||'received')==='received'?'selected':''}>Received in bank</option><option value="pending" ${v.status==='pending'?'selected':''}>Waiting to arrive</option></select></label>
      <label class="fld"><span>Came through</span><select class="inp" name="payment_method">${opts(METHODS,v.payment_method||'Bank Transfer')}</select></label>
      <label class="fld full"><span>Description</span><input class="inp" name="description" value="${esc(v.description||'')}" placeholder="e.g. October AdSense payout"></label>
      <label class="fld"><span>Reference</span><input class="inp" name="reference_no" value="${esc(v.reference_no||'')}"></label>
      <label class="fld"><span>Notes</span><input class="inp" name="notes" value="${esc(v.notes||'')}"></label>
    </div>`:`
    ${linked?'<p class="hint" style="margin-bottom:12px">This payment is linked to an old editor project, so amount, status and payment date are locked.</p>':''}
    <div class="grid2">
      <label class="fld"><span>Amount (৳)</span><input class="inp" name="amount" type="number" min="1" step="any" required value="${esc(v.amount??'')}" ${linked?'disabled':''}></label>
      <label class="fld"><span>Date</span><input class="inp" name="date" type="date" required value="${esc(v.date||todayISO())}"></label>
      <label class="fld"><span>Paid to</span><input class="inp" name="payee" required value="${esc(v.payee||'')}" placeholder="e.g. ElevenLabs"></label>
      <label class="fld"><span>Category</span><select class="inp" name="category">${opts([...EXPENSE_CATS,...usedCats],v.category||'AI Subscription')}</select></label>
      <label class="fld"><span>Channel</span><select class="inp" name="channel_id">${chOpts(v.channel_id)}</select></label>
      <label class="fld"><span>Status</span><select class="inp" name="approval_status" ${linked?'disabled':''}><option value="paid" ${(v.approval_status||'paid')==='paid'?'selected':''}>Paid</option><option value="pending" ${['pending','approved'].includes(v.approval_status)?'selected':''}>Not paid yet</option><option value="rejected" ${v.approval_status==='rejected'?'selected':''}>Cancelled</option></select></label>
      <label class="fld"><span>Payment date</span><input class="inp" name="payment_date" type="date" value="${esc(v.payment_date||(r?'':todayISO()))}" ${linked?'disabled':''}></label>
      <label class="fld"><span>Paid with</span><select class="inp" name="payment_method">${opts(METHODS,v.payment_method||'Bank Transfer')}</select></label>
      <label class="fld full"><span>Description</span><input class="inp" name="description" value="${esc(v.description||'')}"></label>
      <label class="fld"><span>Reference</span><input class="inp" name="reference_no" value="${esc(v.reference_no||'')}"></label>
      <label class="fld"><span>Notes</span><input class="inp" name="notes" value="${esc(v.notes||'')}"></label>
    </div>`;
  dialog(`<form><h2>${r?'Edit':'Add'} ${isIn?'income':'expense'}</h2><p class="dlg-sub">${isIn?'Record money that came in. Mark it “waiting” if it hasn’t reached the bank yet.':'Record money the business spent.'}</p>${body}<p class="err" role="alert"></p><footer><button type="button" class="btn btn-ghost" data-close>Cancel</button><button class="btn btn-primary" type="submit">${r?'Save changes':isIn?'Add income':'Add expense'}</button></footer></form>`,d=>{
    const f=d.querySelector('form');
    const usd=d.querySelector('#usd'),rate=d.querySelector('#rate');
    if(usd){const calc=()=>{if(n(usd.value)>0&&n(rate.value)>0){f.amount.value=Math.round(n(usd.value)*n(rate.value));localStorage.setItem('sa-usd-rate',rate.value)}};usd.oninput=calc;rate.oninput=calc}
    f.onsubmit=async e=>{
      e.preventDefault();const fd=Object.fromEntries(new FormData(f));const err=d.querySelector('.err'),btn=f.querySelector('[type=submit]');
      for(const k in fd)if(typeof fd[k]==='string')fd[k]=fd[k].trim();
      if(!linked&&!(n(fd.amount)>0)){err.textContent='Enter an amount above zero.';return}
      let row;
      if(isIn)row={date:fd.date,amount:n(fd.amount),source:fd.source,channel_id:fd.channel_id||null,status:fd.status,payment_method:fd.payment_method,description:fd.description||null,reference_no:fd.reference_no||null,notes:fd.notes||null};
      else{row={date:fd.date,payee:fd.payee,category:fd.category,channel_id:fd.channel_id||null,scope:fd.channel_id?'channel':'whole_business',payment_method:fd.payment_method,description:fd.description||null,reference_no:fd.reference_no||null,notes:fd.notes||null};
        if(!linked){row.amount=n(fd.amount);row.approval_status=fd.approval_status;row.payment_date=fd.approval_status==='paid'?(fd.payment_date||fd.date):null}}
      btn.disabled=true;
      const table=isIn?'finance_income':'finance_expenses';
      let res;
      if(r)res=await sb.from(table).update(row).eq('id',r.id).select('id');
      else{if(isIn)row.created_by=user.id;else{row.requested_by=user.id;row.voucher_number=`PAY-${todayISO().slice(0,7).replace('-','')}-${String(D.expenses.length+1).padStart(4,'0')}`}res=await sb.from(table).insert(row).select('id')}
      if(res.error){err.textContent=res.error.message;btn.disabled=false;return}
      d.close();toast(r?'Changes saved':isIn?'Income added':'Expense added');refresh();
    };
  });
}
async function markDone(kind,id){
  const res=kind==='in'?await sb.from('finance_income').update({status:'received'}).eq('id',id):await sb.from('finance_expenses').update({approval_status:'paid',payment_date:todayISO()}).eq('id',id);
  if(res.error){toast(res.error.message);return}toast(kind==='in'?'Marked as received':'Marked as paid');refresh();
}
function confirmDialog(title,text,okLabel,danger=true){return new Promise(res=>{const d=dialog(`<div class="dlg-body"><h2>${title}</h2><p class="dlg-sub">${text}</p><footer><button class="btn btn-ghost" data-close>Keep it</button><button class="btn ${danger?'btn-danger':'btn-primary'}" id="ok">${okLabel}</button></footer></div>`);d.querySelector('#ok').onclick=()=>{res(true);d.close()};d.addEventListener('close',()=>res(false))})}
async function deleteEntry(kind,id){
  const r=(kind==='in'?D.income:D.expenses).find(x=>x.id===id);if(!r)return;
  if(!await confirmDialog('Delete this entry?',`${esc(kind==='in'?r.source:r.payee)} — ${taka(r.amount)} on ${fmtDate(r.date)}. This can’t be undone.`,'Delete entry'))return;
  const {error}=await sb.from(kind==='in'?'finance_income':'finance_expenses').delete().eq('id',id);
  if(error){toast(error.message);return}toast('Entry deleted');refresh();
}

/* ── channels ─────────────────────────────── */
function renderChannels(){
  const act=D.channels.filter(isActive),old=D.channels.filter(c=>!isActive(c));
  $('#view').innerHTML=head('Channels','What each channel earns and costs.',`<button class="btn btn-primary" onclick="openChannel()"><i class="ti ti-plus"></i>Add channel</button>`)+
  `<div class="row r-3">${act.map(channelTile).join('')}</div>
  ${old.length?`<div class="card-h" style="margin-top:30px"><h2>Closed channels</h2><span class="sub">History stays in every total.</span></div><div class="row r-3">${old.map(channelTile).join('')}</div>`:''}`;
}
function renderChannel(id){
  const c=D.channels.find(x=>x.id===id);if(!c){$('#view').innerHTML=errorBox('That channel doesn’t exist any more.');return}
  const t=totals(i=>i.channel_id===id,e=>e.channel_id===id),p=partnerFor(c);
  const rows=entries().filter(x=>x.channel_id===id);
  const cats={};D.expenses.filter(e=>e.channel_id===id&&expPaid(e)).forEach(e=>cats[e.category||'Other']=(cats[e.category||'Other']||0)+n(e.amount));
  $('#view').innerHTML=`<div class="page-head"><div style="display:flex;gap:16px;align-items:center">${avatar(c,64)}<div><h1>${esc(c.name)}</h1><p>${esc(c.tagline||'')}${c.tagline?' — ':''}${n(c.subscriber_count).toLocaleString('en-IN')} subscribers, ${c.monetization_status==='monetized'?'monetized':'not monetized yet'}${isActive(c)?'':', closed'}</p></div></div>
   <div class="actions"><a class="btn btn-ghost" href="#/channels">Back</a><button class="btn btn-ghost" onclick="openChannel('${id}')"><i class="ti ti-pencil"></i>Edit channel</button><button class="btn btn-primary" onclick="openEntry('in',null,{channel_id:'${id}'})"><i class="ti ti-plus"></i>Add income</button></div></div>
  <div class="stack">
   <div class="row r-4">${kpi('ti-arrow-down-left','Earned, all time',taka(t.inc),'Received in bank')}${kpi('ti-arrow-up-right','Spent, all time',taka(t.out),'Paid from the business','rose')}${kpi('ti-scale','Net',`<span class="${t.net>=0?'pos':'neg'}">${taka(t.net,{sign:true})}</span>`,'Before whole-business costs')}${p?kpi('ti-users-group',`${esc(p.name)}’s share`,taka(Math.abs(p.due)),p.due>0.5?'Still to pay':p.due<-0.5?'Paid ahead':'Settled','sun'):kpi('ti-user','Partner','None','Owned fully by you')}</div>
   ${p?partnerCard(c,p):''}
   <div class="row r-2-1"><section class="glass card"><div class="card-h"><h2>Twelve months</h2><div class="legend"><span style="--c:var(--teal)">In</span><span style="--c:var(--rose)">Out</span></div></div>${barsChart(12,id)}</section>
   <section class="glass card"><div class="card-h"><h2>Where the money went</h2></div>${categoryMeters(cats)}</section></div>
   <section class="glass card"><div class="card-h"><h2>Entries</h2><span class="sub">${rows.length} total</span></div><div class="list">${rows.map(x=>entryRow(x)).join('')||'<div class="empty">No entries for this channel yet.</div>'}</div></section>
  </div>`;
}
function categoryMeters(cats){const arr=Object.entries(cats).sort((a,b)=>b[1]-a[1]);const max=arr[0]?.[1]||1;const tot=arr.reduce((s,x)=>s+x[1],0);
  return arr.length?arr.map(([k,v])=>`<div class="meter-row"><b>${esc(k)}</b><span>${taka(v)} <small class="hint">${Math.round(v/tot*100)}%</small></span><div class="meter"><span style="width:${v/max*100}%"></span></div></div>`).join(''):'<div class="empty">No spending recorded.</div>'}
function openChannel(id){
  const c=id?D.channels.find(x=>x.id===id):{};let photo=c.photo_url||null;
  dialog(`<form><h2>${id?'Edit channel':'Add channel'}</h2><p class="dlg-sub">Name, numbers and who shares its profit.</p>
    <div class="photo-pick"><span id="ph">${avatar(c.name?c:{name:'?',color:'#0E7C74'},56)}</span><label class="btn btn-ghost btn-sm">Choose logo<input type="file" accept="image/*" hidden id="ph-in"></label></div>
    <div class="grid2">
      <label class="fld"><span>Channel name</span><input class="inp" name="name" required value="${esc(c.name||'')}"></label>
      <label class="fld"><span>Subscribers</span><input class="inp" name="subscriber_count" type="number" min="0" value="${esc(c.subscriber_count??0)}"></label>
      <label class="fld full"><span>Short description</span><input class="inp" name="tagline" value="${esc(c.tagline||'')}"></label>
      <label class="fld"><span>Monetization</span><select class="inp" name="monetization_status"><option value="monetized" ${c.monetization_status==='monetized'?'selected':''}>Monetized</option><option value="not_monetized" ${c.monetization_status!=='monetized'?'selected':''}>Not monetized</option></select></label>
      <label class="fld"><span>Status</span><select class="inp" name="status"><option value="active" ${isActive(c)?'selected':''}>Active</option><option value="inactive" ${!isActive(c)&&id?'selected':''}>Closed</option></select></label>
      <label class="fld"><span>Partner name</span><input class="inp" name="partner_name" value="${esc(c.partner_name||'')}" placeholder="Leave empty if none"></label>
      <label class="fld"><span>Partner share (%)</span><input class="inp" name="partner_share" type="number" min="0" max="100" step="any" value="${esc(c.partner_share??0)}"></label>
      <label class="fld full"><span>Share is calculated on</span><select class="inp" name="partner_basis"><option value="profit" ${c.partner_basis!=='revenue'?'selected':''}>Profit (income minus this channel’s costs)</option><option value="revenue" ${c.partner_basis==='revenue'?'selected':''}>Revenue (all income received)</option></select></label>
      <label class="fld"><span>Initials</span><input class="inp" name="initials" maxlength="3" value="${esc(c.initials||'')}"></label>
      <label class="fld"><span>Colour</span><input class="inp" name="color" type="color" value="${esc(c.color||'#0E7C74')}" style="padding:4px"></label>
    </div><p class="err" role="alert"></p>
    <footer>${id?`<button type="button" class="btn btn-ghost" style="margin-right:auto;color:var(--rose)" id="del">Delete</button>`:''}<button type="button" class="btn btn-ghost" data-close>Cancel</button><button class="btn btn-primary" type="submit">${id?'Save channel':'Add channel'}</button></footer></form>`,d=>{
    d.querySelector('#ph-in').onchange=async e=>{const file=e.target.files[0];if(!file)return;const url=await new Promise(r=>{const fr=new FileReader();fr.onload=()=>r(fr.result);fr.readAsDataURL(file)});photo=await resizeImage(url,192);d.querySelector('#ph').innerHTML=`<img class="avatar" src="${photo}" style="width:56px;height:56px">`};
    d.querySelector('#del')?.addEventListener('click',async()=>{const linked=D.income.some(i=>i.channel_id===id)||D.expenses.some(e=>e.channel_id===id);if(linked){d.querySelector('.err').textContent='This channel has entries. Set its status to Closed instead, so the history stays.';return}d.close();if(!await confirmDialog('Delete this channel?','It has no entries, so nothing else changes.','Delete channel'))return;const {error}=await sb.from('finance_channels').delete().eq('id',id);if(error)toast(error.message);else{toast('Channel deleted');location.hash='#/channels';refresh()}});
    d.querySelector('form').onsubmit=async e=>{e.preventDefault();const fd=Object.fromEntries(new FormData(e.target));const row={name:fd.name.trim(),subscriber_count:Math.max(0,Math.round(n(fd.subscriber_count))),tagline:fd.tagline.trim()||null,monetization_status:fd.monetization_status,status:fd.status,partner_name:fd.partner_name.trim()||null,partner_share:Math.min(100,Math.max(0,n(fd.partner_share))),partner_basis:fd.partner_basis,initials:fd.initials.trim()||fd.name.trim().slice(0,2).toUpperCase(),color:fd.color,photo_url:photo,platform:c.platform||'YouTube'};
      const res=id?await sb.from('finance_channels').update(row).eq('id',id).select('id'):await sb.from('finance_channels').insert(row).select('id');
      if(res.error){d.querySelector('.err').textContent=res.error.message;return}d.close();toast(id?'Channel saved':'Channel added');refresh()};
  });
}

/* ── partners ─────────────────────────────── */
function partnerCard(c,p){
  const over=p.due<-0.5;
  return `<section class="glass partner-card"><div class="partner-head">${avatar(c)}<div style="flex:1"><div class="ch-name">${esc(p.name)} — ${p.share}% of ${esc(c.name)}</div><div class="ch-meta">Calculated on ${p.basis==='revenue'?'all income received':'profit (income minus this channel’s costs)'}. Change this in the channel settings.</div></div><button class="btn btn-primary btn-sm" onclick="openEntry('out',null,{payee:'${esc(p.name)}',category:'Partnership Payment',channel_id:'${c.id}',amount:${Math.max(0,Math.round(p.due))||"''"}})"><i class="ti ti-send"></i>Record payment</button></div>
  <div class="partner-steps"><div><small>${p.basis==='revenue'?'Income received':'Profit so far'}</small><b>${taka(p.base)}</b></div><div><small>${p.share}% share</small><b>${taka(p.owed)}</b></div><div><small>Already paid</small><b>${taka(p.paid)}</b></div><div class="due ${over?'over':''}"><small>${over?'Paid ahead':'Still to pay'}</small><b>${taka(Math.abs(p.due))}</b></div></div></section>`;
}
function renderPartners(){
  const list=D.channels.map(c=>[c,partnerFor(c)]).filter(x=>x[1]);
  $('#view').innerHTML=head('Partner share','How much each partner has earned and what you’ve paid them.')+
  (list.length?`<div class="stack">${list.map(([c,p])=>partnerCard(c,p)).join('')}
   <section class="glass card"><div class="card-h"><h2>Payments made</h2></div><div class="list">${entries().filter(x=>x.kind==='out'&&list.some(([c])=>x.channel_id===c.id&&isPartnerPay(x.raw,c))).map(x=>entryRow(x)).join('')||'<div class="empty">No partner payments yet.</div>'}</div></section></div>`
  :`<div class="glass card empty"><i class="ti ti-users-group"></i><b>No partners set up</b>Open a channel and add a partner name and share.</div>`);
}

/* ── subscriptions ─────────────────────────────── */
function renderSubs(){
  const today=todayISO();
  $('#view').innerHTML=head('Subscriptions','Tools you pay for every month or year.',`<button class="btn btn-primary" onclick="openSub()"><i class="ti ti-plus"></i>Add subscription</button>`)+
  `<div class="row r-3" style="margin-bottom:18px">${kpi('ti-repeat','Per month',taka(monthlySubs()),'Annual plans divided by 12')}${kpi('ti-calendar','Per year',taka(monthlySubs()*12),'If nothing changes')}${kpi('ti-alert-triangle','Overdue',D.subs.filter(s=>s.status!=='cancelled'&&s.next_payment&&s.next_payment<today).length,'Past their payment date','rose')}</div>
  <section class="glass card"><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Service</th><th>Channel</th><th>Cycle</th><th>Next payment</th><th class="r">Amount</th><th></th></tr></thead><tbody>
  ${D.subs.map(s=>`<tr><td><b>${esc(s.service_name)}</b>${s.status==='cancelled'?' <span class="pill grey">Cancelled</span>':''}</td><td>${esc(chName(s.channel_id)||'Whole business')}</td><td>${s.billing_cycle==='annual'?'Yearly':'Monthly'}</td><td>${s.next_payment?`<span class="${s.next_payment<today&&s.status!=='cancelled'?'neg':''}">${fmtDate(s.next_payment)}</span>`:'—'}</td><td class="r"><b>${taka(s.amount)}</b></td>
  <td class="r"><details class="menu"><summary class="icon-btn"><i class="ti ti-dots"></i></summary><div class="menu-pop">${s.status!=='cancelled'?`<button onclick="paySub('${s.id}')">Mark this cycle paid</button>`:''}<button onclick="openSub('${s.id}')">Edit</button><button class="danger" onclick="deleteSub('${s.id}')">Delete</button></div></details></td></tr>`).join('')||'<tr><td colspan="6"><div class="empty">No subscriptions yet. Add ChatGPT, ElevenLabs, Kling and the rest so their renewals show up on your dashboard.</div></td></tr>'}
  </tbody></table></div></section>`;
}
function openSub(id){
  const s=id?D.subs.find(x=>x.id===id):{};
  dialog(`<form><h2>${id?'Edit':'Add'} subscription</h2><p class="dlg-sub">Renewals show up on the dashboard.</p><div class="grid2">
   <label class="fld"><span>Service</span><input class="inp" name="service_name" required value="${esc(s.service_name||'')}" placeholder="e.g. ElevenLabs"></label>
   <label class="fld"><span>Amount (৳)</span><input class="inp" name="amount" type="number" min="1" step="any" required value="${esc(s.amount??'')}"></label>
   <label class="fld"><span>Billing</span><select class="inp" name="billing_cycle"><option value="monthly">Monthly</option><option value="annual" ${s.billing_cycle==='annual'?'selected':''}>Yearly</option></select></label>
   <label class="fld"><span>Next payment</span><input class="inp" name="next_payment" type="date" value="${esc(s.next_payment||'')}"></label>
   <label class="fld"><span>Channel</span><select class="inp" name="channel_id">${chOpts(s.channel_id)}</select></label>
   <label class="fld"><span>Paid with</span><select class="inp" name="payment_method">${opts(METHODS,s.payment_method||'Card')}</select></label>
   <label class="fld"><span>Status</span><select class="inp" name="status"><option value="active">Active</option><option value="cancelled" ${s.status==='cancelled'?'selected':''}>Cancelled</option></select></label>
   <label class="fld"><span>Notes</span><input class="inp" name="notes" value="${esc(s.notes||'')}"></label></div><p class="err" role="alert"></p>
   <footer><button type="button" class="btn btn-ghost" data-close>Cancel</button><button class="btn btn-primary" type="submit">${id?'Save':'Add subscription'}</button></footer></form>`,d=>{
    d.querySelector('form').onsubmit=async e=>{e.preventDefault();const fd=Object.fromEntries(new FormData(e.target));const row={service_name:fd.service_name.trim(),amount:n(fd.amount),billing_cycle:fd.billing_cycle,next_payment:fd.next_payment||null,channel_id:fd.channel_id||null,scope:fd.channel_id?'channel':'whole_business',payment_method:fd.payment_method,status:fd.status,notes:fd.notes||null};
      const res=id?await sb.from('finance_subscriptions').update(row).eq('id',id).select('id'):await sb.from('finance_subscriptions').insert(row).select('id');if(res.error){d.querySelector('.err').textContent=res.error.message;return}d.close();toast(id?'Subscription saved':'Subscription added');refresh()};
  });
}
async function paySub(id){
  const s=D.subs.find(x=>x.id===id);if(!s)return;
  if(!await confirmDialog(`Pay ${esc(s.service_name)}?`,`This adds a paid expense of ${taka(s.amount)} today and moves the next payment ${s.billing_cycle==='annual'?'a year':'a month'} ahead.`,'Record payment',false))return;
  const ex=await sb.from('finance_expenses').insert({date:todayISO(),payment_date:todayISO(),payee:s.service_name,amount:n(s.amount),category:/gpt|eleven|kling|ai|claude|gemini|midjourney/i.test(s.service_name)?'AI Subscription':'Software Subscription',scope:s.channel_id?'channel':'whole_business',channel_id:s.channel_id,payment_method:s.payment_method,approval_status:'paid',description:`${s.service_name} subscription`,requested_by:user.id,voucher_number:`PAY-${todayISO().slice(0,7).replace('-','')}-${String(D.expenses.length+1).padStart(4,'0')}`});
  if(ex.error){toast(ex.error.message);return}
  const base=s.next_payment&&s.next_payment>=todayISO()?s.next_payment:todayISO();const d=new Date(base+'T00:00:00');if(s.billing_cycle==='annual')d.setFullYear(d.getFullYear()+1);else d.setMonth(d.getMonth()+1);
  await sb.from('finance_subscriptions').update({last_payment:todayISO(),next_payment:d.toISOString().slice(0,10)}).eq('id',id);
  toast('Payment recorded');refresh();
}
async function deleteSub(id){const s=D.subs.find(x=>x.id===id);if(!await confirmDialog('Delete this subscription?',`${esc(s?.service_name)} will stop showing up. Past payments stay in Transactions.`,'Delete'))return;const {error}=await sb.from('finance_subscriptions').delete().eq('id',id);if(error)toast(error.message);else{toast('Subscription deleted');refresh()}}

/* ── reports ─────────────────────────────── */
function renderReports(){
  const years=[...new Set(entries().map(x=>String(x.date).slice(0,4)).filter(Boolean))].sort().reverse();
  const y=UI.rep.year||years[0]||todayISO().slice(0,4);UI.rep.year=y;
  const keys=Array.from({length:12},(_,i)=>`${y}-${String(i+1).padStart(2,'0')}`).filter(k=>k<=monthKey(todayISO()));
  const first=entries().map(x=>monthKey(x.date)).filter(k=>k&&k.startsWith(y)).sort()[0];
  const rows=keys.filter(k=>!first||k>=first).map(k=>({k,...totals(i=>monthKey(i.date)===k,e=>monthKey(expDate(e))===k)}));
  const yt=totals(i=>String(i.date).startsWith(y),e=>String(expDate(e)).startsWith(y));
  const cats={};D.expenses.filter(e=>expPaid(e)&&String(expDate(e)).startsWith(y)).forEach(e=>cats[e.category||'Other']=(cats[e.category||'Other']||0)+n(e.amount));
  const chRows=[...D.channels.map(c=>({name:c.name,...totals(i=>i.channel_id===c.id&&String(i.date).startsWith(y),e=>e.channel_id===c.id&&String(expDate(e)).startsWith(y))})),{name:'Whole business',...totals(i=>!i.channel_id&&String(i.date).startsWith(y),e=>!e.channel_id&&String(expDate(e)).startsWith(y))}].filter(r=>r.inc||r.out);
  $('#view').innerHTML=head('Reports',`Money in and out for ${y}, counted when it actually moved.`,
    `<select class="inp" style="width:auto;border-radius:999px" onchange="UI.rep.year=this.value;renderReports()">${(years.length?years:[y]).map(v=>`<option ${v===y?'selected':''}>${v}</option>`).join('')}</select><button class="btn btn-ghost" onclick="window.print()"><i class="ti ti-printer"></i>Print</button><button class="btn btn-ghost" onclick="exportCSV(entries().filter(x=>String(x.date).startsWith('${y}')))"><i class="ti ti-download"></i>Export ${y}</button>`)+
  `<div class="stack"><div class="row r-3">${kpi('ti-arrow-down-left','Came in',taka(yt.inc),`During ${y}`)}${kpi('ti-arrow-up-right','Went out',taka(yt.out),`During ${y}`,'rose')}${kpi('ti-scale','Net',`<span class="${yt.net>=0?'pos':'neg'}">${taka(yt.net,{sign:true})}</span>`,'Income minus expenses')}</div>
  <div class="row r-2-1"><section class="glass card"><div class="card-h"><h2>Month by month</h2></div><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Month</th><th class="r">In</th><th class="r">Out</th><th class="r">Net</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${monthLabel(r.k,true)}</td><td class="r">${taka(r.inc)}</td><td class="r">${taka(r.out)}</td><td class="r ${r.net>=0?'pos':'neg'}"><b>${taka(r.net,{sign:true})}</b></td></tr>`).join('')}</tbody><tfoot><tr><td>Total</td><td class="r">${taka(yt.inc)}</td><td class="r">${taka(yt.out)}</td><td class="r ${yt.net>=0?'pos':'neg'}">${taka(yt.net,{sign:true})}</td></tr></tfoot></table></div></section>
  <section class="glass card"><div class="card-h"><h2>Spending by category</h2></div>${categoryMeters(cats)}</section></div>
  <section class="glass card"><div class="card-h"><h2>By channel</h2></div><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Channel</th><th class="r">Earned</th><th class="r">Spent</th><th class="r">Net</th></tr></thead><tbody>${chRows.map(r=>`<tr><td><b>${esc(r.name)}</b></td><td class="r">${taka(r.inc)}</td><td class="r">${taka(r.out)}</td><td class="r ${r.net>=0?'pos':'neg'}"><b>${taka(r.net,{sign:true})}</b></td></tr>`).join('')||'<tr><td colspan="4"><div class="empty">Nothing recorded this year.</div></td></tr>'}</tbody></table></div></section>
  <section class="glass card" id="legacy"><div class="card-h"><h2>Older expense tracker</h2><span class="sub">June 2026 records from the first version. Not counted in the balance.</span></div><div id="legacy-body"><div class="empty">Loading…</div></div></section></div>`;
  loadLegacy();
}
async function loadLegacy(){
  const el=$('#legacy-body');if(!el)return;const {data,error}=await sb.from('expenses').select('id,description,amount,category,expense_date,note,invoice_url').order('expense_date',{ascending:false});
  if(error){el.innerHTML=`<div class="empty">${esc(error.message)}</div>`;return}if(!data?.length){$('#legacy').remove();return}
  const tot=data.reduce((s,r)=>s+n(r.amount),0);
  el.innerHTML=`<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Date</th><th>What</th><th>Category</th><th class="r">Amount</th><th>Receipt</th></tr></thead><tbody>${data.map(r=>`<tr><td>${fmtDate(r.expense_date)}</td><td>${esc(r.description)}</td><td>${esc(r.category)}</td><td class="r">${taka(r.amount)}</td><td>${r.invoice_url&&/^https?:/.test(r.invoice_url)?`<a href="${esc(r.invoice_url)}" target="_blank" rel="noopener">Open</a>`:'—'}</td></tr>`).join('')}</tbody><tfoot><tr><td colspan="3">Total</td><td class="r">${taka(tot)}</td><td></td></tr></tfoot></table></div>`;
}

/* ── settings ─────────────────────────────── */
function renderSettings(){
  const s=D.settings||{};
  $('#view').innerHTML=head('Settings','Starting point for your balance.')+
  `<section class="glass card" style="max-width:560px"><form id="set-form"><label class="fld"><span>Opening balance (৳)</span><input class="inp" name="opening_balance" type="number" step="any" value="${esc(s.opening_balance??0)}"><span class="hint">The money the business had before you started recording here. Your balance is built on top of it.</span></label>
  <label class="fld"><span>Default dollar rate (taka per $1)</span><input class="inp" name="rate" type="number" step="any" value="${esc(localStorage.getItem('sa-usd-rate')||'121')}"><span class="hint">Used when you type an AdSense payout in dollars. Saved on this device.</span></label>
  <p class="err" role="alert"></p><button class="btn btn-primary" type="submit">Save settings</button></form></section>`;
  $('#set-form').onsubmit=async e=>{e.preventDefault();const fd=Object.fromEntries(new FormData(e.target));localStorage.setItem('sa-usd-rate',fd.rate);const row={opening_balance:n(fd.opening_balance),currency:'BDT',updated_by:user.id,updated_at:new Date().toISOString()};
    const res=s.id?await sb.from('finance_settings').update(row).eq('id',s.id).select('id'):await sb.from('finance_settings').insert(row).select('id');if(res.error){e.target.querySelector('.err').textContent=res.error.message;return}toast('Settings saved');refresh()};
}

/* ── private notes ─────────────────────────────── */
function renderNotes(){
  $('#view').innerHTML=$('#tpl-notes').innerHTML;
  ownerDoc.loaded=false;ownerDoc.dirty=false;ownerDoc.conflict=false;bindOwnerDocument();loadOwnerDocument();
}

init();
