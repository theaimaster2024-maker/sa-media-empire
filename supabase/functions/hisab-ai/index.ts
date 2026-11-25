// Hisab AI for the SA Media website. Owner-only. Same brain as the phone app:
// Claude keys first, Gemini keys as fallback. Keys live in public.hisab_secrets (no RLS policy, service role only).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Cache-Control': 'no-store' };
const URL_ = Deno.env.get('SUPABASE_URL')!;
const ANON = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

type Msg = { role: 'user' | 'assistant'; content: any };
const n = (v: unknown) => { const x = Number(v); return Number.isFinite(x) ? x : 0; };
const tk = (v: unknown) => '৳' + Math.round(n(v)).toLocaleString('en-IN');
const dhakaDate = (d = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dhaka', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
const dhakaTime = (iso: string) => new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Dhaka', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso));

const TOOLS = [
  { name: 'update_transaction', description: 'Change a Hisab transaction (phone-tracked). Use its id from the list. Setting profile=business sends it to SA Media finance as a pending entry for approval.',
    input_schema: { type: 'object', properties: { id: { type: 'string' }, purpose: { type: 'string' }, category: { type: 'string' }, profile: { type: 'string', enum: ['personal', 'business'] },
      owner_money: { type: 'string', enum: ['owner_salary', 'partner_share', 'owner_loan', 'owner_withdrawal', ''], description: 'Only for business money moved to the owner/partner' },
      biz_category: { type: 'string', description: 'SA Media expense category or income source' }, channel: { type: 'string', description: 'SA Media channel name, empty = whole business' },
      status: { type: 'string', enum: ['done', 'ignored'], description: 'ignored = remove from all totals' } }, required: ['id'] } },
  { name: 'add_transaction', description: 'Add a money movement Hisab missed (cash, etc.).',
    input_schema: { type: 'object', properties: { profile: { type: 'string', enum: ['personal', 'business'] }, dir: { type: 'string', enum: ['in', 'out'] }, amount: { type: 'number' },
      date: { type: 'string', description: 'YYYY-MM-DD, default today' }, counterparty: { type: 'string' }, purpose: { type: 'string' }, category: { type: 'string' },
      account: { type: 'string', description: 'account client_id from ACCOUNTS' }, owner_money: { type: 'string' }, biz_category: { type: 'string' } }, required: ['profile', 'dir', 'amount'] } },
  { name: 'set_account_balance', description: 'Set the current balance of an account.',
    input_schema: { type: 'object', properties: { account: { type: 'string', description: 'client_id' }, balance: { type: 'number' } }, required: ['account', 'balance'] } },
  { name: 'add_debt_entry', description: 'পাওনা/দেনা entry. lent = I gave a loan, got_back = they repaid me, borrowed = I took a loan, repaid = I paid back.',
    input_schema: { type: 'object', properties: { person: { type: 'string' }, type: { type: 'string', enum: ['lent', 'got_back', 'borrowed', 'repaid'] }, amount: { type: 'number' }, date: { type: 'string' }, note: { type: 'string' } }, required: ['person', 'type', 'amount'] } },
  { name: 'add_business_entry', description: 'Add SA Media income or expense directly (the owner is saying it, so default is already paid/received).',
    input_schema: { type: 'object', properties: { kind: { type: 'string', enum: ['income', 'expense'] }, amount: { type: 'number' }, date: { type: 'string' }, name: { type: 'string', description: 'payee for expense, source for income' },
      category: { type: 'string' }, channel: { type: 'string' }, done: { type: 'boolean', description: 'false = waiting/not paid yet' }, method: { type: 'string' }, description: { type: 'string' } }, required: ['kind', 'amount'] } },
  { name: 'mark_business_done', description: 'Approve a pending SA Media entry (mark expense paid / income received).',
    input_schema: { type: 'object', properties: { kind: { type: 'string', enum: ['income', 'expense'] }, id: { type: 'string' } }, required: ['kind', 'id'] } },
  { name: 'remember', description: 'Save a standing instruction/fact about how the owner wants money tracked (shared with the phone app).',
    input_schema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] } },
];

Deno.serve(async (req) => {
  const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return reply({ error: 'Method not allowed' }, 405);
  try {
    const bearer = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
    if (!bearer) return reply({ error: 'Sign in required' }, 401);
    const admin = createClient(URL_, SERVICE, { auth: { persistSession: false } });
    const { data: { user }, error: uerr } = await admin.auth.getUser(bearer);
    if (uerr || !user) return reply({ error: 'Sign in required' }, 401);
    const { data: prof } = await admin.from('profiles').select('role,name').eq('id', user.id).maybeSingle();
    if (prof?.role !== 'owner') return reply({ error: 'Owner only' }, 403);
    // every data read/write below runs as the owner, through RLS
    const db = createClient(URL_, ANON, { auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${bearer}` } } });

    const body = await req.json();
    const mode = body.profile === 'business' ? 'business' : 'personal';
    if (body.action === 'clear') { await db.from('hisab_chat').delete().eq('owner_id', user.id); return reply({ ok: true }); }
    const text = String(body.message || '').slice(0, 4000).trim();
    const image = typeof body.image === 'string' && body.image.length < 6_000_000 ? body.image : null;
    if (!text && !image) return reply({ error: 'Empty message' }, 400);

    const { data: sec } = await admin.from('hisab_secrets').select('*').eq('owner_id', user.id).maybeSingle();
    if (!sec || (!sec.claude_keys?.length && !sec.gemini_keys?.length)) return reply({ error: 'No AI key saved yet. Open the Hisab app once while signed in so it can send its keys.' }, 400);

    const channels = (await db.from('finance_channels').select('id,name,status').order('name')).data || [];
    const chByName = (nm?: string) => { if (!nm) return null; const k = nm.toLowerCase(); return channels.find((c: any) => c.name.toLowerCase() === k || c.name.toLowerCase().includes(k))?.id || null; };

    const system = await buildContext(db, mode, prof?.name || 'Shakil', channels);
    const hist = ((await db.from('hisab_chat').select('role,text').order('id', { ascending: false }).limit(16)).data || []).reverse();
    await db.from('hisab_chat').insert({ role: 'user', text: (image ? '📷 ' : '') + (text || '(screenshot)'), profile: mode });

    const msgs: Msg[] = [];
    for (const h of hist) {
      if (!msgs.length && h.role !== 'user') continue;
      const last = msgs[msgs.length - 1];
      if (last && last.role === h.role) last.content += '\n' + h.text; else msgs.push({ role: h.role, content: h.text });
    }
    const userContent: any = image ? [{ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: image } }, { type: 'text', text: text || 'Read this screenshot.' }] : text;
    if (msgs.length && msgs[msgs.length - 1].role === 'user') msgs.push({ role: 'assistant', content: '…' });
    msgs.push({ role: 'user', content: userContent });

    let out = '', changed = false, provider = '';
    for (let step = 0; step < 8; step++) {
      const r = await callLLM(sec, system, msgs);
      provider = r.provider;
      if (r.stop !== 'tool_use') { out = r.content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('\n').trim(); break; }
      msgs.push({ role: 'assistant', content: r.content });
      const results: any[] = [];
      for (const b of r.content) {
        if (b.type !== 'tool_use') continue;
        let res: string;
        try { res = await runTool(db, user.id, b.name, b.input || {}, chByName); changed = true; } catch (e) { res = 'error: ' + (e as Error).message; }
        results.push({ type: 'tool_result', tool_use_id: b.id, content: res });
      }
      msgs.push({ role: 'user', content: results });
    }
    if (!out) out = '✓';
    await db.from('hisab_chat').insert({ role: 'assistant', text: out, profile: mode });
    return reply({ reply: out, changed, provider });
  } catch (e) {
    console.error(e);
    return reply({ error: (e as Error).message || 'Something went wrong' }, 500);
  }
});

async function buildContext(db: any, mode: string, name: string, channels: any[]) {
  const since = new Date(Date.now() - 90 * 864e5).toISOString();
  const [acc, tx, debts, meta, inc, exp, set] = await Promise.all([
    db.from('hisab_accounts').select('client_id,profile,name,kind,provider,balance,mixed,bank_balance,balance_at').eq('deleted', false).eq('archived', false),
    db.from('hisab_txns').select('id,ts,amount,fee,incentive,dir,flow,kind,provider,counterparty,category,purpose,profile,status,owner_money,biz_category,finance_kind,source').eq('deleted', false).neq('status', 'ignored').gte('ts', since).order('ts', { ascending: false }).limit(500),
    db.from('hisab_debts').select('person,type,amount,ts,note,nodate').eq('deleted', false).order('ts'),
    db.from('hisab_meta').select('memory,custom_cats').maybeSingle(),
    db.from('finance_income').select('id,date,amount,source,channel_id,status,description,origin').order('date', { ascending: false }),
    db.from('finance_expenses').select('id,date,payment_date,payee,amount,category,channel_id,approval_status,description,origin').order('date', { ascending: false }),
    db.from('finance_settings').select('opening_balance').limit(1),
  ]);
  const ch = (id: string) => channels.find((c: any) => c.id === id)?.name || 'Whole business';
  const A = acc.data || [], T = tx.data || [], I = inc.data || [], E = exp.data || [];
  const received = I.filter((i: any) => (i.status || 'received') === 'received').reduce((s: number, i: any) => s + n(i.amount), 0);
  const paid = E.filter((e: any) => e.approval_status === 'paid').reduce((s: number, e: any) => s + n(e.amount), 0);
  const bizBal = n(set.data?.[0]?.opening_balance) + received - paid;

  // debts per person
  const people: Record<string, number> = {};
  for (const d of debts.data || []) { const sign = d.type === 'lent' || d.type === 'repaid' ? 1 : -1; people[d.person] = (people[d.person] || 0) + sign * n(d.amount); }

  // monthly personal spending (same rule as the phone: out + fees, no self transfers, no business, no debt rows)
  const debtCats = ['lent', 'debt_repay', 'debt_back', 'borrowed'];
  const month: Record<string, { out: number; inc: number }> = {};
  for (const t of T) {
    if (t.profile !== 'personal' || debtCats.includes(t.category)) continue;
    const k = dhakaDate(new Date(t.ts)).slice(0, 7); month[k] ||= { out: 0, inc: 0 };
    if (t.dir === 'out') month[k].out += n(t.amount) + n(t.fee);
    else if (t.dir === 'self') month[k].out += n(t.fee);
    else if (t.dir === 'in') month[k].inc += n(t.amount) + n(t.incentive);
  }

  const L: string[] = [];
  L.push(`You are Hisab, ${name}'s money assistant. Same brain as his Hisab phone app, now inside his SA Media Empire website (owner-only).`,
    `He has two profiles: PERSONAL money (his own bKash/bank/cards) and BUSINESS money (SA Media: Wise, AdSense, channel costs). Never mix them. Right now he is looking at the ${mode.toUpperCase()} tab, so lean that way unless he asks otherwise.`,
    `Business money that goes to him personally is one of: owner_salary, partner_share, owner_loan, owner_withdrawal. If it's unclear which, ask him (one short question). Phone entries marked business become PENDING SA Media entries until he approves (mark_business_done).`,
    `Use tools to change data, then confirm in one short line. Do arithmetic carefully. Use ৳.`,
    `STYLE: point-to-point and SHORT: 1-4 short lines or bullets (•), no intro, no filler, no headings or tables unless he asks for detail. Reply in Bangla (Bangladeshi spoken) unless he writes in English. Call him শাকিল ভাই.`,
    `Today (Dhaka): ${dhakaDate()}.`);
  if (meta.data?.memory) L.push(`\nTHINGS HE TOLD YOU TO REMEMBER:\n${meta.data.memory}`);
  L.push(`\nACCOUNTS (client_id | profile | name | provider | balance):`);
  for (const a of A) L.push(`${a.client_id} | ${a.profile}${a.mixed ? ' (mixed: personal part only)' : ''} | ${a.name} | ${a.provider || ''} | ${tk(a.balance)}`);
  L.push(`Personal total ${tk(A.filter((a: any) => a.profile === 'personal').reduce((s: number, a: any) => s + n(a.balance), 0))}.`);
  L.push(`\nSA MEDIA BUSINESS: balance ${tk(bizBal)} (opening + received − paid). Waiting income ${tk(I.filter((i: any) => i.status === 'pending').reduce((s: number, i: any) => s + n(i.amount), 0))}, unpaid expenses ${tk(E.filter((e: any) => e.approval_status !== 'paid' && e.approval_status !== 'rejected').reduce((s: number, e: any) => s + n(e.amount), 0))}.`);
  L.push(`Channels: ${channels.map((c: any) => c.name).join(', ')}`);
  L.push(`\nPERSONAL MONTHS (spent / income): ${Object.entries(month).sort().reverse().slice(0, 4).map(([k, v]) => `${k}: ${tk(v.out)} / ${tk(v.inc)}`).join('; ') || 'none yet'}`);
  L.push(`\nপাওনা/দেনা (+ = they owe him, − = he owes): ${Object.entries(people).map(([p, v]) => `${p} ${v >= 0 ? '+' : '−'}${tk(Math.abs(v))}`).join(', ') || 'none'}`);
  L.push(`\nHISAB TRANSACTIONS last 90 days (id | time | profile | dir | amount | provider | counterparty | category | purpose | status | owner_money):`);
  for (const t of T) L.push(`${t.id} | ${dhakaTime(t.ts)} | ${t.profile} | ${t.dir} | ${tk(t.amount)}${n(t.fee) ? ' fee ' + tk(t.fee) : ''} | ${t.provider || ''} | ${t.counterparty || ''} | ${t.category || ''} | ${t.purpose || ''} | ${t.status} | ${t.owner_money || ''}`);
  const recentI = I.slice(0, 60), recentE = E.slice(0, 80);
  L.push(`\nSA MEDIA INCOME recent (id | date | amount | source | channel | status):`);
  for (const i of recentI) L.push(`${i.id} | ${i.date} | ${tk(i.amount)} | ${i.source} | ${ch(i.channel_id)} | ${i.status}${i.origin === 'hisab' ? ' | from phone' : ''}`);
  L.push(`\nSA MEDIA EXPENSES recent (id | date | amount | payee | category | channel | status):`);
  for (const e of recentE) L.push(`${e.id} | ${e.payment_date || e.date} | ${tk(e.amount)} | ${e.payee || ''} | ${e.category} | ${ch(e.channel_id)} | ${e.approval_status}${e.origin === 'hisab' ? ' | from phone' : ''}`);
  return L.join('\n');
}

async function runTool(db: any, uid: string, name: string, a: any, chByName: (s?: string) => string | null): Promise<string> {
  const ok = (r: any, msg = 'ok') => { if (r.error) throw new Error(r.error.message); return msg; };
  const day = (d?: string) => /^\d{4}-\d{2}-\d{2}$/.test(d || '') ? d! : dhakaDate();
  switch (name) {
    case 'update_transaction': {
      const p: any = {};
      for (const k of ['purpose', 'category', 'profile', 'owner_money', 'biz_category', 'status']) if (a[k] !== undefined) p[k] = a[k] || null;
      if (p.profile === undefined && p.owner_money) p.profile = 'business';
      if (a.channel !== undefined) p.biz_channel_id = chByName(a.channel);
      if (p.status === undefined) p.status = 'done';
      return ok(await db.from('hisab_txns').update(p).eq('id', a.id).select('id').single());
    }
    case 'add_transaction': {
      const ts = new Date(day(a.date) + 'T12:00:00+06:00').toISOString();
      let provider = 'cash', kind = 'cash';
      if (a.account) { const { data } = await db.from('hisab_accounts').select('provider,kind').eq('client_id', a.account).maybeSingle(); if (data) { provider = data.provider || provider; kind = data.kind || kind; } }
      return ok(await db.from('hisab_txns').insert({ ts, amount: n(a.amount), dir: a.dir, kind, provider, counterparty: a.counterparty || null, purpose: a.purpose || null,
        category: a.category || null, profile: a.profile, status: 'done', source: 'web', account_client_id: a.account || null, owner_money: a.owner_money || null, biz_category: a.biz_category || null }).select('id').single(), 'added');
    }
    case 'set_account_balance':
      return ok(await db.from('hisab_accounts').update({ balance: n(a.balance), balance_at: new Date().toISOString() }).eq('client_id', a.account).select('id').single());
    case 'add_debt_entry':
      return ok(await db.from('hisab_debts').insert({ person: a.person, type: a.type, amount: n(a.amount), ts: new Date(day(a.date) + 'T12:00:00+06:00').toISOString(), note: a.note || 'ওয়েব থেকে', nodate: !a.date }));
    case 'add_business_entry': {
      const date = day(a.date), done = a.done !== false, channel_id = chByName(a.channel);
      if (a.kind === 'income') return ok(await db.from('finance_income').insert({ date, amount: n(a.amount), source: a.name || a.category || 'Other', channel_id, description: a.description || null,
        payment_method: a.method || 'Wise', status: done ? 'received' : 'pending', created_by: uid, origin: 'web-ai' }));
      return ok(await db.from('finance_expenses').insert({ date, amount: n(a.amount), payee: a.name || a.category || 'Expense', category: a.category || 'Other', channel_id, scope: channel_id ? 'channel' : 'whole_business',
        description: a.description || null, payment_method: a.method || 'Wise', approval_status: done ? 'paid' : 'pending', payment_date: done ? date : null, requested_by: uid, origin: 'web-ai' }));
    }
    case 'mark_business_done':
      if (a.kind === 'income') return ok(await db.from('finance_income').update({ status: 'received' }).eq('id', a.id).select('id').single());
      return ok(await db.from('finance_expenses').update({ approval_status: 'paid', payment_date: dhakaDate() }).eq('id', a.id).select('id').single());
    case 'remember': {
      const { data } = await db.from('hisab_meta').select('memory').maybeSingle();
      const mem = ((data?.memory || '') + '\n• ' + String(a.text).slice(0, 300)).trim();
      return ok(await db.from('hisab_meta').upsert({ owner_id: uid, memory: mem }));
    }
  }
  throw new Error('unknown tool ' + name);
}

// ---------------------------------------------------------------- LLM router (Claude → Gemini)
async function callLLM(sec: any, system: string, msgs: Msg[]) {
  const errors: string[] = [];
  for (const key of sec.claude_keys || []) {
    try {
      const r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({ model: sec.claude_model, max_tokens: 1500, system, messages: msgs, tools: TOOLS }) });
      if (!r.ok) { errors.push('claude ' + r.status); continue; }
      const j = await r.json();
      return { content: j.content || [], stop: j.stop_reason, provider: 'claude' };
    } catch (e) { errors.push('claude ' + (e as Error).message); }
  }
  for (const key of sec.gemini_keys || []) {
    try { return await gemini(sec.gemini_model, key, system, msgs); } catch (e) { errors.push('gemini ' + (e as Error).message); }
  }
  throw new Error('All AI keys failed (' + errors.join(', ') + ')');
}

async function gemini(model: string, key: string, system: string, msgs: Msg[]) {
  const idToName: Record<string, string> = {};
  const contents = msgs.map((m) => {
    const parts: any[] = [];
    if (typeof m.content === 'string') parts.push({ text: m.content });
    else for (const b of m.content) {
      if (b.type === 'text') parts.push({ text: b.text });
      else if (b.type === 'image') parts.push({ inline_data: { mime_type: b.source.media_type, data: b.source.data } });
      else if (b.type === 'tool_use') { idToName[b.id] = b.name; const p: any = { functionCall: { name: b.name, args: b.input || {} } }; if (b._sig) p.thoughtSignature = b._sig; parts.push(p); }
      else if (b.type === 'tool_result') parts.push({ functionResponse: { name: idToName[b.tool_use_id] || 'tool', response: { result: String(b.content) } } });
    }
    return { role: m.role === 'assistant' ? 'model' : 'user', parts };
  }).filter((c) => c.parts.length);
  const body = JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents,
    tools: [{ functionDeclarations: TOOLS.map((t) => ({ name: t.name, description: t.description, parameters: t.input_schema })) }],
    generationConfig: { maxOutputTokens: 8192, temperature: 0.4 } });
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  let r = await fetch(url, { method: 'POST', headers: { 'x-goog-api-key': key, 'content-type': 'application/json' }, body });
  if (!r.ok && [400, 401, 403].includes(r.status) && !key.startsWith('AIza')) r = await fetch(url, { method: 'POST', headers: { Authorization: 'Bearer ' + key, 'content-type': 'application/json' }, body });
  if (!r.ok) throw new Error(String(r.status));
  const g = await r.json();
  const out: any[] = []; let tool = false;
  (g.candidates?.[0]?.content?.parts || []).forEach((p: any, i: number) => {
    if (p.thought) return;
    if (p.functionCall) { tool = true; out.push({ type: 'tool_use', id: 'g' + Date.now() + i, name: p.functionCall.name, input: p.functionCall.args || {}, ...(p.thoughtSignature ? { _sig: p.thoughtSignature } : {}) }); }
    else if (p.text) out.push({ type: 'text', text: p.text });
  });
  if (!out.length) throw new Error('empty');
  return { content: out, stop: tool ? 'tool_use' : 'end_turn', provider: 'gemini' };
}
