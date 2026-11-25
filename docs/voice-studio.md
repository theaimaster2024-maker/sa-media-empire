# Voice (ElevenLabs)

The **Voice** page (`#/voice`) turns a script into an MP3 with ElevenLabs. Every team member can use it.

## How it works

- Pick a channel voice (OddlyTold, Jack and Lisa, DailyRep, RenderFit) or choose **Any voice ID** and paste an ElevenLabs voice ID.
- The model is **Eleven v4** by default. v3, Multilingual v2, Turbo v2.5 and Flash v2.5 are also available.
- Stability, similarity, style, speed and speaker boost come from the preset and can be changed for each take.
- Each generated MP3 is saved in History for the whole team: play it, download it, reuse its text and settings, or delete it.
- Scripts can be up to 20,000 characters. Long scripts are split at paragraph or sentence breaks, and the parts are joined into one MP3.

## Where things live

| Piece | Location |
| --- | --- |
| API key | `public.voice_secrets` has RLS turned on and no policies, so only the service role can read it. The key never reaches the browser. |
| Calls to ElevenLabs | Edge function `voice-studio` (`supabase/functions/voice-studio`). It handles the actions `status`, `voice`, `search`, `generate`, and `set_key` (owner only). |
| Channel voices | `public.voice_presets`. Everyone can read them; only the owner can edit them. |
| History | `public.voice_generations`, with the audio in the private storage bucket `voice-audio` (served through signed URLs). |
| SQL | `supabase/sql/voice-studio.sql` |

## API key permissions

The key needs **Text to Speech**. Add **Voices: Read** so the app can check and browse voice IDs, and **User: Read** so it can show remaining credits. The owner can replace the key from the **API key** button on the Voice page.
