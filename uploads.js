'use strict';
/* Video upload board — one tab per channel, a queue of ready videos, and a history.
   Every signed-in team member can see and edit it. */
const UP={channels:[],videos:[],tab:localStorage.getItem('sa-upload-tab')||null,view:'queue',drag:null};

/* ── link helpers ── */
function upHttps(v){try{const u=new URL(String(v||'').trim());return u.protocol==='https:'?u.href:null}catch{return null}}
function driveInfo(v){
  const url=upHttps(v);if(!url)return null;
  let host;try{host=new URL(url).hostname}catch{return null}
  if(!/(^|\.)google\.com$/.test(host))return {url,drive:false};
  const folder=url.match(/\/folders\/([\w-]{10,})/);if(folder)return {url,drive:true,folder:true,id:folder[1]};
  const m=url.match(/\/d\/([\w-]{10,})/)||url.match(/[?&]id=([\w-]{10,})/);
  return m?{url,drive:true,folder:false,id:m[1]}:{url,drive:false};
}
function drivePreview(d){return d?.drive?(d.folder?`https://drive.google.com/embeddedfolderview?id=${d.id}#grid`:`https://drive.google.com/file/d/${d.id}/preview`):null}
function driveDownload(d){return d?.drive&&!d.folder?`https://drive.google.com/uc?export=download&id=${d.id}`:d?.url||null}
function thumbSrc(v){const d=driveInfo(v);if(!d)return null;return d.drive&&!d.folder?`https://drive.google.com/thumbnail?id=${d.id}&sz=w1280`:d.drive?null:d.url}
function thumbDownload(v,name){const d=driveInfo(v);if(!d)return null;if(d.drive)return driveDownload(d);return d.url.includes('/storage/v1/object/public/')?`${d.url}?download=${encodeURIComponent(name||'thumbnail')}`:d.url}
function ytLink(v){const u=upHttps(v);if(!u)return null;const h=new URL(u).hostname;return ['youtube.com','www.youtube.com','m.youtube.com','youtu.be','studio.youtube.com'].includes(h)?u:null}
function upCanManage(){return ['owner','manager'].includes(profile?.role)}
function upChannel(){return UP.channels.find(c=>c.id===UP.tab)||UP.channels[0]||null}
function upList(status){const c=upChannel();if(!c)return [];const rows=UP.videos.filter(v=>v.channel_id===c.id&&v.status===status);return status==='ready'?rows.sort((a,b)=>a.position-b.position||String(a.created_at).localeCompare(String(b.created_at))):rows.sort((a,b)=>String(b.uploaded_at).localeCompare(String(a.uploaded_at)))}
async function upCopy(id,field){const v=UP.videos.find(x=>x.id===id);const text=v?.[field]||'';if(!text){toast('Nothing to copy');return}
  try{await navigator.clipboard.writeText(text)}catch{const t=document.createElement('textarea');t.value=text;document.body.append(t);t.select();document.execCommand('copy');t.remove()}
  toast(field==='title'?'Title copied':'Description copied')}

/* ── load + page ── */
async function renderUploads(){
  const v=$('#view');
  if(!UP.channels.length)v.innerHTML=head('Video upload','Finished videos for each channel, in the order they go up.')+'<div class="glass card empty"><div class="spin" style="margin:auto"></div></div>';
  const [ch,vid]=await Promise.all([sb.from('upload_channels').select('*').order('position'),sb.from('upload_videos').select('*').order('position')]);
  const err=[ch,vid].find(r=>r.error);if(err){v.innerHTML=head('Video upload')+errorBox(err.error.message);return}
  UP.channels=ch.data||[];UP.videos=vid.data||[];
  if(!UP.channels.some(c=>c.id===UP.tab))UP.tab=UP.channels[0]?.id||null;
  drawUploads();
}
function drawUploads(){
  const c=upChannel(),v=$('#view');
  const count=(id,s)=>UP.videos.filter(x=>x.channel_id===id&&x.status===s).length;
  const tabs=UP.channels.map(ch=>`<button class="up-tab ${ch.id===c?.id?'on':''}" onclick="upSelect('${ch.id}')">${ch.photo_url?`<img src="${esc(ch.photo_url)}" alt="">`:`<span class="up-dot" style="background:${esc(ch.color||'#0E7C74')}">${esc(ch.name[0]||'?')}</span>`}<span>${esc(ch.name)}</span><b>${count(ch.id,'ready')}</b></button>`).join('');
  if(!c){v.innerHTML=head('Video upload','Finished videos for each channel, in the order they go up.')+`<div class="glass card empty"><i class="ti ti-brand-youtube"></i><b>No channels yet</b>Add a channel to start lining up videos.<div style="margin-top:14px"><button class="btn btn-primary" onclick="upEditChannel()"><i class="ti ti-plus"></i>Add channel</button></div></div>`;return}
  const ready=upList('ready'),done=upList('uploaded');
  v.innerHTML=head('Video upload','Finished videos for each channel, in the order they go up.',`<button class="btn btn-ghost" onclick="renderUploads()"><i class="ti ti-refresh"></i>Refresh</button><button class="btn btn-primary" onclick="upEditVideo()"><i class="ti ti-plus"></i>Add video</button>`)+
  `<div class="up-tabs">${tabs}<button class="up-tab add" onclick="upEditChannel()" title="Add channel"><i class="ti ti-plus"></i><span>Add channel</span></button></div>
  <div class="up-bar">
    <div class="seg">${[['queue',`To upload (${ready.length})`],['history',`History (${done.length})`]].map(([k,l])=>`<button class="${UP.view===k?'on':''}" onclick="UP.view='${k}';drawUploads()">${l}</button>`).join('')}</div>
    <div class="up-chan"><span class="pill ${c.format==='short'?'sun':''}">${c.format==='short'?'Shorts channel':'Long videos'}</span>${ytLink(c.youtube_url)?`<a class="btn btn-ghost btn-sm" href="${esc(ytLink(c.youtube_url))}" target="_blank" rel="noopener noreferrer"><i class="ti ti-external-link"></i>Open channel</a>`:''}
      <details class="menu"><summary class="icon-btn" aria-label="Channel options"><i class="ti ti-dots"></i></summary><div class="menu-pop"><button onclick="upEditChannel('${c.id}')">Edit channel</button>${upCanManage()?`<button class="danger" onclick="upDeleteChannel('${c.id}')">Delete channel</button>`:''}</div></details></div>
  </div>
  ${UP.view==='queue'?(ready.length?`<div id="up-list" class="up-grid ${c.format==='short'?'short':''}">${ready.map((x,i)=>upCard(x,i,c)).join('')}</div>`:upEmpty(c)):(done.length?`<div class="up-grid ${c.format==='short'?'short':''}">${done.map(x=>upHistoryRow(x,c)).join('')}</div>`:'<div class="glass card empty"><i class="ti ti-history"></i><b>Nothing uploaded yet</b>Videos you mark as uploaded show up here.</div>')}`;
  if(UP.view==='queue')upBindDrag();
}
function upEmpty(c){return `<div class="glass card empty"><i class="ti ti-cloud-upload"></i><b>No videos waiting for ${esc(c.name)}</b>Add a finished video with its Drive link, title and description.<div style="margin-top:14px"><button class="btn btn-primary" onclick="upEditVideo()"><i class="ti ti-plus"></i>Add video</button></div></div>`}
function upSelect(id){UP.tab=id;localStorage.setItem('sa-upload-tab',id);UP.view='queue';drawUploads()}

/* ── tiles (small cards) + detail view ── */
function upPoster(x,c){
  // The thumbnail if there is one; otherwise Google Drive's own preview frame of the video.
  const t=c.format==='short'?null:thumbSrc(x.thumbnail_url);if(t)return t;
  const d=driveInfo(x.drive_url);return d?.drive&&!d.folder?`https://drive.google.com/thumbnail?id=${d.id}&sz=w640`:null;
}
function upCard(x,i,c){
  const first=i===0,short=c.format==='short',poster=upPoster(x,c),noThumb=!short&&!thumbSrc(x.thumbnail_url);
  return `<article class="glass up-tile ${first?'first':''} ${short?'short':''}" data-id="${x.id}" tabindex="0" role="button" aria-label="Open ${esc(x.title)}" onclick="upDetail('${x.id}')" onkeydown="if(event.key==='Enter')upDetail('${x.id}')">
    <div class="up-poster">${poster?`<img src="${esc(poster)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">`:''}<i class="ti ti-player-play-filled up-poster-ic"></i>
      <span class="up-badge">${i+1}</span>${first?'<span class="up-flag">Next to upload</span>':''}${noThumb?'<span class="up-warn">No thumbnail yet</span>':''}</div>
    <div class="up-tile-body"><h3>${esc(x.title)}</h3>
      <div class="up-tile-foot" onclick="event.stopPropagation()"><span class="up-grip" title="Drag to change the order"><i class="ti ti-grip-vertical"></i></span>
        <button class="btn btn-primary btn-sm" onclick="upMarkUploaded('${x.id}')"><i class="ti ti-check"></i>Mark uploaded</button>
        <details class="menu"><summary class="icon-btn" aria-label="Options"><i class="ti ti-dots"></i></summary><div class="menu-pop"><button onclick="upDetail('${x.id}')">Open details</button><button onclick="upEditVideo('${x.id}')">Edit</button><button onclick="upMove('${x.id}',-1)">Move earlier</button><button onclick="upMove('${x.id}',1)">Move later</button><button class="danger" onclick="upDeleteVideo('${x.id}')">Delete</button></div></details></div></div></article>`;
}
function upHistoryRow(x,c){
  const poster=upPoster(x,c),yt=ytLink(x.youtube_url);
  return `<article class="glass up-tile done ${c.format==='short'?'short':''}" tabindex="0" role="button" aria-label="Open ${esc(x.title)}" onclick="upDetail('${x.id}')" onkeydown="if(event.key==='Enter')upDetail('${x.id}')">
    <div class="up-poster">${poster?`<img src="${esc(poster)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">`:''}<i class="ti ti-player-play-filled up-poster-ic"></i><span class="up-badge ok"><i class="ti ti-check"></i></span></div>
    <div class="up-tile-body"><h3>${esc(x.title)}</h3><small>Uploaded ${x.uploaded_at?new Date(x.uploaded_at).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'}):''}</small>
      <div class="up-tile-foot" onclick="event.stopPropagation()">${yt?`<a class="btn btn-ghost btn-sm" href="${esc(yt)}" target="_blank" rel="noopener noreferrer"><i class="ti ti-brand-youtube"></i>Watch</a>`:'<span></span>'}
        <details class="menu"><summary class="icon-btn" aria-label="Options"><i class="ti ti-dots"></i></summary><div class="menu-pop"><button onclick="upDetail('${x.id}')">Open details</button><button onclick="upEditVideo('${x.id}')">Edit</button><button onclick="upBackToQueue('${x.id}')">Put back in queue</button><button class="danger" onclick="upDeleteVideo('${x.id}')">Delete</button></div></details></div></div></article>`;
}
function upDetail(id){
  const x=UP.videos.find(v=>v.id===id);if(!x)return;
  const c=UP.channels.find(k=>k.id===x.channel_id)||upChannel(),short=c.format==='short',ready=x.status==='ready';
  const d=driveInfo(x.drive_url),pv=drivePreview(d),ts=short?null:thumbSrc(x.thumbnail_url),yt=ytLink(x.youtube_url);
  const pos=ready?upList('ready').findIndex(v=>v.id===id)+1:0;
  const video=`<div class="up-block"><div class="up-label"><span>Video</span>${d?`<a href="${esc(d.url)}" target="_blank" rel="noopener noreferrer">Open in Drive</a>`:''}${d?.drive&&!d.folder?`<a href="${esc(driveDownload(d))}" target="_blank" rel="noopener noreferrer">Download</a>`:''}</div>
    <div class="up-frame ${short?'tall':''}">${pv?`<iframe src="${esc(pv)}" allow="autoplay; fullscreen" allowfullscreen referrerpolicy="no-referrer"></iframe>`:d?`<a class="up-play" href="${esc(d.url)}" target="_blank" rel="noopener noreferrer"><i class="ti ti-external-link"></i><span>Open video link</span></a>`:'<div class="up-missing">No video link yet</div>'}</div></div>`;
  const thumb=short?'':`<div class="up-block"><div class="up-label"><span>Thumbnail</span>${x.thumbnail_url&&upHttps(x.thumbnail_url)?`<a href="${esc(thumbDownload(x.thumbnail_url,x.title+'.png'))}" target="_blank" rel="noopener noreferrer">Download</a>`:''}</div>
    <div class="up-frame">${ts?`<img src="${esc(ts)}" alt="Thumbnail for ${esc(x.title)}" referrerpolicy="no-referrer">`:x.thumbnail_url&&upHttps(x.thumbnail_url)?`<a class="up-play" href="${esc(upHttps(x.thumbnail_url))}" target="_blank" rel="noopener noreferrer"><i class="ti ti-photo"></i><span>Open thumbnail</span></a>`:'<div class="up-missing">No thumbnail yet</div>'}</div></div>`;
  dialog(`<div class="dlg-body up-detail">
    <header class="up-detail-head"><div><div class="up-detail-meta">${esc(c.name)}${ready?` — number ${pos} in the queue`:` — uploaded ${x.uploaded_at?new Date(x.uploaded_at).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'}):''}`}</div><h2>${esc(x.title)}</h2></div><button class="icon-btn" data-close aria-label="Close"><i class="ti ti-x"></i></button></header>
    <div class="up-body ${short?'short':''}">
      <div class="up-media">${video}${thumb}</div>
      <div class="up-text">
        <div class="up-col">
          <div class="up-block"><div class="up-label"><span>Title</span><button onclick="upCopy('${x.id}','title')"><i class="ti ti-copy"></i>Copy</button></div><div class="up-copybox">${esc(x.title)}<small>${[...x.title].length} characters</small></div></div>
          ${x.notes?`<div class="up-block"><div class="up-label"><span>Notes</span></div><div class="up-note">${esc(x.notes)}</div></div>`:''}
        </div>
        <div class="up-block"><div class="up-label"><span>Description</span><button onclick="upCopy('${x.id}','description')"><i class="ti ti-copy"></i>Copy</button></div><div class="up-copybox desc">${x.description?esc(x.description):'<em>No description yet</em>'}</div></div>
      </div>
    </div>
    <footer>${yt?`<a class="btn btn-ghost" href="${esc(yt)}" target="_blank" rel="noopener noreferrer" style="margin-right:auto"><i class="ti ti-brand-youtube"></i>Watch on YouTube</a>`:''}<button class="btn btn-ghost" onclick="upEditVideo('${x.id}')"><i class="ti ti-pencil"></i>Edit</button>${ready?`<button class="btn btn-primary" onclick="upMarkUploaded('${x.id}')"><i class="ti ti-check"></i>Mark uploaded</button>`:`<button class="btn btn-ghost" onclick="upBackToQueue('${x.id}')">Put back in queue</button>`}</footer></div>`,dl=>{
    dl.classList.add('wide');dl.addEventListener('click',e=>{if(e.target===dl)dl.close()});
  });
}
function upCloseDialogs(){document.querySelectorAll('dialog[open]').forEach(d=>d.close())}

/* ── ordering ── */
async function upSaveOrder(ids){
  ids.forEach((id,i)=>{const v=UP.videos.find(x=>x.id===id);if(v)v.position=i+1});drawUploads();
  const res=await Promise.all(ids.map((id,i)=>sb.from('upload_videos').update({position:i+1}).eq('id',id)));
  const err=res.find(r=>r.error);if(err){toast(err.error.message);renderUploads()}
}
function upMove(id,dir){const ids=upList('ready').map(x=>x.id),i=ids.indexOf(id),j=i+dir;if(i<0||j<0||j>=ids.length)return;[ids[i],ids[j]]=[ids[j],ids[i]];upSaveOrder(ids)}
function upBindDrag(){
  const list=$('#up-list');if(!list)return;
  list.querySelectorAll('.up-tile[data-id]').forEach(el=>{
    const grip=el.querySelector('.up-grip');
    if(grip){grip.addEventListener('mousedown',()=>{el.draggable=true});grip.addEventListener('click',e=>e.stopPropagation())}
    el.addEventListener('dragstart',e=>{UP.drag=el.dataset.id;el.classList.add('dragging');e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',el.dataset.id)});
    el.addEventListener('dragend',()=>{UP.drag=null;el.draggable=false;list.querySelectorAll('.dragging,.drop').forEach(n=>n.classList.remove('dragging','drop'))});
    el.addEventListener('dragover',e=>{if(!UP.drag||UP.drag===el.dataset.id)return;e.preventDefault();list.querySelectorAll('.drop').forEach(n=>n.classList.remove('drop'));el.classList.add('drop')});
    el.addEventListener('drop',e=>{e.preventDefault();const from=UP.drag,to=el.dataset.id;if(!from||from===to)return;const ids=upList('ready').map(x=>x.id);const fi=ids.indexOf(from),ti=ids.indexOf(to);ids.splice(fi,1);ids.splice(ti,0,from);upSaveOrder(ids)});
  });
}

/* ── video actions ── */
function upMarkUploaded(id){
  const x=UP.videos.find(v=>v.id===id);if(!x)return;
  dialog(`<form><h2>Mark as uploaded</h2><p class="dlg-sub">${esc(x.title)}</p>
    <label class="fld"><span>YouTube link (optional)</span><input class="inp" name="yt" type="url" placeholder="https://youtu.be/…" value="${esc(x.youtube_url||'')}"><span class="hint">Paste the published video link so it’s easy to find later.</span></label>
    <p class="err" role="alert"></p><footer><button type="button" class="btn btn-ghost" data-close>Cancel</button><button class="btn btn-primary" type="submit"><i class="ti ti-check"></i>Mark uploaded</button></footer></form>`,d=>{
    d.querySelector('form').onsubmit=async e=>{e.preventDefault();const raw=d.querySelector('[name=yt]').value.trim(),yt=raw?ytLink(raw):null,err=d.querySelector('.err');
      if(raw&&!yt){err.textContent='That doesn’t look like a YouTube link.';return}
      const r=await sb.from('upload_videos').update({status:'uploaded',uploaded_at:new Date().toISOString(),uploaded_by:user.id,youtube_url:yt}).eq('id',id).select('id');
      if(r.error){err.textContent=r.error.message;return}upCloseDialogs();toast('Moved to history');renderUploads()};
  });
}
async function upBackToQueue(id){
  const max=Math.max(0,...upList('ready').map(x=>x.position));
  const r=await sb.from('upload_videos').update({status:'ready',uploaded_at:null,uploaded_by:null,position:max+1}).eq('id',id);
  if(r.error){toast(r.error.message);return}upCloseDialogs();toast('Back in the queue');UP.view='queue';renderUploads();
}
async function upDeleteVideo(id){
  const x=UP.videos.find(v=>v.id===id);if(!x)return;
  if(!await confirmDialog('Delete this video entry?',`“${esc(x.title)}” is removed from the board. The file in Google Drive is not touched.`,'Delete entry'))return;
  const r=await sb.from('upload_videos').delete().eq('id',id);if(r.error){toast(r.error.message);return}upCloseDialogs();toast('Entry deleted');renderUploads();
}
function upEditVideo(id){
  const c=upChannel();if(!c){toast('Add a channel first');return}
  const x=id?UP.videos.find(v=>v.id===id):{};if(id&&!x)return;
  const ch=id?UP.channels.find(k=>k.id===x.channel_id)||c:c,short=ch.format==='short';
  let thumbUrl=x.thumbnail_url||'';
  dialog(`<form><h2>${id?'Edit video':'Add video'}</h2><p class="dlg-sub">${esc(ch.name)} — ${short?'Shorts need a video, title and description.':'video, thumbnail, title and description.'}</p>
    <label class="fld"><span>Title</span><input class="inp" name="title" required maxlength="200" value="${esc(x.title||'')}"><span class="hint" id="t-count"></span></label>
    <label class="fld"><span>Google Drive link to the video</span><input class="inp" name="drive_url" type="url" placeholder="https://drive.google.com/file/d/…" value="${esc(x.drive_url||'')}"><span class="hint">Share the file as “Anyone with the link” so the preview plays for the whole team.</span></label>
    ${short?'':`<div class="fld"><span>Thumbnail</span><div class="up-thumb-pick"><div class="up-thumb-prev" id="th-prev">${thumbSrc(thumbUrl)?`<img src="${esc(thumbSrc(thumbUrl))}" alt="" referrerpolicy="no-referrer">`:'<i class="ti ti-photo"></i>'}</div><div style="flex:1;min-width:0"><label class="btn btn-ghost btn-sm">Upload image<input type="file" accept="image/png,image/jpeg,image/webp" hidden id="th-file"></label><input class="inp" name="thumbnail_url" type="url" placeholder="or paste an image / Drive link" value="${esc(thumbUrl)}" style="margin-top:8px"></div></div></div>`}
    <label class="fld"><span>Description</span><textarea class="inp" name="description" rows="7">${esc(x.description||'')}</textarea></label>
    <label class="fld"><span>Notes (optional)</span><input class="inp" name="notes" value="${esc(x.notes||'')}" placeholder="Tags, pinned comment, anything the uploader should know"></label>
    <p class="err" role="alert"></p><footer><button type="button" class="btn btn-ghost" data-close>Cancel</button><button class="btn btn-primary" type="submit">${id?'Save changes':'Add video'}</button></footer></form>`,d=>{
    const f=d.querySelector('form'),err=d.querySelector('.err'),tc=d.querySelector('#t-count');
    const cnt=()=>{const n=[...f.title.value].length;tc.textContent=`${n} characters${n>100?' — YouTube allows 100':''}`};f.title.oninput=cnt;cnt();
    const file=d.querySelector('#th-file');
    if(file)file.onchange=async()=>{const img=file.files[0];if(!img)return;if(img.size>5*1024*1024){err.textContent='Thumbnail must be under 5 MB.';return}
      err.textContent='Uploading thumbnail…';const path=`${ch.id}/${Date.now()}-${img.name.replace(/[^\w.-]+/g,'_').slice(-60)}`;
      const up=await sb.storage.from('upload-thumbnails').upload(path,img,{contentType:img.type,upsert:false});
      if(up.error){err.textContent=up.error.message;return}
      thumbUrl=sb.storage.from('upload-thumbnails').getPublicUrl(path).data.publicUrl;f.thumbnail_url.value=thumbUrl;d.querySelector('#th-prev').innerHTML=`<img src="${esc(thumbUrl)}" alt="">`;err.textContent=''};
    f.onsubmit=async e=>{e.preventDefault();const fd=Object.fromEntries(new FormData(f));
      const drive=fd.drive_url.trim(),th=(fd.thumbnail_url||'').trim();
      if(drive&&!upHttps(drive)){err.textContent='The video link must start with https://';return}
      if(th&&!upHttps(th)){err.textContent='The thumbnail link must start with https://';return}
      const row={title:fd.title.trim(),description:fd.description.trim()||null,drive_url:drive||null,thumbnail_url:short?null:(th||null),notes:fd.notes.trim()||null};
      let r;if(id)r=await sb.from('upload_videos').update(row).eq('id',id).select('id');
      else{const max=Math.max(0,...UP.videos.filter(v=>v.channel_id===ch.id&&v.status==='ready').map(v=>v.position));r=await sb.from('upload_videos').insert({...row,channel_id:ch.id,position:max+1,created_by:user.id}).select('id')}
      if(r.error){err.textContent=r.error.message;return}upCloseDialogs();toast(id?'Changes saved':'Video added to the queue');UP.view=id?UP.view:'queue';renderUploads()};
  });
}

/* ── channel tabs ── */
function upEditChannel(id){
  const c=id?UP.channels.find(x=>x.id===id):{};let photo=c.photo_url||null;
  dialog(`<form><h2>${id?'Edit channel':'Add channel'}</h2><p class="dlg-sub">Each channel gets its own tab and its own queue.</p>
    <div class="photo-pick"><span id="ph">${photo?`<img class="avatar" src="${esc(photo)}" style="width:56px;height:56px">`:`<div class="avatar" style="width:56px;height:56px;background:${esc(c.color||'#0E7C74')}">${esc(c.name?.[0]||'?')}</div>`}</span><label class="btn btn-ghost btn-sm">Choose logo<input type="file" accept="image/*" hidden id="ph-in"></label></div>
    <label class="fld"><span>Channel name</span><input class="inp" name="name" required maxlength="60" value="${esc(c.name||'')}"></label>
    <label class="fld"><span>Type of videos</span><select class="inp" name="format"><option value="long">Long videos (video, thumbnail, title, description)</option><option value="short" ${c.format==='short'?'selected':''}>Shorts (video, title, description)</option></select></label>
    <label class="fld"><span>YouTube channel link (optional)</span><input class="inp" name="youtube_url" type="url" value="${esc(c.youtube_url||'')}" placeholder="https://www.youtube.com/@…"></label>
    <p class="err" role="alert"></p><footer><button type="button" class="btn btn-ghost" data-close>Cancel</button><button class="btn btn-primary" type="submit">${id?'Save channel':'Add channel'}</button></footer></form>`,d=>{
    d.querySelector('#ph-in').onchange=async e=>{const file=e.target.files[0];if(!file)return;const url=await new Promise(r=>{const fr=new FileReader();fr.onload=()=>r(fr.result);fr.readAsDataURL(file)});photo=await resizeImage(url,128);d.querySelector('#ph').innerHTML=`<img class="avatar" src="${photo}" style="width:56px;height:56px">`};
    d.querySelector('form').onsubmit=async e=>{e.preventDefault();const fd=Object.fromEntries(new FormData(e.target)),err=d.querySelector('.err');
      const yt=fd.youtube_url.trim();if(yt&&!ytLink(yt)){err.textContent='That doesn’t look like a YouTube link.';return}
      const row={name:fd.name.trim(),format:fd.format,youtube_url:yt||null,photo_url:photo};
      let r;if(id)r=await sb.from('upload_channels').update(row).eq('id',id).select('id');
      else r=await sb.from('upload_channels').insert({...row,position:Math.max(0,...UP.channels.map(x=>x.position))+1,created_by:user.id}).select('id');
      if(r.error){err.textContent=r.error.message;return}if(!id&&r.data?.[0]){UP.tab=r.data[0].id;localStorage.setItem('sa-upload-tab',UP.tab)}
      d.close();toast(id?'Channel saved':'Channel added');renderUploads()};
  });
}
async function upDeleteChannel(id){
  const c=UP.channels.find(x=>x.id===id);if(!c||!upCanManage())return;
  const n=UP.videos.filter(v=>v.channel_id===id).length;
  if(!await confirmDialog(`Delete the ${esc(c.name)} tab?`,`${n?`Its ${n} video entr${n===1?'y':'ies'} (queue and history) will be deleted too. `:''}Files in Google Drive are not touched. This can’t be undone.`,'Delete channel'))return;
  const r=await sb.from('upload_channels').delete().eq('id',id);if(r.error){toast(r.error.message);return}
  UP.tab=null;localStorage.removeItem('sa-upload-tab');toast('Channel deleted');renderUploads();
}
