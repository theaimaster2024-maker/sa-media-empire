'use strict';
/* Hisab AI rich replies: **bold**, • bullets and ```chart {json}``` blocks drawn as animated SVG charts. */
function hcEsc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function hcNum(v,unit){const a=Math.abs(+v||0);let s=a>=10000000?(a/10000000).toFixed(1).replace(/\.0$/,'')+' কোটি':a>=100000?(a/100000).toFixed(1).replace(/\.0$/,'')+' লাখ':a>=1000?(a/1000).toFixed(a>=10000?0:1).replace(/\.0$/,'')+'k':String(Math.round(a));return (v<0?'−':'')+(unit==null?'৳':unit)+s}
const HC_COL=['var(--hc1)','var(--hc2)','var(--hc3)','var(--hc4)','var(--hc5)','var(--hc6)'];
function hcChart(sp){
  try{
    const labels=(sp.labels||[]).map(String),series=(sp.series||[]).filter(s=>Array.isArray(s.data)).slice(0,4),unit=sp.unit;
    if(!labels.length||!series.length)return '';
    const type=['bar','line','pie'].includes(sp.type)?sp.type:'bar';
    const W=320,H=180,P={l:38,r:8,t:10,b:30};
    let svg='',legend='';
    if(series.length>1||type==='pie')legend=`<div class="hc-leg">${(type==='pie'?labels:series.map(s=>s.name||'')).map((n,i)=>`<span><i style="background:${HC_COL[i%6]}"></i>${hcEsc(n)}</span>`).join('')}</div>`;
    if(type==='pie'){
      const d=series[0].data.map(v=>Math.max(0,+v||0)),tot=d.reduce((a,b)=>a+b,0)||1;let acc=0;const R=62,C=2*Math.PI*R;
      svg=`<svg viewBox="0 0 ${W} ${H}" class="hc-svg"><g transform="translate(${W/2},${H/2}) rotate(-90)">${d.map((v,i)=>{const f=v/tot,s=acc;acc+=f;return `<circle r="${R}" fill="none" stroke="${HC_COL[i%6]}" stroke-width="30" stroke-dasharray="${Math.max(0,C*f-2)} ${C}" stroke-dashoffset="${-C*s}" class="hc-pie" style="animation-delay:${i*90}ms"/>`}).join('')}</g>
        <text x="${W/2}" y="${H/2+5}" text-anchor="middle" class="hc-tot">${hcEsc(hcNum(tot,unit))}</text></svg>`;
      legend=`<div class="hc-leg">${labels.map((n,i)=>`<span><i style="background:${HC_COL[i%6]}"></i>${hcEsc(n)} <b>${Math.round((+series[0].data[i]||0)/tot*100)}%</b></span>`).join('')}</div>`;
    }else{
      const all=series.flatMap(s=>s.data.map(v=>+v||0)),max=Math.max(1,...all),min=Math.min(0,...all),span=max-min||1;
      const iw=W-P.l-P.r,ih=H-P.t-P.b,y=v=>P.t+ih-(v-min)/span*ih,step=iw/labels.length;
      const grid=[0,.5,1].map(f=>{const v=min+span*f;return `<line x1="${P.l}" x2="${W-P.r}" y1="${y(v)}" y2="${y(v)}" class="hc-grid"/><text x="${P.l-5}" y="${y(v)+3}" text-anchor="end" class="hc-ax">${hcEsc(hcNum(v,unit))}</text>`}).join('');
      const xl=labels.map((l,i)=>(labels.length<=8||i%Math.ceil(labels.length/8)===0)?`<text x="${P.l+step*i+step/2}" y="${H-10}" text-anchor="middle" class="hc-ax">${hcEsc(l.length>7?l.slice(0,7):l)}</text>`:'').join('');
      let body='';
      if(type==='bar'){
        const bw=Math.min(28,step*.7/series.length);
        series.forEach((s,k)=>labels.forEach((l,i)=>{const v=+s.data[i]||0,x=P.l+step*i+step/2-bw*series.length/2+bw*k,y0=y(0),y1=y(v);
          body+=`<rect x="${x+1}" y="${Math.min(y0,y1)}" width="${Math.max(2,bw-2)}" height="${Math.max(1,Math.abs(y0-y1))}" rx="4" fill="${HC_COL[k%6]}" class="hc-bar" style="animation-delay:${i*60+k*30}ms;transform-origin:center ${y0}px"><title>${hcEsc(l)}: ${hcEsc(hcNum(v,unit))}</title></rect>`;
          if(series.length===1&&labels.length<=7)body+=`<text x="${x+bw/2}" y="${Math.min(y0,y1)-4}" text-anchor="middle" class="hc-val" style="animation-delay:${i*60+300}ms">${hcEsc(hcNum(v,unit))}</text>`;}));
      }else{
        series.forEach((s,k)=>{const pts=labels.map((l,i)=>[P.l+step*i+step/2,y(+s.data[i]||0)]);const d=pts.map((p,i)=>(i?'L':'M')+p[0].toFixed(1)+' '+p[1].toFixed(1)).join(' ');
          body+=`<path d="${d} L${pts[pts.length-1][0]} ${y(min)} L${pts[0][0]} ${y(min)} Z" fill="${HC_COL[k%6]}" class="hc-area"/><path d="${d}" fill="none" stroke="${HC_COL[k%6]}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" pathLength="1" class="hc-line"/>`+
            pts.map((p,i)=>`<circle cx="${p[0]}" cy="${p[1]}" r="3.2" fill="${HC_COL[k%6]}" class="hc-dot" style="animation-delay:${400+i*50}ms"><title>${hcEsc(labels[i])}: ${hcEsc(hcNum(s.data[i],unit))}</title></circle>`).join('');});
      }
      svg=`<svg viewBox="0 0 ${W} ${H}" class="hc-svg">${grid}${body}${xl}</svg>`;
    }
    return `<div class="hc">${sp.title?`<div class="hc-t">${hcEsc(sp.title)}</div>`:''}${svg}${legend}</div>`;
  }catch(e){return ''}
}
function hcRich(text){
  const parts=String(text||'').split(/```chart\s*([\s\S]*?)```/);
  return parts.map((p,i)=>{
    if(i%2){try{return hcChart(JSON.parse(p))}catch(e){return ''}}
    return hcEsc(p).replace(/\*\*(.+?)\*\*/g,'<b>$1</b>').replace(/^\s*[-•]\s+(.*)$/gm,'<span class="hc-li">• $1</span>').replace(/\n{2,}/g,'<br>').replace(/\n/g,'<br>').replace(/(<\/span>)<br>/g,'$1');
  }).join('');
}

/* Hisab — the owner's phone money tracker, inside SA Media (owner-only).
   Data: hisab_accounts / hisab_txns / hisab_debts, synced by the Hisab Android app.
   Business rows from the phone arrive in finance_income / finance_expenses as pending (origin='hisab') and wait for approval. */
const H={max:false,tab:localStorage.getItem('hisab-tab')||'personal',acc:[],tx:[],debts:[],chat:[],loaded:false,f:'all',q:'',hide:localStorage.getItem('hisab-hide')==='1',busy:false,img:null};
const OWNER_MONEY={owner_salary:'Owner salary',partner_share:'Partner share',owner_loan:'Loan to owner',owner_withdrawal:'Owner withdrawal',owner_invest:'Owner put money in',loan_repay:'Owner paid loan back'};
const DEBT_SIGN={lent:1,repaid:1,got_back:-1,borrowed:-1};

async function loadHisab(){
  const since=new Date(Date.now()-200*864e5).toISOString();
  const [a,t,d,c]=await Promise.all([
    sb.from('hisab_accounts').select('*').eq('deleted',false).order('name'),
    sb.from('hisab_txns').select('*').eq('deleted',false).gte('ts',since).order('ts',{ascending:false}).limit(1500),
    sb.from('hisab_debts').select('*').eq('deleted',false).order('ts'),
    sb.from('hisab_chat').select('role,text,created_at').order('id',{ascending:false}).limit(30)
  ]);
  const err=[a,t,d,c].find(r=>r.error);if(err)throw err.error;
  H.acc=a.data||[];H.tx=t.data||[];H.debts=d.data||[];H.chat=(c.data||[]).reverse();H.loaded=true;
}
const hk=v=>H.hide?'৳ •••••':taka(v);
const dhakaMonth=iso=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Dhaka',year:'numeric',month:'2-digit'}).format(new Date(iso));
const txTime=iso=>new Date(iso).toLocaleString('en-GB',{timeZone:'Asia/Dhaka',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit',hour12:false});
const DEBT_CATS=['lent','debt_repay','debt_back','borrowed'];
function hPeople(){const p={};H.debts.forEach(d=>p[d.person]=(p[d.person]||0)+(DEBT_SIGN[d.type]||0)*n(d.amount));return p}
function hMonth(profile,mk){
  let out=0,inc=0;
  H.tx.filter(t=>t.profile===profile&&!['ignored'].includes(t.status)&&dhakaMonth(t.ts)===mk&&!DEBT_CATS.includes(t.category)).forEach(t=>{
    if(t.dir==='out')out+=n(t.amount)+n(t.fee);else if(t.dir==='self')out+=n(t.fee);else if(t.dir==='in')inc+=n(t.amount)+n(t.incentive)});
  return {out,inc};
}
const ASKING=['asking','pending'];
function askCard(profile){
  const qs=H.tx.filter(t=>t.profile===profile&&ASKING.includes(t.status)&&!t.deleted);
  if(!qs.length)return '';
  return `<section class="glass card h-askcard"><div class="card-h"><h2><i class="ti ti-help-circle" style="color:var(--sun)"></i> উত্তর দিন — ${qs.length}টা প্রশ্ন</h2><span class="sub">Unanswered on the phone. Answer here and the phone updates too.</span></div>
   <div class="list">${qs.slice(0,12).map(t=>{let o=[];try{o=JSON.parse(t.options||'[]')}catch{}
     const extra=profile==='business'&&t.dir!=='in'?['💼 Salary','🤝 Partner share','💸 Loan','🏧 Withdrawal']:['🏢 বিজনেস','👤 পার্সোনাল'];
     return `<div class="h-q" id="q-${t.id}"><div class="h-q-top"><div><b>${esc(t.question||`৳${Math.round(n(t.amount)).toLocaleString('en-IN')} ${t.dir==='in'?'এসেছে':'গেছে'} — এটা কিসের?`)}</b>
       <div class="li-s">${txTime(t.ts)} — ${esc(t.provider||'')}${t.counterparty?' — '+esc(t.counterparty):''}</div></div><span class="amt ${t.dir==='in'?'in':'out'}">${t.dir==='in'?'+':'−'}${hk(t.amount)}</span></div>
       <div class="h-opts">${[...o,...extra].map(x=>`<button class="btn btn-ghost btn-sm" onclick="hisabAnswer('${t.id}',this.textContent)">${esc(x)}</button>`).join('')}</div>
       <form class="h-ask" onsubmit="event.preventDefault();hisabAnswer('${t.id}',this.a.value)"><input class="inp" name="a" placeholder="নিজে লিখুন… (যেমন: আম্মুকে দিলাম)"><button class="btn btn-primary btn-sm">Save</button></form></div>`}).join('')}</div></section>`;
}
async function hisabAnswer(id,text){
  text=String(text||'').trim();if(!text)return;const box=$('#q-'+id);if(box)box.style.opacity=.5;
  const {data,error}=await sb.functions.invoke('hisab-ai',{body:{action:'answer',id,text}});
  if(error||data?.error){if(box)box.style.opacity=1;return toast(data?.error||error.message)}
  toast(data.profile==='business'?'Saved as business — waiting for your OK':'Saved');hisabReload();
}
const fromPhone=()=>[...D.income.filter(i=>i.origin==='hisab'&&i.status==='pending').map(i=>({kind:'in',r:i})),...D.expenses.filter(e=>e.origin==='hisab'&&e.approval_status==='pending').map(e=>({kind:'out',r:e}))];

async function renderHisab(){
  if(!H.loaded){$('#view').innerHTML='<div class="glass card empty"><div class="spin" style="margin:0 auto 10px"></div>Loading Hisab…</div>';try{await loadHisab()}catch(e){$('#view').innerHTML=errorBox(e.message);return}}
  const biz=H.tab==='business';
  $('#view').innerHTML=head('Hisab',biz?'Business money the phone saw, and what goes from the business to you.':'Your personal money from the Hisab phone app. Only you can see this.',
    `<button class="icon-btn" title="${H.hide?'Show':'Hide'} amounts" onclick="H.hide=!H.hide;localStorage.setItem('hisab-hide',H.hide?'1':'0');renderHisab()"><i class="ti ${H.hide?'ti-eye-off':'ti-eye'}"></i></button>
     <button class="btn btn-ghost" onclick="hisabReload()"><i class="ti ti-refresh"></i>Refresh</button><button class="btn btn-primary" onclick="hisabAdd()"><i class="ti ti-plus"></i>Add</button>`)+
  `<div class="filters"><div class="seg" id="h-tab">${[['personal','Personal'],['business','Business']].map(([k,l])=>`<button data-k="${k}" class="${H.tab===k?'on':''}">${l}</button>`).join('')}</div>
   <span class="hint">${H.acc.length?`Last phone sync ${hLastSync()}`:'Waiting for the phone app to sync for the first time.'}</span></div>
  <div class="row r-2-1 hisab-grid"><div class="stack" id="h-main">${biz?hisabBusiness():hisabPersonal()}</div><div class="stack">${hisabChatCard()}</div></div>`;
  $('#h-tab').onclick=e=>{const b=e.target.closest('button');if(!b)return;H.tab=b.dataset.k;localStorage.setItem('hisab-tab',H.tab);H.f='all';renderHisab()};
  bindHisabList();bindChat();
}
function hLastSync(){const t=[...H.acc,...H.tx].map(x=>x.updated_at).sort().pop();return t?txTime(t):'—'}

function hisabPersonal(){
  const mk=dhakaMonth(new Date().toISOString()),m=hMonth('personal',mk);
  const accs=H.acc.filter(a=>a.profile==='personal'&&!a.archived),total=accs.reduce((s,a)=>s+n(a.balance),0);
  const ppl=Object.entries(hPeople()).filter(([,v])=>Math.abs(v)>0.5),owed=ppl.filter(([,v])=>v>0).reduce((s,[,v])=>s+v,0),owe=ppl.filter(([,v])=>v<0).reduce((s,[,v])=>s-v,0);
  return `<section class="glass slab"><div class="slab-label">Personal money now</div><div class="money-xl">${H.hide?'•••••':`<span class="cur">৳</span>${Math.round(total).toLocaleString('en-IN')}`}</div>
    <div class="h-accs">${accs.map(accChip).join('')||'<span class="hint">No accounts yet. Add balances in the phone app.</span>'}</div></section>
  ${askCard('personal')}
  <div class="row r-3">${kpi('ti-arrow-up-right','Spent this month',hk(m.out),monthLabel(mk,true),'rose')}${kpi('ti-arrow-down-left','Came in this month',hk(m.inc),'Salary, transfers, remittance')}${kpi('ti-users','পাওনা / দেনা',`${hk(owed)}`,`You owe ${hk(owe)}`,'sun')}</div>
  ${hisabTxCard('personal')}
  <section class="glass card"><div class="card-h"><h2>পাওনা / দেনা</h2><span class="sub">+ they owe you, − you owe</span></div><div class="list">${ppl.map(([p,v])=>`<div class="li" style="grid-template-columns:36px minmax(0,1fr) auto"><div class="li-ic ${v>0?'in':'out'}"><i class="ti ti-user"></i></div><div class="li-t">${esc(p)}</div><span class="amt ${v>0?'in':'out'}">${v>0?'+':'−'}${hk(Math.abs(v))}</span></div>`).join('')||'<div class="empty">Nothing owed either way.</div>'}</div></section>`;
}
function accChip(a){return `<div class="h-acc"><small>${esc(a.name)}${a.mixed?' <span class="pill grey">mixed</span>':''}</small><b>${hk(a.balance)}</b></div>`}

function hisabBusiness(){
  const mk=dhakaMonth(new Date().toISOString());
  const accs=H.acc.filter(a=>a.profile==='business'&&!a.archived);
  const om={};H.tx.filter(t=>t.profile==='business'&&t.owner_money&&t.status!=='ignored'&&dhakaMonth(t.ts)===mk).forEach(t=>om[t.owner_money]=(om[t.owner_money]||0)+n(t.amount));
  const waiting=fromPhone();
  return `<section class="glass slab"><div class="slab-label">Money in the business (SA Media)</div><div class="money-xl">${H.hide?'•••••':`<span class="cur">৳</span>${Math.round(balance()).toLocaleString('en-IN')}`}</div>
    <div class="h-accs">${accs.map(accChip).join('')||'<span class="hint">Mark Wise as a Business account in the phone app to see it here.</span>'}</div></section>
  ${askCard('business')}
  <section class="glass card"><div class="card-h"><h2>From the Hisab app — needs your OK</h2><span class="sub">${waiting.length} waiting. They count only after you approve.</span></div>
   <div class="list">${waiting.map(({kind,r})=>`<div class="li"><div class="li-ic ${kind}"><i class="ti ti-device-mobile"></i></div>
     <div style="min-width:0"><div class="li-t">${esc(kind==='in'?r.source:r.payee)} <span class="pill sun">${esc(kind==='in'?'Income':r.category)}</span></div><div class="li-s">${fmtDate(r.date)}${r.channel_id?' — '+esc(chName(r.channel_id)):''}${r.description?' — '+esc(r.description):''}</div></div>
     <span class="amt ${kind}">${kind==='in'?'+':'−'}${hk(r.amount)}</span>
     <div style="display:flex;gap:6px"><button class="btn btn-primary btn-sm" onclick="hisabApprove('${kind}','${r.id}')">Approve</button><button class="btn btn-ghost btn-sm" onclick="openEntry('${kind}','${r.id}')">Edit</button>${r.hisab_txn_id?`<button class="btn btn-ghost btn-sm" title="It was personal money" onclick="hisabNotBiz('${r.hisab_txn_id}')">Personal</button>`:''}</div></div>`).join('')||'<div class="empty"><i class="ti ti-circle-check"></i><b>All clear</b>Nothing from the phone is waiting.</div>'}</div></section>
  <div class="row r-4">${Object.entries(OWNER_MONEY).slice(0,4).map(([k,l])=>kpi('ti-user-dollar',l,hk(om[k]||0),'This month','sun')).join('')}</div>
  ${hisabTxCard('business')}`;
}

function hisabTxCard(profile){
  const f=[['all','All'],['out','Out'],['in','In'],['self','Own transfers'],['ask','Needs answer']];
  return `<section class="glass card"><div class="card-h" style="flex-wrap:wrap"><h2>${profile==='business'?'Business':'Personal'} transactions</h2>
    <div class="filters" style="margin:0"><div class="seg" id="h-f">${f.map(([k,l])=>`<button data-k="${k}" class="${H.f===k?'on':''}">${l}</button>`).join('')}</div><input class="inp search" id="h-q" placeholder="Search" value="${esc(H.q)}"></div></div>
    <div class="list" id="h-list"></div></section>`;
}
function hisabRows(){
  const q=H.q.trim().toLowerCase();
  return H.tx.filter(t=>t.profile===H.tab&&t.status!=='ignored'&&(H.f==='all'||(H.f==='ask'?['asking','pending','classifying'].includes(t.status):t.dir===H.f))&&(!q||`${t.counterparty} ${t.purpose} ${t.category} ${t.provider} ${t.trx}`.toLowerCase().includes(q)));
}
function bindHisabList(){
  const draw=()=>{const rows=hisabRows();$('#h-list').innerHTML=rows.slice(0,200).map(hisabRow).join('')||'<div class="empty"><i class="ti ti-filter-off"></i><b>Nothing here</b>Change the filter, or wait for the phone to sync.</div>'};
  const seg=$('#h-f');if(!seg)return;
  seg.onclick=e=>{const b=e.target.closest('button');if(!b)return;H.f=b.dataset.k;seg.querySelectorAll('button').forEach(x=>x.classList.toggle('on',x===b));draw()};
  $('#h-q').oninput=e=>{H.q=e.target.value;draw()};draw();
}
function hisabRow(t){
  const ic=t.dir==='in'?'in':'out',icon=t.dir==='self'?'ti-arrows-left-right':t.dir==='in'?'ti-arrow-down-left':'ti-arrow-up-right';
  const ask=['asking','pending','classifying'].includes(t.status);
  const tag=t.owner_money?`<span class="pill sun">${OWNER_MONEY[t.owner_money]}</span>`:t.finance_kind?`<span class="pill">${t.finance_kind==='income'?'In SA Media':'In SA Media'}</span>`:ask?'<span class="pill sun">Ask</span>':'';
  return `<div class="li h-li" onclick="hisabEdit('${t.id}')"><div class="li-ic ${ic}"><i class="ti ${icon}"></i></div>
   <div style="min-width:0"><div class="li-t">${esc(t.purpose||t.counterparty||t.category||t.kind||'Transaction')}</div><div class="li-s">${txTime(t.ts)} — ${esc(t.provider||'')}${t.counterparty&&t.purpose?' — '+esc(t.counterparty):''}${t.category?' — '+esc(t.category):''}</div></div>
   <div>${tag}</div><span class="amt ${ic}">${t.dir==='in'?'+':t.dir==='self'?'':'−'}${hk(t.amount)}${n(t.fee)?`<small class="hint"> +${hk(t.fee)} fee</small>`:''}</span></div>`;
}

function hisabEdit(id){
  const t=H.tx.find(x=>x.id===id);if(!t)return;
  const cats=t.dir==='in'?INCOME_SOURCES:EXPENSE_CATS;
  dialog(`<form class="dlg-body" id="h-ed"><h2>${t.dir==='in'?'+':'−'}${taka(t.amount)} ${t.dir==='in'?'from':'to'} ${esc(t.counterparty||t.provider||'')}</h2>
   <p class="dlg-sub">${txTime(t.ts)} — ${esc(t.provider||'')}${t.trx?' — TrxID '+esc(t.trx):''}${t.raw?`<br><span class="hint">${esc(String(t.raw).slice(0,220))}</span>`:''}</p>
   <div class="grid2">
    <label class="fld full"><span>What was it for?</span><input class="inp" name="purpose" value="${esc(t.purpose||'')}"></label>
    <label class="fld"><span>Category</span><input class="inp" name="category" value="${esc(t.category||'')}"></label>
    <label class="fld"><span>Whose money?</span><select class="inp" name="profile"><option value="personal" ${t.profile==='personal'?'selected':''}>Personal</option><option value="business" ${t.profile==='business'?'selected':''}>Business (SA Media)</option></select></label>
    <div class="full h-biz" style="display:${t.profile==='business'?'contents':'none'}">
     <label class="fld"><span>Business to you?</span><select class="inp" name="owner_money"><option value="">No — a normal business ${t.dir==='in'?'income':'cost'}</option>${Object.entries(OWNER_MONEY).map(([k,l])=>`<option value="${k}" ${t.owner_money===k?'selected':''}>${l}</option>`).join('')}</select></label>
     <label class="fld"><span>${t.dir==='in'?'Income source':'Expense category'}</span><select class="inp" name="biz_category"><option value="">Auto</option>${opts(cats,t.biz_category||'')}</select></label>
     <label class="fld full"><span>Channel</span><select class="inp" name="biz_channel_id">${chOpts(t.biz_channel_id)}</select></label>
     <p class="hint full">Business rows go to SA Media as “waiting” until you approve them.</p></div>
   </div>
   <footer><button type="button" class="btn btn-ghost" style="margin-right:auto;color:var(--rose)" id="h-ign">Remove from totals</button><button type="button" class="btn btn-ghost" data-close>Cancel</button><button class="btn btn-primary">Save</button></footer></form>`,d=>{
    const f=d.querySelector('#h-ed');
    f.profile.onchange=()=>d.querySelector('.h-biz').style.display=f.profile.value==='business'?'contents':'none';
    d.querySelector('#h-ign').onclick=async()=>{const {error}=await sb.from('hisab_txns').update({status:'ignored'}).eq('id',id);if(error)return toast(error.message);d.close();toast('Removed');hisabReload()};
    f.onsubmit=async e=>{e.preventDefault();const fd=Object.fromEntries(new FormData(f));const biz=fd.profile==='business';
      const row={purpose:fd.purpose||null,category:fd.category||null,profile:fd.profile,owner_money:biz?fd.owner_money||null:null,biz_category:biz?fd.biz_category||null:null,biz_channel_id:biz?fd.biz_channel_id||null:null};
      if(['asking','pending','classifying'].includes(t.status))row.status='done';
      const {error}=await sb.from('hisab_txns').update(row).eq('id',id);if(error)return toast(error.message);d.close();toast('Saved — the phone will pick it up');hisabReload()};
  });
}
function hisabAdd(){
  const biz=H.tab==='business',accs=H.acc.filter(a=>a.profile===H.tab||a.mixed);
  dialog(`<form class="dlg-body" id="h-add"><h2>Add to Hisab</h2><p class="dlg-sub">For money the phone didn’t see (cash, etc.). It shows up in the app too.</p><div class="grid2">
   <label class="fld"><span>Type</span><select class="inp" name="dir"><option value="out">Money out</option><option value="in">Money in</option></select></label>
   <label class="fld"><span>Amount (৳)</span><input class="inp" name="amount" type="number" step="any" required></label>
   <label class="fld"><span>Date</span><input class="inp" name="date" type="date" value="${todayISO()}"></label>
   <label class="fld"><span>Account</span><select class="inp" name="account"><option value="">Cash</option>${accs.map(a=>`<option value="${esc(a.client_id)}">${esc(a.name)}</option>`).join('')}</select></label>
   <label class="fld full"><span>What for / who</span><input class="inp" name="purpose" placeholder="e.g. Lunch with team"></label>
   <label class="fld"><span>Profile</span><select class="inp" name="profile"><option value="personal" ${biz?'':'selected'}>Personal</option><option value="business" ${biz?'selected':''}>Business</option></select></label>
   <label class="fld"><span>Category</span><input class="inp" name="category"></label></div>
   <footer><button type="button" class="btn btn-ghost" data-close>Cancel</button><button class="btn btn-primary">Add</button></footer></form>`,d=>{
    d.querySelector('form').onsubmit=async e=>{e.preventDefault();const fd=Object.fromEntries(new FormData(e.target));const a=H.acc.find(x=>x.client_id===fd.account);
      const {error}=await sb.from('hisab_txns').insert({ts:new Date(fd.date+'T12:00:00+06:00').toISOString(),amount:n(fd.amount),dir:fd.dir,kind:a?.kind||'cash',provider:a?.provider||'cash',purpose:fd.purpose||null,
        category:fd.category||null,profile:fd.profile,status:'done',source:'web',account_client_id:fd.account||null});
      if(error)return toast(error.message);d.close();toast('Added');hisabReload()};
  });
}
async function hisabApprove(kind,id){await markDone(kind,id)}
async function hisabNotBiz(txnId){
  const {error}=await sb.from('hisab_txns').update({profile:'personal',owner_money:null}).eq('id',txnId);
  if(error)return toast(error.message);toast('Moved back to personal');await loadData();hisabReload();
}
async function hisabReload(){try{await Promise.all([loadHisab(),loadData()])}catch(e){toast(e.message)}if(location.hash.startsWith('#/hisab'))renderHisab();else route()}

/* ── AI chat (edge function hisab-ai) ─────────────── */
function hisabChatCard(){
  return `<section class="glass card h-chat ${H.max?'h-max':''}" id="h-chatcard"><div class="h-rx" title="Drag to make wider"></div><div class="h-ry" title="Drag to make taller"></div>
   <div class="card-h"><h2><i class="ti ti-sparkles" style="color:var(--teal)"></i> Ask Hisab AI</h2><div style="display:flex;gap:6px"><button class="icon-btn" title="${H.max?'Make small':'Full screen'}" onclick="H.max=!H.max;$('#h-chatcard').classList.toggle('h-max',H.max);this.innerHTML=H.max?'<i class=\'ti ti-arrows-minimize\'></i>':'<i class=\'ti ti-arrows-maximize\'></i>'"><i class="ti ${H.max?'ti-arrows-minimize':'ti-arrows-maximize'}"></i></button><button class="icon-btn" title="Clear chat" onclick="hisabClearChat()"><i class="ti ti-trash"></i></button></div></div>
   <div class="h-log" id="h-log">${H.chat.map(m=>chatBubble(m.role,m.text)).join('')||'<div class="hint" style="padding:8px">যেমন: “এই মাসে কত খরচ হলো?”, “Wise থেকে 20k নিলাম partner share”, “Konik কত দেয়?”</div>'}</div>
   <form id="h-chat" class="h-ask"><label class="icon-btn" title="Add a screenshot"><i class="ti ti-photo"></i><input type="file" accept="image/*" hidden id="h-img"></label>
    <input class="inp" id="h-msg" placeholder="Ask or tell Hisab…" autocomplete="off"><button class="btn btn-primary btn-sm" ${H.busy?'disabled':''}><i class="ti ti-send"></i></button></form>
   <div class="hint" id="h-imgname"></div></section>`;
}
function hisabJpeg(f){return new Promise((ok,bad)=>{const img=new Image();img.onload=()=>{const k=Math.min(1,1568/Math.max(img.width,img.height)),cv=document.createElement('canvas');cv.width=Math.round(img.width*k);cv.height=Math.round(img.height*k);cv.getContext('2d').drawImage(img,0,0,cv.width,cv.height);ok(cv.toDataURL('image/jpeg',.85).split(',')[1])};img.onerror=bad;img.src=URL.createObjectURL(f)})}
function chatBubble(role,text){return role==='user'?`<div class="h-b me">${esc(text).replace(/\n/g,'<br>')}</div>`:`<div class="h-b ai${/```chart/.test(text)?' wide':''}">${hcRich(text)}</div>`}
function bindResize(){
  const card=$('#h-chatcard'),grid=card?.closest('.hisab-grid');if(!card||!grid)return;
  const w=Number(localStorage.getItem('hisab-chatw'))||0,h=Number(localStorage.getItem('hisab-chath'))||0;
  if(w)grid.style.setProperty('--chatw',w+'px');if(h)card.style.setProperty('--chath',h+'px');
  const drag=(el,axis)=>el.addEventListener('pointerdown',e=>{if(H.max)return;e.preventDefault();el.setPointerCapture(e.pointerId);document.body.classList.add('h-dragging');
    const r=grid.getBoundingClientRect(),top=$('#h-log').getBoundingClientRect().top;
    const move=ev=>{if(axis==='x'){const nw=Math.max(300,Math.min(r.width-340,r.right-ev.clientX));grid.style.setProperty('--chatw',nw+'px');localStorage.setItem('hisab-chatw',Math.round(nw))}
      else{const nh=Math.max(220,ev.clientY-top-70);card.style.setProperty('--chath',nh+'px');localStorage.setItem('hisab-chath',Math.round(nh))}};
    const up=()=>{el.removeEventListener('pointermove',move);el.removeEventListener('pointerup',up);document.body.classList.remove('h-dragging')};
    el.addEventListener('pointermove',move);el.addEventListener('pointerup',up)});
  drag(card.querySelector('.h-rx'),'x');drag(card.querySelector('.h-ry'),'y');
  card.querySelector('.h-rx').ondblclick=card.querySelector('.h-ry').ondblclick=()=>{localStorage.removeItem('hisab-chatw');localStorage.removeItem('hisab-chath');grid.style.removeProperty('--chatw');card.style.removeProperty('--chath')};
}
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&H.max){H.max=false;$('#h-chatcard')?.classList.remove('h-max')}});
function bindChat(){
  bindResize();
  const log=$('#h-log');if(log)log.scrollTop=log.scrollHeight;
  $('#h-img').onchange=async e=>{const f=e.target.files[0];if(!f)return;H.img=await hisabJpeg(f);$('#h-imgname').textContent='📷 '+f.name+' attached'};
  $('#h-chat').onsubmit=async e=>{e.preventDefault();if(H.busy)return;const inp=$('#h-msg'),text=inp.value.trim();if(!text&&!H.img)return;
    H.busy=true;inp.value='';log.insertAdjacentHTML('beforeend',chatBubble('user',(H.img?'📷 ':'')+text)+'<div class="h-b ai" id="h-think"><span class="spin" style="width:16px;height:16px;display:inline-block"></span></div>');log.scrollTop=log.scrollHeight;
    const image=H.img;H.img=null;$('#h-imgname').textContent='';
    const {data,error}=await sb.functions.invoke('hisab-ai',{body:{message:text,profile:H.tab,image}});
    H.busy=false;$('#h-think')?.remove();
    let msg=error?(await error.context?.json?.().catch(()=>null))?.error||error.message:data?.error||data?.reply||'✓';
    log.insertAdjacentHTML('beforeend',chatBubble('assistant',msg));log.scrollTop=log.scrollHeight;
    H.chat.push({role:'user',text},{role:'assistant',text:msg});
    if(data?.changed){await Promise.all([loadHisab(),loadData()]).catch(()=>{});const m=$('#h-main');if(m){m.innerHTML=H.tab==='business'?hisabBusiness():hisabPersonal();bindHisabList()}}
  };
}
async function hisabClearChat(){await sb.functions.invoke('hisab-ai',{body:{action:'clear'}});H.chat=[];renderHisab()}
