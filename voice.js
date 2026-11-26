'use strict';
/* Voice — ElevenLabs text-to-speech for the whole team.
   The API key is stored server-side (voice_secrets) and used only by the voice-studio edge function.
   Presets = the voices our channels use; any other ElevenLabs voice ID works too. Default model: Eleven v4. */
const VOICE_MODELS=[
  {id:'eleven_v4',name:'Eleven v4',hint:'Most expressive. Audio tags like [whispers] [laughs] [excited] work.'},
  {id:'eleven_v3',name:'Eleven v3',hint:'Expressive, audio tags work.'},
  {id:'eleven_multilingual_v2',name:'Multilingual v2',hint:'Stable long narration, Bangla and 28 languages.'},
  {id:'eleven_turbo_v2_5',name:'Turbo v2.5',hint:'Fast, good quality.'},
  {id:'eleven_flash_v2_5',name:'Flash v2.5',hint:'Fastest and cheapest, for drafts.'}
];
const V={loaded:false,presets:[],gens:[],people:{},status:null,sel:null,custom:{id:'',name:'',checked:null},model:'eleven_v4',text:'',
  set:{stability:.5,similarity_boost:.75,style:0,speed:1,use_speaker_boost:true},busy:false,last:null,urls:{},
  tab:'voice',histKind:'all',
  music:{prompt:'',label:'',seconds:30,instrumental:true,busy:false,last:null},
  sfx:{prompt:'',label:'',seconds:null,influence:.3,loop:false,busy:false,last:null}};
const AUDIO_IDEAS={
  music:[
    ['Documentary','Calm, curious documentary underscore, soft piano and light plucked strings, gentle pulse, 90 BPM, no vocals'],
    ['Quirky facts','Playful quirky background music for a funny animal facts Short, pizzicato strings, bassoon and light percussion, bouncy, 110 BPM'],
    ['Workout','Energetic modern workout track, punchy drums, deep bass, bright synths, motivating, 128 BPM, no vocals'],
    ['Lo-fi','Chill lo-fi hip hop beat, warm Rhodes keys, vinyl crackle, soft boom-bap drums, relaxed, 80 BPM'],
    ['Epic history','Epic cinematic orchestral score for a war history video, low brass, taiko drums, rising strings, tense then triumphant'],
    ['Suspense','Dark suspenseful ambient underscore, low drones, ticking pulse, sparse piano notes, building tension'],
    ['Podcast bed','Light friendly podcast background music, acoustic guitar and soft claps, warm and upbeat, low in the mix, 100 BPM'],
    ['Corporate','Clean uplifting corporate background music, light piano, soft synth pads, steady pulse, optimistic']
  ],
  sfx:[
    ['Whoosh','Fast clean whoosh transition, airy, short'],
    ['Pop','Soft cartoon pop, short and punchy'],
    ['Riser','Cinematic riser building tension for 3 seconds, ends abruptly'],
    ['Impact','Deep cinematic boom impact with a short tail'],
    ['Ding','Bright notification ding, pleasant bell, single hit'],
    ['Click','Crisp UI mouse click, single, dry'],
    ['Footsteps','Footsteps on a wooden floor, steady walking pace, indoor'],
    ['Crowd','Stadium crowd cheering and applauding, big room'],
    ['Rain','Gentle rain on a window, calm ambience, seamless loop'],
    ['Jungle','Tropical jungle ambience, birds and insects, distant water, seamless loop'],
    ['Splash','Small object splashing into water, close up'],
    ['Typing','Fast keyboard typing on a mechanical keyboard, close mic']
  ]};
function voiceTab(t){V.tab=t;renderVoice()}

async function voiceLoad(){
  const [p,g,pr]=await Promise.all([
    sb.from('voice_presets').select('*').order('position').order('created_at'),
    sb.from('voice_generations').select('*').order('created_at',{ascending:false}).limit(40),
    sb.from('profiles').select('id,name')
  ]);
  if(p.error)throw p.error;if(g.error)throw g.error;
  V.presets=p.data||[];V.gens=g.data||[];V.people=Object.fromEntries((pr.data||[]).map(x=>[x.id,x.name]));
  if(!V.sel&&V.presets.length)voicePick(V.presets[0].id,true);
  V.loaded=true;
  await voiceSignUrls();
}
async function voiceSignUrls(){
  const need=V.gens.map(g=>g.audio_path).filter(p=>p&&!V.urls[p]);
  if(!need.length)return;
  const {data}=await sb.storage.from('voice-audio').createSignedUrls(need,60*60*6);
  (data||[]).forEach(d=>{if(d.signedUrl)V.urls[d.path]=d.signedUrl});
}
async function voiceStatus(){
  const {data,error}=await sb.functions.invoke('voice-studio',{body:{action:'status'}});
  V.status=error?{error:await fnErr(error,data)}:data;
  const el=$('#v-acct');if(el)el.innerHTML=voiceAcctHtml();
}
async function fnErr(error,data){
  if(data?.error)return data.error;
  try{const j=await error.context?.json?.();if(j?.error)return j.error}catch(e){}
  return error?.message||'Something went wrong';
}

function voiceCur(){
  if(V.sel==='custom')return {name:V.custom.name||'Custom voice',voice_id:V.custom.id.trim(),voice_name:V.custom.name||null,custom:true};
  return V.presets.find(p=>p.id===V.sel)||null;
}
function voicePick(id,silent){
  V.sel=id;
  const p=V.presets.find(x=>x.id===id);
  if(p){V.model=p.model_id||'eleven_v4';V.set={stability:+p.stability,similarity_boost:+p.similarity_boost,style:+p.style,speed:+p.speed,use_speaker_boost:p.speaker_boost!==false}}
  else if(id==='custom'){V.model='eleven_v4';V.set={stability:.5,similarity_boost:.75,style:0,speed:1,use_speaker_boost:true}}
  if(!silent)renderVoice();
}

function renderVoice(){
  const v=$('#view');
  if(!V.loaded){
    v.innerHTML=head('Voice & Audio','Voiceovers, background music and sound effects with ElevenLabs.')+`<div class="glass card empty"><div class="spin" style="margin:0 auto 10px"></div>Loading voices…</div>`;
    voiceLoad().then(()=>{if(location.hash.startsWith('#/voice'))renderVoice()}).catch(e=>v.innerHTML=errorBox(e.message));
    if(!V.status)voiceStatus();
    return;
  }
  if(!V.status)voiceStatus();
  const cur=voiceCur();
  const model=VOICE_MODELS.find(m=>m.id===V.model)||{id:V.model,name:V.model,hint:''};
  const extraModels=(V.status?.models||[]).filter(m=>!VOICE_MODELS.some(x=>x.id===m.id));
  const presetTiles=V.presets.map(p=>`<button class="v-tile ${V.sel===p.id?'on':''}" onclick="voicePick('${p.id}')">
      <span class="v-av">${esc((p.name||'?')[0])}</span><span class="v-tile-t"><b>${esc(p.name)}</b><small>${esc(p.channel||'')}${p.channel&&p.voice_name?' · ':''}${esc(p.voice_name||'')}</small></span></button>`).join('');
  const sl=(k,label,min,max,step,fmt)=>`<label class="v-sl"><span>${label} <b id="v-${k}-o">${fmt(V.set[k])}</b></span><input type="range" min="${min}" max="${max}" step="${step}" value="${V.set[k]}" oninput="V.set.${k}=+this.value;$('#v-${k}-o').textContent=(${fmt.toString()})(+this.value)"></label>`;
  const pct=x=>Math.round(x*100)+'%';
  const tabs=`<div class="v-tabs" role="tablist">${[['voice','ti-microphone-2','Voice'],['music','ti-music','Music'],['sfx','ti-wave-sine','Sound effects']].map(([k,i,t])=>`<button role="tab" class="v-tabb ${V.tab===k?'on':''}" onclick="voiceTab('${k}')"><i class="ti ${i}"></i>${t}</button>`).join('')}</div>`;
  const voiceLeft=`
      <div class="glass card">
        <div class="card-h"><h2>1 · Voice</h2><span class="sub">${V.presets.length} channel voices</span></div>
        <div class="v-tiles">${presetTiles}
          <button class="v-tile ${V.sel==='custom'?'on':''}" onclick="voicePick('custom')"><span class="v-av v-av-c"><i class="ti ti-id"></i></span><span class="v-tile-t"><b>Any voice ID</b><small>Paste an ElevenLabs voice ID</small></span></button>
        </div>
        ${V.sel==='custom'?`<div class="v-custom">
          <div class="v-idrow"><input class="inp" id="v-cid" placeholder="e.g. gH9XUvPoLVtz76DeRle8" value="${esc(V.custom.id)}" oninput="V.custom.id=this.value;V.custom.checked=null;V.custom.name='';$('#v-cmsg').innerHTML=''">
          <button class="btn btn-ghost" onclick="voiceCheck()"><i class="ti ti-search"></i>Check</button>
          <button class="btn btn-ghost" onclick="voiceSearchDlg()" title="Search ElevenLabs voices"><i class="ti ti-list-search"></i>Browse</button></div>
          <div id="v-cmsg" class="hint">${voiceCustomMsg()}</div></div>`:''}
        ${cur&&!cur.custom&&cur.note?`<p class="hint v-note"><i class="ti ti-info-circle"></i> ${esc(cur.note)}</p>`:''}
      </div>

      <div class="glass card">
        <div class="card-h"><h2>2 · Script</h2><span class="sub" id="v-count">${V.text.length.toLocaleString()} characters</span></div>
        <textarea class="inp v-text" id="v-text" placeholder="Write or paste the voiceover here…" oninput="V.text=this.value;$('#v-count').textContent=this.value.length.toLocaleString()+' characters'">${esc(V.text)}</textarea>
        <p class="hint" style="margin-top:8px">${esc(model.hint||'')}</p>
      </div>

      <div class="glass card">
        <div class="card-h"><h2>3 · Model & settings</h2>${isOwner()&&cur?`<button class="btn btn-ghost btn-sm" onclick="voicePresetDlg(${cur.custom?'null':`'${cur.id}'`},true)"><i class="ti ti-device-floppy"></i>${cur.custom?'Save as preset':'Save to preset'}</button>`:''}</div>
        <label class="fld"><span>Model</span><select class="inp" onchange="V.model=this.value;renderVoice()">${[...VOICE_MODELS,...extraModels].map(m=>`<option value="${esc(m.id)}" ${m.id===V.model?'selected':''}>${esc(m.name)}${m.id==='eleven_v4'?' (default)':''}</option>`).join('')}</select></label>
        <div class="v-sls">
          ${sl('stability','Stability',0,1,.01,pct)}
          ${sl('similarity_boost','Similarity',0,1,.01,pct)}
          ${sl('style','Style exaggeration',0,1,.01,pct)}
          ${sl('speed','Speed',.7,1.2,.01,x=>(+x).toFixed(2)+'×')}
        </div>
        <label class="v-chk"><input type="checkbox" ${V.set.use_speaker_boost?'checked':''} onchange="V.set.use_speaker_boost=this.checked"> Speaker boost</label>
      </div>

      <div class="glass card v-go">
        <button class="btn btn-primary v-gobtn" id="v-go" onclick="voiceGenerate()" ${V.busy?'disabled':''}>${V.busy?'<span class="spin sm"></span>Generating…':'<i class="ti ti-player-play"></i>Generate voice'}</button>
        <div id="v-result">${V.last?voiceResultHtml(V.last):`<p class="hint">The MP3 shows up here and in History. Each character uses ElevenLabs credits.</p>`}</div>
      </div>
  `;
  const left=V.tab==='music'?audioMusicHtml():V.tab==='sfx'?audioSfxHtml():voiceLeft;
  const gens=V.histKind==='all'?V.gens:V.gens.filter(g=>(g.kind||'voice')===V.histKind);
  v.innerHTML=head('Voice & Audio','Voiceovers, background music and sound effects with ElevenLabs.')+tabs+`
  <div class="row r-2-1 v-grid">
    <div class="stack">${left}</div>
    <div class="stack">
      <div class="glass card" id="v-acct">${voiceAcctHtml()}</div>
      ${isOwner()&&V.tab==='voice'?`<div class="glass card"><div class="card-h"><h2>Channel voices</h2><button class="btn btn-ghost btn-sm" onclick="voicePresetDlg(null)"><i class="ti ti-plus"></i>Add</button></div>
        <div class="list">${V.presets.map(p=>`<div class="li v-li"><span class="li-ic in"><i class="ti ti-microphone-2"></i></span><div style="min-width:0"><div class="li-t">${esc(p.name)}</div><div class="li-s">${esc(p.voice_id)} · ${esc(p.model_id)}</div></div><button class="icon-btn" title="Edit" onclick="voicePresetDlg('${p.id}')"><i class="ti ti-pencil"></i></button></div>`).join('')||'<p class="hint">No presets yet.</p>'}</div></div>`:''}
      <div class="glass card"><div class="card-h"><h2>History</h2><span class="sub">${gens.length} recent</span></div>
        <div class="v-hf">${[['all','All'],['voice','Voice'],['music','Music'],['sfx','SFX']].map(([k,t])=>`<button class="v-chip ${V.histKind===k?'on':''}" onclick="V.histKind='${k}';renderVoice()">${t}</button>`).join('')}</div>
        <div class="v-hist">${gens.map(voiceGenHtml).join('')||`<div class="empty"><i class="ti ti-waveform"></i><b>Nothing yet</b>Everything the team generates shows up here.</div>`}</div></div>
    </div>
  </div>`;
}
function voiceCustomMsg(){
  const c=V.custom.checked;
  if(!c)return 'Paste a voice ID from ElevenLabs (Voices → ⋯ → Copy voice ID). Check is optional.';
  if(c.found)return `<span class="pill"><i class="ti ti-check"></i>${esc(c.name)}</span> ${c.library?'<span class="pill grey">Voice library</span>':''} ${c.preview_url?`<audio controls preload="none" src="${esc(c.preview_url)}" class="v-prev"></audio>`:''}`;
  return `<span class="pill sun">${esc(c.error||'Could not check this ID')}</span> You can still try to generate with it.`;
}
async function voiceCheck(){
  const id=V.custom.id.trim();if(!id){toast('Paste a voice ID first');return}
  $('#v-cmsg').innerHTML='<span class="spin sm"></span> Checking…';
  const {data,error}=await sb.functions.invoke('voice-studio',{body:{action:'voice',voice_id:id}});
  V.custom.checked=error?{found:false,error:await fnErr(error,data)}:data;
  if(data?.found)V.custom.name=data.name;
  $('#v-cmsg').innerHTML=voiceCustomMsg();
}
function voiceAcctHtml(){
  const s=V.status;
  let h=`<div class="card-h"><h2>ElevenLabs account</h2>${isOwner()?`<button class="btn btn-ghost btn-sm" onclick="voiceKeyDlg()"><i class="ti ti-key"></i>API key</button>`:''}</div>`;
  if(!s)return h+`<p class="hint"><span class="spin sm"></span> Checking…</p>`;
  if(s.error)return h+`<p class="v-warn"><i class="ti ti-alert-triangle"></i> ${esc(s.error)}</p>`;
  h+=`<p><span class="pill"><i class="ti ti-lock"></i>Key saved${s.key_end?` · ends …${esc(s.key_end)}`:''}</span></p>`;
  if(s.quota){const q=s.quota,used=+q.used||0,lim=+q.limit||0,left=Math.max(0,lim-used),pc=lim?Math.min(100,used/lim*100):0;
    h+=`<div class="meter-row"><b>${left.toLocaleString()} credits left</b><span class="hint">${esc(q.tier||'')}</span><div class="meter"><span style="width:${pc}%;background:${pc>90?'var(--rose)':pc>70?'var(--sun)':'var(--teal)'}"></span></div></div>
      <p class="hint">${used.toLocaleString()} of ${lim.toLocaleString()} used${q.reset?` · resets ${new Date(q.reset*1000).toLocaleDateString('en-GB',{day:'numeric',month:'short'})}`:''}</p>`}
  else h+=`<p class="hint" style="margin-top:8px">This key can make voices but is not allowed to read the credit balance. Give it the “User: Read” permission in ElevenLabs to see credits here.</p>`;
  return h;
}
function voiceResultHtml(r){
  return `<div class="v-res"><audio controls autoplay src="${esc(r.url)}"></audio>
    <div class="v-res-meta"><span class="pill"><i class="ti ti-check"></i>Done</span><span class="hint">${esc(r.voice)} · ${esc(r.model)}${r.chars?` · ${(+r.chars).toLocaleString()} characters`:''}</span>
    <button class="btn btn-ghost btn-sm" onclick="voiceDownload('${esc(r.path)}','${esc(r.file)}')"><i class="ti ti-download"></i>Download MP3</button></div></div>`;
}
function voiceFileName(g){
  const kind=g.kind||'voice';
  const base=(kind==='voice'?'':kind+'_')+(g.preset_name||g.voice_name||(kind==='music'?'music':kind==='sfx'?'sound':'voice')).replace(/[^A-Za-z0-9]+/g,'_').replace(/^_|_$/g,'');
  const t=new Date(g.created_at||Date.now());const pad=n=>String(n).padStart(2,'0');
  return `${base}_${t.getFullYear()}${pad(t.getMonth()+1)}${pad(t.getDate())}_${pad(t.getHours())}${pad(t.getMinutes())}.mp3`;
}
const AUDIO_KIND={voice:{i:'ti-microphone-2',t:'Voice'},music:{i:'ti-music',t:'Music'},sfx:{i:'ti-wave-sine',t:'Sound effect'}};
function voiceGenHtml(g){
  const url=V.urls[g.audio_path];const mine=g.created_by===user?.id||isOwner();const kind=g.kind||'voice';const K=AUDIO_KIND[kind]||AUDIO_KIND.voice;
  const when=new Date(g.created_at).toLocaleString('en-GB',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit',hour12:false});
  const title=kind==='voice'?(g.preset_name||g.voice_name||g.voice_id):(g.preset_name||K.t);
  const tag=kind==='voice'?g.model_id:`${K.t}${g.duration_s?' · '+audioFmtSec(g.duration_s):''}${g.settings?.loop?' · loop':''}`;
  return `<div class="v-gen v-k-${kind}">
    <div class="v-gen-h"><b><i class="ti ${K.i}"></i> ${esc(title)}</b><span class="hint">${esc(when)}${V.people[g.created_by]?` · ${esc(V.people[g.created_by])}`:''}</span></div>
    <p class="v-gen-t" title="${esc(g.text)}">${esc(g.text)}</p>
    ${url?`<audio controls preload="none" src="${esc(url)}"></audio>`:'<p class="hint">Audio link expired, reload the page.</p>'}
    <div class="v-gen-a"><span class="pill grey">${esc(tag)}</span>
      <button class="btn btn-ghost btn-sm" onclick="voiceDownload('${esc(g.audio_path)}','${esc(voiceFileName(g))}')"><i class="ti ti-download"></i>MP3</button>
      <button class="btn btn-ghost btn-sm" onclick="voiceReuse('${g.id}')" title="Put this back in the editor"><i class="ti ti-arrow-back-up"></i>Reuse</button>
      ${mine?`<button class="icon-btn" title="Delete" onclick="voiceDelete('${g.id}')"><i class="ti ti-trash"></i></button>`:''}</div>
  </div>`;
}
async function voiceDownload(path,file){
  const {data,error}=await sb.storage.from('voice-audio').createSignedUrl(path,600,{download:file||true});
  if(error){toast(error.message);return}
  const a=document.createElement('a');a.href=data.signedUrl;a.download=file||'voice.mp3';document.body.append(a);a.click();a.remove();
}
function voiceReuse(id){
  const g=V.gens.find(x=>x.id===id);if(!g)return;
  const kind=g.kind||'voice';
  if(kind!=='voice'){const st=V[kind],s=g.settings||{};st.prompt=g.text;st.label=g.preset_name||'';
    if(kind==='music'){st.seconds=+s.seconds||30;st.instrumental=s.instrumental!==false}
    else{st.seconds=s.seconds==null?null:+s.seconds;st.influence=s.prompt_influence==null?.3:+s.prompt_influence;st.loop=!!s.loop}
    V.tab=kind;renderVoice();window.scrollTo({top:0,behavior:'smooth'});return}
  V.tab='voice';
  const p=V.presets.find(x=>x.voice_id===g.voice_id&&x.name===g.preset_name);
  if(p)voicePick(p.id,true);else{V.sel='custom';V.custom={id:g.voice_id,name:g.voice_name||'',checked:null}}
  V.model=g.model_id;if(g.settings){const s=g.settings;V.set={stability:+s.stability,similarity_boost:+s.similarity_boost,style:+s.style,speed:+s.speed,use_speaker_boost:s.use_speaker_boost!==false}}
  V.text=g.text;renderVoice();window.scrollTo({top:0,behavior:'smooth'});
}
async function voiceDelete(id){
  if(!await confirmDialog('Delete this audio?','It is removed from History for everyone. Download it first if you need it.','Delete'))return;
  const {error}=await sb.from('voice_generations').delete().eq('id',id);
  if(error){toast(error.message);return}
  V.gens=V.gens.filter(g=>g.id!==id);toast('Deleted');renderVoice();
}
async function voiceGenerate(){
  if(V.busy)return;
  const cur=voiceCur();
  if(!cur||!cur.voice_id){toast(V.sel==='custom'?'Paste a voice ID first':'Pick a voice first');return}
  const text=V.text.trim();if(!text){toast('Write the script first');$('#v-text')?.focus();return}
  if(text.length>20000){toast('Keep it under 20,000 characters');return}
  V.busy=true;const btn=$('#v-go');if(btn){btn.disabled=true;btn.innerHTML='<span class="spin sm"></span>Generating…'}
  const t0=Date.now();
  try{
    const {data,error}=await sb.functions.invoke('voice-studio',{body:{action:'generate',voice_id:cur.voice_id,voice_name:cur.voice_name||cur.name,preset_name:cur.custom?null:cur.name,model_id:V.model,text,voice_settings:V.set}});
    if(error||!data?.ok)throw new Error(await fnErr(error,data));
    const g={id:data.id,created_at:data.created_at,created_by:user.id,preset_name:cur.custom?null:cur.name,voice_id:cur.voice_id,voice_name:cur.voice_name||cur.name,model_id:V.model,text,settings:{...V.set},audio_path:data.path,chars:data.chars};
    V.urls[data.path]=data.url;V.gens.unshift(g);
    V.last={url:data.url,path:data.path,voice:g.voice_name||'Voice',model:(VOICE_MODELS.find(m=>m.id===V.model)||{name:V.model}).name,chars:data.chars,file:voiceFileName(g)};
    toast(`Voice ready in ${Math.round((Date.now()-t0)/1000)}s`);
    if(V.status?.quota)voiceStatus();
  }catch(e){toast(e.message);V.last=null;V.busy=false;renderVoice();const r=$('#v-result');if(r)r.innerHTML=`<p class="v-warn"><i class="ti ti-alert-triangle"></i> ${esc(e.message)}</p>`;return}
  V.busy=false;renderVoice();
}
function voiceKeyDlg(){
  dialog(`<form><h2>ElevenLabs API key</h2><p class="dlg-sub">Stored on the server only. The website and team members never see it.</p>
    <label class="fld"><span>New API key</span><input class="inp" id="k" type="password" autocomplete="off" placeholder="sk_…" required></label>
    <p class="hint">The key needs Text to Speech. Add “Voices: Read” to check and browse voice IDs, and “User: Read” to show credits.</p>
    <p class="err" role="alert"></p><footer><button type="button" class="btn btn-ghost" data-close>Cancel</button><button class="btn btn-primary" type="submit">Save key</button></footer></form>`,d=>{
    d.querySelector('form').onsubmit=async e=>{e.preventDefault();const b=d.querySelector('[type=submit]');b.disabled=true;
      const {data,error}=await sb.functions.invoke('voice-studio',{body:{action:'set_key',key:d.querySelector('#k').value.trim()}});
      if(error||!data?.ok){d.querySelector('.err').textContent=await fnErr(error,data);b.disabled=false;return}
      d.close();toast('API key saved');V.status=null;voiceStatus()};
  });
}
function voicePresetDlg(id,fromEditor){
  const p=id?V.presets.find(x=>x.id===id):null;const cur=voiceCur();
  const src=fromEditor?{...(p||{}),voice_id:cur?.voice_id||p?.voice_id||'',voice_name:cur?.voice_name||p?.voice_name||'',model_id:V.model,stability:V.set.stability,similarity_boost:V.set.similarity_boost,style:V.set.style,speed:V.set.speed,speaker_boost:V.set.use_speaker_boost}:(p||{model_id:'eleven_v4',stability:.5,similarity_boost:.75,style:0,speed:1,speaker_boost:true});
  dialog(`<form><h2>${p?'Edit voice':'Add channel voice'}</h2><p class="dlg-sub">${fromEditor?'Saves the current voice, model and settings.':'A voice the team can pick with one click.'}</p>
    <div class="grid2">
      <label class="fld"><span>Name</span><input class="inp" name="name" required value="${esc(src.name||'')}" placeholder="OddlyTold narrator"></label>
      <label class="fld"><span>Channel</span><input class="inp" name="channel" value="${esc(src.channel||'')}" placeholder="OddlyTold"></label>
      <label class="fld"><span>Voice ID</span><input class="inp" name="voice_id" required value="${esc(src.voice_id||'')}"></label>
      <label class="fld"><span>Voice name</span><input class="inp" name="voice_name" value="${esc(src.voice_name||'')}" placeholder="Asher"></label>
      <label class="fld"><span>Model</span><select class="inp" name="model_id">${VOICE_MODELS.map(m=>`<option value="${m.id}" ${m.id===src.model_id?'selected':''}>${m.name}</option>`).join('')}</select></label>
      <label class="fld"><span>Speed</span><input class="inp" name="speed" type="number" min="0.7" max="1.2" step="0.01" value="${+src.speed}"></label>
      <label class="fld"><span>Stability (0–1)</span><input class="inp" name="stability" type="number" min="0" max="1" step="0.01" value="${+src.stability}"></label>
      <label class="fld"><span>Similarity (0–1)</span><input class="inp" name="similarity_boost" type="number" min="0" max="1" step="0.01" value="${+src.similarity_boost}"></label>
      <label class="fld"><span>Style (0–1)</span><input class="inp" name="style" type="number" min="0" max="1" step="0.01" value="${+src.style}"></label>
      <label class="fld"><span>Speaker boost</span><select class="inp" name="speaker_boost"><option value="1" ${src.speaker_boost!==false?'selected':''}>On</option><option value="0" ${src.speaker_boost===false?'selected':''}>Off</option></select></label>
      <label class="fld full"><span>Note for the team</span><input class="inp" name="note" value="${esc(src.note||'')}" placeholder="How this voice should be used"></label>
    </div><p class="err" role="alert"></p>
    <footer>${p?'<button type="button" class="btn btn-ghost" id="del" style="margin-right:auto;color:var(--rose)">Delete</button>':''}<button type="button" class="btn btn-ghost" data-close>Cancel</button><button class="btn btn-primary" type="submit">${p?'Save':'Add voice'}</button></footer></form>`,d=>{
    const f=d.querySelector('form');
    f.onsubmit=async e=>{e.preventDefault();const x=Object.fromEntries(new FormData(f));
      const row={name:x.name.trim(),channel:x.channel.trim()||null,voice_id:x.voice_id.trim().replace(/[^A-Za-z0-9]/g,''),voice_name:x.voice_name.trim()||null,model_id:x.model_id,
        stability:+x.stability,similarity_boost:+x.similarity_boost,style:+x.style,speed:+x.speed,speaker_boost:x.speaker_boost==='1',note:x.note.trim()||null};
      if(!row.voice_id){d.querySelector('.err').textContent='Voice ID is required';return}
      const q=p?sb.from('voice_presets').update(row).eq('id',p.id).select().single():sb.from('voice_presets').insert({...row,position:(Math.max(0,...V.presets.map(v=>v.position||0))+1)}).select().single();
      const {data,error}=await q;if(error){d.querySelector('.err').textContent=error.message;return}
      d.close();toast(p?'Voice saved':'Voice added');
      if(p)V.presets=V.presets.map(v=>v.id===p.id?data:v);else V.presets.push(data);
      if(fromEditor||!p)voicePick(data.id,true);else if(V.sel===p.id)voicePick(p.id,true);
      renderVoice()};
    d.querySelector('#del')?.addEventListener('click',async()=>{d.close();if(!await confirmDialog('Delete this voice preset?','Old voices in History stay.','Delete'))return;
      const {error}=await sb.from('voice_presets').delete().eq('id',p.id);if(error){toast(error.message);return}
      V.presets=V.presets.filter(v=>v.id!==p.id);if(V.sel===p.id)V.sel=V.presets[0]?.id||'custom';renderVoice()});
  });
}
function voiceSearchDlg(){
  const d=dialog(`<div class="dlg-body"><h2>Find a voice</h2><p class="dlg-sub">Your ElevenLabs voices and the public voice library.</p>
    <form class="v-idrow" id="vs-f"><input class="inp" id="vs-q" placeholder="Name or style, e.g. Asher, deep narrator, British" autofocus><button class="btn btn-primary" type="submit"><i class="ti ti-search"></i>Search</button></form>
    <div id="vs-r" class="v-sr"><p class="hint">Leave empty and search to list the voices in your account.</p></div>
    <footer><button class="btn btn-ghost" data-close>Close</button></footer></div>`);
  d.querySelector('#vs-f').onsubmit=async e=>{e.preventDefault();const r=d.querySelector('#vs-r');r.innerHTML='<p class="hint"><span class="spin sm"></span> Searching…</p>';
    const {data,error}=await sb.functions.invoke('voice-studio',{body:{action:'search',q:d.querySelector('#vs-q').value.trim()}});
    if(error){r.innerHTML=`<p class="v-warn">${esc(await fnErr(error,data))}</p>`;return}
    const list=data.voices||[];
    if(!list.length){r.innerHTML='<p class="hint">Nothing found. If you expected results, the API key may need the “Voices: Read” permission.</p>';return}
    r.innerHTML=list.map((x,i)=>`<div class="v-sri"><div style="min-width:0"><b>${esc(x.name)}</b> ${x.mine?'<span class="pill">Mine</span>':'<span class="pill grey">Library</span>'}<div class="li-s">${esc([x.labels?.gender,x.labels?.age,x.labels?.accent,x.labels?.use_case].filter(Boolean).join(' · '))}</div>
      ${x.preview_url?`<audio controls preload="none" src="${esc(x.preview_url)}"></audio>`:''}</div><button class="btn btn-ghost btn-sm" data-i="${i}">Use</button></div>`).join('');
    r.querySelectorAll('[data-i]').forEach(b=>b.onclick=()=>{const x=list[+b.dataset.i];V.sel='custom';V.custom={id:x.voice_id,name:x.name,checked:{found:true,name:x.name,preview_url:x.preview_url,library:!x.mine}};d.close();renderVoice()});
  };
}

/* ---------- Music & sound effects ---------- */
function audioIdeas(kind){
  return `<div class="v-ideas">${AUDIO_IDEAS[kind].map(([t,p],i)=>`<button class="v-chip" onclick="audioIdea('${kind}',${i})" title="${esc(p)}">${esc(t)}</button>`).join('')}</div>`;
}
function audioIdea(kind,i){const [t,p]=AUDIO_IDEAS[kind][i];V[kind].prompt=p;V[kind].label=t;if(kind==='sfx')V.sfx.loop=/seamless loop/i.test(p);renderVoice()}
function audioFmtSec(s){s=+s;if(s<60)return (s%1?s.toFixed(1):s)+' s';const m=Math.floor(s/60),r=Math.round(s%60);return `${m}:${String(r).padStart(2,'0')}`}
function audioMusicHtml(){
  const M=V.music;
  return `<div class="glass card">
      <div class="card-h"><h2>Background music</h2><span class="sub">Eleven Music</span></div>
      <p class="hint" style="margin:-4px 0 10px">Describe the mood, instruments, tempo and where it is used. Pick an idea to start from.</p>
      ${audioIdeas('music')}
      <textarea class="inp v-text v-text-s" placeholder="e.g. Calm curious documentary underscore, soft piano and plucked strings, 90 BPM, no vocals" oninput="V.music.prompt=this.value">${esc(M.prompt)}</textarea>
      <div class="grid2 v-opts">
        <label class="v-sl"><span>Length <b id="m-len">${audioFmtSec(M.seconds)}</b></span><input type="range" min="10" max="300" step="5" value="${M.seconds}" oninput="V.music.seconds=+this.value;$('#m-len').textContent=audioFmtSec(this.value)"></label>
        <label class="fld"><span>Name (optional)</span><input class="inp" value="${esc(M.label)}" placeholder="OddlyTold bed" oninput="V.music.label=this.value"></label>
      </div>
      <label class="v-chk"><input type="checkbox" ${M.instrumental?'checked':''} onchange="V.music.instrumental=this.checked"> Instrumental only (no singing) — best under a voiceover</label>
    </div>
    <div class="glass card v-go">
      <button class="btn btn-primary v-gobtn" id="a-go" onclick="audioGenerate('music')" ${M.busy?'disabled':''}>${M.busy?'<span class="spin sm"></span>Composing… (can take a minute)':'<i class="ti ti-music"></i>Generate music'}</button>
      <div id="a-result">${M.last?voiceResultHtml(M.last):`<p class="hint">Longer tracks take longer and use more credits. 30–60 s is plenty for a Short.</p>`}</div>
    </div>`;
}
function audioSfxHtml(){
  const S=V.sfx;const auto=S.seconds===null;
  return `<div class="glass card">
      <div class="card-h"><h2>Sound effect</h2><span class="sub">ElevenLabs SFX v2</span></div>
      <p class="hint" style="margin:-4px 0 10px">Say what makes the sound, the action, the material and the space. Ambiences can loop.</p>
      ${audioIdeas('sfx')}
      <textarea class="inp v-text v-text-s" placeholder="e.g. Heavy wooden door creaks open slowly, then slams shut, indoor reverb" oninput="V.sfx.prompt=this.value">${esc(S.prompt)}</textarea>
      <div class="grid2 v-opts">
        <label class="v-sl"><span>Length <b id="s-len">${auto?'Auto':audioFmtSec(S.seconds)}</b></span>
          <input type="range" min="0" max="30" step="0.5" value="${auto?0:S.seconds}" oninput="const x=+this.value;V.sfx.seconds=x<0.5?null:x;$('#s-len').textContent=x<0.5?'Auto':audioFmtSec(x)">
          <small class="hint">All the way left = ElevenLabs picks the length</small></label>
        <label class="v-sl"><span>Follow the prompt <b id="s-inf">${Math.round(S.influence*100)}%</b></span>
          <input type="range" min="0" max="1" step="0.05" value="${S.influence}" oninput="V.sfx.influence=+this.value;$('#s-inf').textContent=Math.round(this.value*100)+'%'">
          <small class="hint">Higher = closer to your words, lower = more creative</small></label>
        <label class="fld"><span>Name (optional)</span><input class="inp" value="${esc(S.label)}" placeholder="Whoosh 1" oninput="V.sfx.label=this.value"></label>
      </div>
      <label class="v-chk"><input type="checkbox" ${S.loop?'checked':''} onchange="V.sfx.loop=this.checked"> Seamless loop (for ambience and background beds)</label>
    </div>
    <div class="glass card v-go">
      <button class="btn btn-primary v-gobtn" id="a-go" onclick="audioGenerate('sfx')" ${S.busy?'disabled':''}>${S.busy?'<span class="spin sm"></span>Generating…':'<i class="ti ti-wave-sine"></i>Generate sound effect'}</button>
      <div id="a-result">${S.last?voiceResultHtml(S.last):`<p class="hint">Each sound effect is saved to History, so you can grab it again later.</p>`}</div>
    </div>`;
}
async function audioGenerate(kind){
  const st=V[kind];if(st.busy)return;
  const prompt=st.prompt.trim();if(!prompt){toast(kind==='music'?'Describe the music first':'Describe the sound first');return}
  st.busy=true;renderVoice();const t0=Date.now();
  try{
    const body=kind==='music'
      ?{action:'music',prompt,seconds:st.seconds,instrumental:st.instrumental,label:st.label.trim()||null}
      :{action:'sfx',prompt,seconds:st.seconds,prompt_influence:st.influence,loop:st.loop,label:st.label.trim()||null};
    const {data,error}=await sb.functions.invoke('voice-studio',{body});
    if(error||!data?.ok)throw new Error(await fnErr(error,data));
    const g={id:data.id,kind,created_at:data.created_at,created_by:user.id,preset_name:body.label,voice_id:null,voice_name:null,model_id:data.model_id,text:prompt,settings:data.settings,audio_path:data.path,chars:prompt.length,duration_s:data.settings?.seconds??null};
    V.urls[data.path]=data.url;V.gens.unshift(g);
    st.last={url:data.url,path:data.path,voice:kind==='music'?'Music':'Sound effect',model:g.duration_s?audioFmtSec(g.duration_s):'auto length',chars:null,file:voiceFileName(g)};
    toast(`${kind==='music'?'Music':'Sound effect'} ready in ${Math.round((Date.now()-t0)/1000)}s`);
  }catch(e){st.busy=false;st.last=null;toast(e.message);renderVoice();const r=$('#a-result');if(r)r.innerHTML=`<p class="v-warn"><i class="ti ti-alert-triangle"></i> ${esc(e.message)}</p>`;return}
  st.busy=false;renderVoice();
}
