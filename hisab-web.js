'use strict';
/* Hisab — the owner's phone money tracker, inside SA Media (owner-only).
   Data: hisab_accounts / hisab_txns / hisab_debts, synced by the Hisab Android app.
   Business rows from the phone arrive in finance_income / finance_expenses as pending (origin='hisab') and wait for approval. */
const H={tab:localStorage.getItem('hisab-tab')||'personal',acc:[],tx:[],debts:[],chat:[],loaded:false,f:'all',q:'',hide:localStorage.getItem('hisab-hide')==='1',busy:false,img:null};
const OWNER_MONEY={owner_salary:'Owner salary',partner_share:'Partner share',owner_loan:'Loan to owner',owner_withdrawal:'Owner withdrawal'};
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
  <section class="glass card"><div class="card-h"><h2>From the Hisab app — needs your OK</h2><span class="sub">${waiting.length} waiting. They count only after you approve.</span></div>
   <div class="list">${waiting.map(({kind,r})=>`<div class="li"><div class="li-ic ${kind}"><i class="ti ti-device-mobile"></i></div>
     <div style="min-width:0"><div class="li-t">${esc(kind==='in'?r.source:r.payee)} <span class="pill sun">${esc(kind==='in'?'Income':r.category)}</span></div><div class="li-s">${fmtDate(r.date)}${r.channel_id?' — '+esc(chName(r.channel_id)):''}${r.description?' — '+esc(r.description):''}</div></div>
     <span class="amt ${kind}">${kind==='in'?'+':'−'}${hk(r.amount)}</span>
     <div style="display:flex;gap:6px"><button class="btn btn-primary btn-sm" onclick="hisabApprove('${kind}','${r.id}')">Approve</button><button class="btn btn-ghost btn-sm" onclick="openEntry('${kind}','${r.id}')">Edit</button>${r.hisab_txn_id?`<button class="btn btn-ghost btn-sm" title="It was personal money" onclick="hisabNotBiz('${r.hisab_txn_id}')">Personal</button>`:''}</div></div>`).join('')||'<div class="empty"><i class="ti ti-circle-check"></i><b>All clear</b>Nothing from the phone is waiting.</div>'}</div></section>
  <div class="row r-4">${Object.entries(OWNER_MONEY).map(([k,l])=>kpi('ti-user-dollar',l,hk(om[k]||0),'This month','sun')).join('')}</div>
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
  return `<section class="glass card h-chat"><div class="card-h"><h2><i class="ti ti-sparkles" style="color:var(--teal)"></i> Ask Hisab AI</h2><button class="icon-btn" title="Clear chat" onclick="hisabClearChat()"><i class="ti ti-trash"></i></button></div>
   <div class="h-log" id="h-log">${H.chat.map(m=>chatBubble(m.role,m.text)).join('')||'<div class="hint" style="padding:8px">যেমন: “এই মাসে কত খরচ হলো?”, “Wise থেকে 20k নিলাম partner share”, “Konik কত দেয়?”</div>'}</div>
   <form id="h-chat" class="h-ask"><label class="icon-btn" title="Add a screenshot"><i class="ti ti-photo"></i><input type="file" accept="image/*" hidden id="h-img"></label>
    <input class="inp" id="h-msg" placeholder="Ask or tell Hisab…" autocomplete="off"><button class="btn btn-primary btn-sm" ${H.busy?'disabled':''}><i class="ti ti-send"></i></button></form>
   <div class="hint" id="h-imgname"></div></section>`;
}
function hisabJpeg(f){return new Promise((ok,bad)=>{const img=new Image();img.onload=()=>{const k=Math.min(1,1568/Math.max(img.width,img.height)),cv=document.createElement('canvas');cv.width=Math.round(img.width*k);cv.height=Math.round(img.height*k);cv.getContext('2d').drawImage(img,0,0,cv.width,cv.height);ok(cv.toDataURL('image/jpeg',.85).split(',')[1])};img.onerror=bad;img.src=URL.createObjectURL(f)})}
function chatBubble(role,text){return `<div class="h-b ${role==='user'?'me':'ai'}">${esc(text).replace(/\n/g,'<br>')}</div>`}
function bindChat(){
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
