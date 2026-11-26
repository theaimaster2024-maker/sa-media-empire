// Voice studio for SA Media Empire: ElevenLabs text-to-speech for every team member.
// The ElevenLabs key lives in public.voice_secrets (RLS on, no policies: service role only). It never reaches the browser.
// Actions: status, voice, search, generate, music, sfx (any signed-in team member); set_key (owner only).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Cache-Control': 'no-store' };
const URL_ = Deno.env.get('SUPABASE_URL')!;
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const XI = 'https://api.elevenlabs.io';
const BUCKET = 'voice-audio';
const MAX_CHARS = 20000;
const CHUNK = 2500;

const clamp = (v: unknown, lo: number, hi: number, d: number) => { const x = Number(v); return Number.isFinite(x) ? Math.min(hi, Math.max(lo, x)) : d; };
const cleanId = (v: unknown) => String(v ?? '').trim().replace(/[^A-Za-z0-9]/g, '').slice(0, 64);

async function xi(key: string, path: string, init: RequestInit = {}) {
  const r = await fetch(XI + path, { ...init, headers: { 'xi-api-key': key, ...(init.headers || {}) } });
  return r;
}
async function xiError(r: Response) {
  const t = await r.text();
  try { const j = JSON.parse(t); const d = j.detail; return (typeof d === 'string' ? d : d?.message || d?.status || JSON.stringify(d)) || t; } catch { return t.slice(0, 300) || r.statusText; }
}

// Split long scripts at paragraph / sentence boundaries so each request stays small.
function chunks(text: string): string[] {
  if (text.length <= CHUNK) return [text];
  const out: string[] = []; let cur = '';
  const parts = text.split(/(\n\s*\n)/).flatMap((p) => p.length > CHUNK ? p.split(/(?<=[.!?।])\s+/) : [p]);
  for (const p of parts) {
    if ((cur + p).length > CHUNK && cur.trim()) { out.push(cur.trim()); cur = ''; }
    if (p.length > CHUNK) { for (let i = 0; i < p.length; i += CHUNK) out.push(p.slice(i, i + CHUNK)); continue; }
    cur += (cur && !/\s$/.test(cur) && !/^\s/.test(p) ? ' ' : '') + p;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

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
    if (!prof) return reply({ error: 'Team members only' }, 403);
    const owner = prof.role === 'owner';

    const body = await req.json().catch(() => ({}));
    const action = String(body.action || 'status');

    if (action === 'set_key') {
      if (!owner) return reply({ error: 'Only the owner can change the API key' }, 403);
      const key = String(body.key || '').trim();
      if (!/^sk_[A-Za-z0-9]{20,}$/.test(key)) return reply({ error: 'That does not look like an ElevenLabs API key (it starts with sk_).' }, 400);
      const t = await xi(key, '/v1/user/subscription');
      if (!t.ok) return reply({ error: 'ElevenLabs rejected this key: ' + await xiError(t) }, 400);
      const { error } = await admin.from('voice_secrets').upsert({ id: 1, elevenlabs_key: key, updated_at: new Date().toISOString() });
      if (error) throw error;
      return reply({ ok: true, key_end: key.slice(-4) });
    }

    const { data: sec } = await admin.from('voice_secrets').select('elevenlabs_key,updated_at').eq('id', 1).maybeSingle();
    const key = sec?.elevenlabs_key as string | undefined;
    if (!key) return reply({ error: 'No ElevenLabs API key saved yet. The owner can add it on the Voice page.', no_key: true }, 400);

    if (action === 'status') {
      const [s, m] = await Promise.all([xi(key, '/v1/user/subscription'), xi(key, '/v1/models')]);
      const sub = s.ok ? await s.json() : null;
      const models = m.ok ? ((await m.json()) as any[]).filter((x) => x.can_do_text_to_speech).map((x) => ({ id: x.model_id, name: x.name, max_chars: x.max_characters_request_subscribed_user || x.maximum_text_length_per_request || null })) : [];
      return reply({
        key_saved: true, key_end: owner ? key.slice(-4) : null, owner,
        quota: sub ? { tier: sub.tier, used: sub.character_count, limit: sub.character_limit, reset: sub.next_character_count_reset_unix, status: sub.status } : null,
        quota_error: s.ok ? null : await xiError(s),
        models,
      });
    }

    if (action === 'voice') {
      const id = cleanId(body.voice_id);
      if (!id) return reply({ error: 'Voice ID is empty' }, 400);
      const r = await xi(key, `/v1/voices/${id}`);
      if (r.ok) { const v = await r.json(); return reply({ found: true, voice_id: v.voice_id, name: v.name, category: v.category, preview_url: v.preview_url, labels: v.labels || {} }); }
      // Not in the account: look it up in the public voice library.
      const s = await xi(key, `/v1/shared-voices?page_size=5&search=${encodeURIComponent(id)}`);
      if (s.ok) { const j = await s.json(); const v = (j.voices || []).find((x: any) => x.voice_id === id); if (v) return reply({ found: true, library: true, voice_id: v.voice_id, name: v.name, category: v.category, preview_url: v.preview_url, labels: { accent: v.accent, gender: v.gender, age: v.age, use_case: v.use_case } }); }
      return reply({ found: false, error: 'ElevenLabs does not know this voice ID.' });
    }

    if (action === 'search') {
      const q = String(body.q || '').slice(0, 80);
      const [mine, lib] = await Promise.all([
        xi(key, `/v2/voices?page_size=30&search=${encodeURIComponent(q)}`),
        q ? xi(key, `/v1/shared-voices?page_size=20&search=${encodeURIComponent(q)}`) : Promise.resolve(null),
      ]);
      const out: any[] = [];
      if (mine.ok) for (const v of (await mine.json()).voices || []) out.push({ voice_id: v.voice_id, name: v.name, category: v.category, preview_url: v.preview_url, labels: v.labels || {}, mine: true });
      if (lib && lib.ok) for (const v of (await lib.json()).voices || []) if (!out.some((o) => o.voice_id === v.voice_id)) out.push({ voice_id: v.voice_id, name: v.name, category: v.category, preview_url: v.preview_url, labels: { accent: v.accent, gender: v.gender, age: v.age, use_case: v.use_case }, mine: false });
      return reply({ voices: out });
    }

    if (action === 'generate') {
      const voice_id = cleanId(body.voice_id);
      const text = String(body.text || '').trim();
      if (!voice_id) return reply({ error: 'Pick a voice or paste a voice ID' }, 400);
      if (!text) return reply({ error: 'Write the text to speak' }, 400);
      if (text.length > MAX_CHARS) return reply({ error: `Text is too long (${text.length} characters). Keep it under ${MAX_CHARS}.` }, 400);
      const model_id = String(body.model_id || 'eleven_v4').replace(/[^a-z0-9_]/gi, '').slice(0, 60) || 'eleven_v4';
      const vs = body.voice_settings || {};
      const voice_settings = {
        stability: clamp(vs.stability, 0, 1, 0.5),
        similarity_boost: clamp(vs.similarity_boost, 0, 1, 0.75),
        style: clamp(vs.style, 0, 1, 0),
        use_speaker_boost: vs.use_speaker_boost !== false,
        speed: clamp(vs.speed, 0.7, 1.2, 1),
      };
      let format = 'mp3_44100_192';
      const parts = chunks(text);
      const audio: Uint8Array[] = [];
      for (let i = 0; i < parts.length; i++) {
        const payload: Record<string, unknown> = { text: parts[i], model_id, voice_settings };
        if (body.language_code) payload.language_code = String(body.language_code).slice(0, 8);
        let r = await xi(key, `/v1/text-to-speech/${voice_id}?output_format=${format}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'audio/mpeg' }, body: JSON.stringify(payload) });
        if (!r.ok && format !== 'mp3_44100_128') {
          const msg = await xiError(r);
          if (/format|tier|subscription/i.test(msg)) { format = 'mp3_44100_128'; r = await xi(key, `/v1/text-to-speech/${voice_id}?output_format=${format}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'audio/mpeg' }, body: JSON.stringify(payload) }); }
          else return reply({ error: 'ElevenLabs: ' + msg }, 502);
        }
        if (!r.ok) return reply({ error: 'ElevenLabs: ' + await xiError(r) }, 502);
        audio.push(new Uint8Array(await r.arrayBuffer()));
      }
      const total = audio.reduce((s, a) => s + a.length, 0);
      const bytes = new Uint8Array(total); let off = 0; for (const a of audio) { bytes.set(a, off); off += a.length; }

      const slug = String(body.preset_name || body.voice_name || 'voice').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'voice';
      const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15);
      const path = `${stamp.slice(0, 6)}/${stamp}_${slug}_${crypto.randomUUID().slice(0, 6)}.mp3`;
      const up = await admin.storage.from(BUCKET).upload(path, bytes, { contentType: 'audio/mpeg', upsert: false });
      if (up.error) throw up.error;
      const { data: row, error: ierr } = await admin.from('voice_generations').insert({
        created_by: user.id, preset_name: body.preset_name ? String(body.preset_name).slice(0, 120) : null,
        voice_id, voice_name: body.voice_name ? String(body.voice_name).slice(0, 160) : null, model_id,
        text, settings: { ...voice_settings, output_format: format }, audio_path: path, chars: text.length,
      }).select('id,created_at').single();
      if (ierr) throw ierr;
      const { data: signed } = await admin.storage.from(BUCKET).createSignedUrl(path, 60 * 60 * 6);
      return reply({ ok: true, id: row.id, created_at: row.created_at, path, url: signed?.signedUrl, chars: text.length, parts: parts.length, format, by: prof.name });
    }

    // Background music and sound effects. Both come back as one MP3 and are saved to History like voices.
    if (action === 'music' || action === 'sfx') {
      const kind = action;
      const prompt = String(body.prompt || '').trim();
      if (!prompt) return reply({ error: kind === 'music' ? 'Describe the music first' : 'Describe the sound first' }, 400);
      if (prompt.length > 2000) return reply({ error: 'Keep the description under 2,000 characters' }, 400);
      let path_: string, payload: Record<string, unknown>, model_id: string, duration: number | null;
      if (kind === 'music') {
        const secs = Math.round(clamp(body.seconds, 10, 300, 30));
        duration = secs;
        model_id = 'music_v1';
        payload = { prompt, music_length_ms: secs * 1000, model_id };
        if (body.instrumental !== false) payload.force_instrumental = true;
        path_ = '/v1/music';
      } else {
        const auto = body.seconds === null || body.seconds === undefined || body.seconds === 'auto';
        duration = auto ? null : Math.round(clamp(body.seconds, 0.5, 30, 5) * 10) / 10;
        model_id = 'eleven_text_to_sound_v2';
        payload = { text: prompt, prompt_influence: clamp(body.prompt_influence, 0, 1, 0.3), model_id };
        if (duration !== null) payload.duration_seconds = duration;
        if (body.loop) payload.loop = true;
        path_ = '/v1/sound-generation';
      }
      const call = (fmt: string) => xi(key, `${path_}?output_format=${fmt}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'audio/mpeg' }, body: JSON.stringify(payload) });
      let format = 'mp3_44100_192';
      let r = await call(format);
      if (!r.ok) {
        const msg = await xiError(r);
        if (/format|tier|subscription/i.test(msg)) { format = 'mp3_44100_128'; r = await call(format); if (!r.ok) return reply({ error: 'ElevenLabs: ' + await xiError(r) }, 502); }
        else return reply({ error: 'ElevenLabs: ' + msg, permission: /permission/i.test(msg) }, 502);
      }
      const bytes = new Uint8Array(await r.arrayBuffer());
      const label = String(body.label || prompt).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || kind;
      const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15);
      const path = `${stamp.slice(0, 6)}/${kind}_${stamp}_${label}_${crypto.randomUUID().slice(0, 6)}.mp3`;
      const up = await admin.storage.from(BUCKET).upload(path, bytes, { contentType: 'audio/mpeg', upsert: false });
      if (up.error) throw up.error;
      const settings = kind === 'music'
        ? { seconds: duration, instrumental: payload.force_instrumental === true, output_format: format }
        : { seconds: duration, prompt_influence: payload.prompt_influence, loop: !!payload.loop, output_format: format };
      const { data: row, error: ierr } = await admin.from('voice_generations').insert({
        kind, created_by: user.id, preset_name: body.label ? String(body.label).slice(0, 120) : null,
        voice_id: null, voice_name: null, model_id, text: prompt, settings, audio_path: path, chars: prompt.length, duration_s: duration,
      }).select('id,created_at').single();
      if (ierr) throw ierr;
      const { data: signed } = await admin.storage.from(BUCKET).createSignedUrl(path, 60 * 60 * 6);
      return reply({ ok: true, kind, id: row.id, created_at: row.created_at, path, url: signed?.signedUrl, model_id, settings, by: prof.name });
    }

    return reply({ error: 'Unknown action' }, 400);
  } catch (e) {
    console.error(e);
    return reply({ error: (e as Error).message || 'Something went wrong' }, 500);
  }
});
