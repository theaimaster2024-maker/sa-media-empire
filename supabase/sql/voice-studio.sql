-- Voice studio: ElevenLabs voice generation inside SA Media Empire.
-- The API key lives in voice_secrets (RLS on, no policies => only the service role / edge function can read it).
-- Presets and history are readable by every team member; presets are edited by the owner.

create table if not exists public.voice_secrets (
  id int primary key default 1 check (id = 1),
  elevenlabs_key text not null,
  updated_at timestamptz not null default now()
);
alter table public.voice_secrets enable row level security;

create table if not exists public.voice_presets (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  channel text,
  voice_id text not null,
  voice_name text,
  model_id text not null default 'eleven_v4',
  stability numeric not null default 0.5,
  similarity_boost numeric not null default 0.75,
  style numeric not null default 0,
  speed numeric not null default 1,
  speaker_boost boolean not null default true,
  note text,
  position int not null default 0,
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now()
);
alter table public.voice_presets enable row level security;
drop policy if exists voice_presets_read on public.voice_presets;
create policy voice_presets_read on public.voice_presets for select to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid()));
drop policy if exists voice_presets_owner on public.voice_presets;
create policy voice_presets_owner on public.voice_presets for all to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'owner'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'owner'));

create table if not exists public.voice_generations (
  id uuid primary key default gen_random_uuid(),
  created_by uuid references auth.users(id),
  preset_name text,
  voice_id text not null,
  voice_name text,
  model_id text not null,
  text text not null,
  settings jsonb,
  audio_path text not null,
  chars int,
  created_at timestamptz not null default now()
);
alter table public.voice_generations enable row level security;
drop policy if exists voice_generations_read on public.voice_generations;
create policy voice_generations_read on public.voice_generations for select to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid()));
drop policy if exists voice_generations_delete on public.voice_generations;
create policy voice_generations_delete on public.voice_generations for delete to authenticated
  using (created_by = auth.uid() or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'owner'));
create index if not exists voice_generations_created_idx on public.voice_generations (created_at desc);

-- Private bucket for the generated audio; team members read through signed URLs.
insert into storage.buckets (id, name, public) values ('voice-audio', 'voice-audio', false)
  on conflict (id) do nothing;
drop policy if exists voice_audio_team_read on storage.objects;
create policy voice_audio_team_read on storage.objects for select to authenticated
  using (bucket_id = 'voice-audio' and exists (select 1 from public.profiles p where p.id = auth.uid()));

-- Channel voices (from the channel playbooks). All default to Eleven v4.
insert into public.voice_presets (name, channel, voice_id, voice_name, model_id, stability, similarity_boost, style, speed, note, position)
select * from (values
  ('OddlyTold narrator', 'OddlyTold', 'gH9XUvPoLVtz76DeRle8', 'Asher - Conversational, Warm and Natural', 'eleven_v4', 0.53, 0.53, 0.0, 1.0, 'Animal Shorts. Hook starts with "Three animals that..."', 1),
  ('Jack (English podcast)', 'English Learning', 'gH9XUvPoLVtz76DeRle8', 'Asher - Conversational, Warm and Natural', 'eleven_v4', 0.5, 0.75, 0.0, 1.0, 'Jack & Lisa episodes, male host', 2),
  ('Lisa (English podcast)', 'English Learning', 'cuTixVvCOWFxeH3oGE9m', 'Clara', 'eleven_v4', 0.5, 0.75, 0.0, 1.0, 'Jack & Lisa episodes, female host', 3),
  ('DailyRep narrator', 'DailyRep', 'tMvyQtpCVQ0DkixuYm6J', 'Asher', 'eleven_v4', 0.5, 0.75, 0.0, 1.0, 'Never speed up the voice', 4),
  ('RenderFit intro', 'RenderFit', 'tMvyQtpCVQ0DkixuYm6J', 'Asher', 'eleven_v4', 0.6, 0.75, 0.0, 0.88, 'Short, slow, premium intro lines', 5)
) v(name, channel, voice_id, voice_name, model_id, stability, similarity_boost, style, speed, note, position)
where not exists (select 1 from public.voice_presets);
