'use strict';
const projectDocs=new Map();
let projectDocRange=null;
const docStaff=()=>['owner','manager'].includes(profile?.role);
const docEscape=v=>editorEscape(String(v??''));
function docSafeLink(value){try{const u=new URL(value);return ['https:','http:'].includes(u.protocol)?u.href:null}catch{return null}}
function cleanProjectDocument(html){
 // Preserve safe hyperlinks while using the same formatting rules as Private Notes.
 const t=document.createElement('template');t.innerHTML=html||'';const links=[];
 t.content.querySelectorAll('a').forEach(a=>{const url=docSafeLink(a.getAttribute('href'));const marker='DOC_LINK_'+crypto.randomUUID();links.push({marker,url,text:a.textContent});a.replaceWith(document.createTextNode(marker))});
 t.content.querySelectorAll('font[face]').forEach(n=>{const span=document.createElement('span');span.style.fontFamily=n.getAttribute('face');n.replaceWith(span);span.append(n)});
 let out=cleanOwnerDocument(t.innerHTML);
 for(const l of links)out=out.replace(l.marker,l.url?`<a href="${docEscape(l.url)}" target="_blank" rel="noopener noreferrer">${docEscape(l.text)}</a>`:docEscape(l.text));
 return out;
}
function projectDocState(id){return projectDocs.get(Number(id))}
function docStatus(s,msg){s.status=msg;if(Number(_currentProjId)===s.id){const e=document.getElementById('project-doc-status');if(e)e.textContent=msg}}
async function loadProjectDocument(id){
 id=Number(id);const host=document.getElementById('pdm-tab-script');if(!host)return;
 let s=projectDocs.get(id);
 if(s&&!s.dirty&&!s.saving&&!s.uploading){projectDocs.delete(id);s=null}
 if(!s){host.innerHTML='<p>Loading instructions…</p>';const {data,error}=await sb.from('project_documents').select('*').eq('project_id',id).maybeSingle();if(Number(_currentProjId)!==id)return;if(error){host.innerHTML='<p>Could not load instructions. <button onclick="loadProjectDocument('+id+')">Retry</button></p>';return}
 const p=_currentProjects.find(p=>p.id===id);s={id,html:data?.content??(p?.instructions?'<p>'+docEscape(p.instructions).replaceAll('\n','<br>')+'</p>':''),assets:data?.assets||[],version:data?.version??null,dirty:false,saving:false,conflict:false,status:data?'All changes saved':'Ready',revision:0};projectDocs.set(id,s)}
 if(Number(_currentProjId)!==id)return;
 const staff=docStaff();host.innerHTML=`<div class="project-doc-top"><div><b>Script / Instructions</b><small>${staff?'Write the brief and add reference media. Changes save automatically.':'Project brief · Read only'}</small></div><span id="project-doc-status">${docEscape(s.status)}</span>${staff?'<button onclick="saveProjectDocument('+id+')">Save</button>':''}</div>
 ${staff?`<div class="project-doc-tools" id="project-doc-tools">
 <select title="Paragraph style" onchange="projectDocFormat('formatBlock',this.value)"><option value="p">Normal text</option><option value="h1">Heading 1</option><option value="h2">Heading 2</option><option value="h3">Heading 3</option><option value="blockquote">Quote</option></select>
 <select title="Font" onchange="projectDocFormat('fontName',this.value)"><option>Arial</option><option>Georgia</option><option>Verdana</option><option>Times New Roman</option><option>Courier New</option></select>
 <select title="Font size" onchange="projectDocFormat('fontSize',this.value)"><option value="3">16</option><option value="2">13</option><option value="4">20</option><option value="5">24</option><option value="6">32</option></select>
 ${[['bold','B'],['italic','I'],['underline','U'],['strikeThrough','Strike'],['insertUnorderedList','• List'],['insertOrderedList','1. List'],['justifyLeft','Left'],['justifyCenter','Center'],['justifyRight','Right'],['undo','Undo'],['redo','Redo'],['removeFormat','Clear']].map(([cmd,label])=>`<button type="button" title="${cmd}" onclick="projectDocFormat('${cmd}')">${label}</button>`).join('')}
 <label>Text <input type="color" title="Text color" onchange="projectDocFormat('foreColor',this.value)"></label><label>Highlight <input type="color" value="#fff2a8" title="Highlight color" onchange="projectDocFormat('hiliteColor',this.value)"></label>
 <button onclick="projectDocLink()">Link</button><button onclick="projectDocEmbed()">YouTube / Drive media</button><button onclick="document.getElementById('project-doc-file').click()">Upload original image</button><input id="project-doc-file" type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/avif,image/bmp" hidden multiple>
 </div>`:''}<div class="project-doc-paper"><div id="project-doc-editor" contenteditable="${staff}" data-placeholder="Write your script and editing instructions…">${cleanProjectDocument(s.html)}</div><div id="project-doc-assets"></div></div><p class="project-doc-help">Drive audio and video use the file's sharing permissions. Give your editor access in Google Drive.</p>`;
 const ed=document.getElementById('project-doc-editor');ed.oninput=()=>{s.html=cleanProjectDocument(ed.innerHTML);projectDocChanged(s)};
 ed.onpaste=e=>{if(!staff)return;e.preventDefault();document.execCommand('insertHTML',false,cleanProjectDocument(e.clipboardData.getData('text/html')||docEscape(e.clipboardData.getData('text/plain')).replaceAll('\n','<br>')));s.html=cleanProjectDocument(ed.innerHTML);projectDocChanged(s)};
 ed.ondrop=e=>e.preventDefault();
 host.querySelectorAll('.project-doc-tools button').forEach(b=>b.onmousedown=e=>e.preventDefault());
 const input=document.getElementById('project-doc-file');if(input)input.onchange=()=>uploadProjectImages(s,[...input.files]);
 renderProjectAssets(s);
}
function projectDocChanged(s){if(!docStaff())return;s.dirty=true;s.revision++;docStatus(s,s.conflict?'Conflict — copy your text before reloading.':'Saving…');clearTimeout(s.timer);if(!s.conflict)s.timer=setTimeout(()=>saveProjectDocument(s.id),900)}
async function saveProjectDocument(id){
 const s=projectDocState(id);if(!s||!docStaff()||!s.dirty||s.saving||s.conflict)return;
 s.saving=true;docStatus(s,'Saving…');const revision=s.revision,patch={content:cleanProjectDocument(s.html),assets:JSON.parse(JSON.stringify(s.assets)),version:(s.version||0)+1,updated_at:new Date().toISOString()};
 try{let q=s.version===null?sb.from('project_documents').insert({...patch,project_id:s.id}):sb.from('project_documents').update(patch).eq('project_id',s.id).eq('version',s.version);const{data,error}=await q.select('version');if(error){if(error.code==='23505')s.conflict=true;throw error}if(!data?.length){s.conflict=true;throw Error('Conflict')}s.version=data[0].version;s.dirty=s.revision!==revision;docStatus(s,s.dirty?'Saving…':'All changes saved')}
 catch(e){docStatus(s,s.conflict?'Newer version exists. Copy your text before reloading.':'Save failed — kept in this tab. Click Save to retry.')}
 finally{s.saving=false;if(s.dirty&&!s.conflict){clearTimeout(s.timer);s.timer=setTimeout(()=>saveProjectDocument(s.id),5000)}}
}
document.addEventListener('selectionchange',()=>{const e=document.getElementById('project-doc-editor'),s=window.getSelection();if(e&&s.rangeCount&&e.contains(s.anchorNode)&&e.contains(s.focusNode))projectDocRange=s.getRangeAt(0).cloneRange()});
function projectDocFormat(cmd,value=null){if(!docStaff())return;const ed=document.getElementById('project-doc-editor');if(!ed)return;ed.focus();if(projectDocRange&&ed.contains(projectDocRange.commonAncestorContainer)){const s=window.getSelection();s.removeAllRanges();s.addRange(projectDocRange)}document.execCommand(cmd,false,value);const state=projectDocState(_currentProjId);state.html=cleanProjectDocument(ed.innerHTML);projectDocChanged(state)}
function projectDocLink(){const v=prompt('Paste a link (https://…)');if(!v)return;const u=docSafeLink(v);if(!u){toast('Enter a valid web link');return}projectDocFormat('createLink',u)}
function projectMedia(value){try{const u=new URL(value);if(u.protocol!=='https:')return null;let id;
 if(['youtube.com','www.youtube.com','m.youtube.com','youtu.be'].includes(u.hostname)){id=u.hostname==='youtu.be'?u.pathname.split('/')[1]:u.searchParams.get('v')||u.pathname.match(/^\/(?:shorts|embed)\/([^/]+)/)?.[1];if(!/^[\w-]{11}$/.test(id||''))return null;return {kind:'youtube',url:'https://www.youtube.com/watch?v='+id,embed:'https://www.youtube-nocookie.com/embed/'+id}}
 if(u.hostname==='drive.google.com'){id=u.pathname.match(/\/file\/d\/([\w-]+)/)?.[1]||u.searchParams.get('id');if(!id||!/^[\w-]+$/.test(id))return null;return {kind:'drive',url:'https://drive.google.com/file/d/'+id+'/view',embed:'https://drive.google.com/file/d/'+id+'/preview'}}
 }catch{}return null}
function projectDocEmbed(){if(!docStaff())return;const url=prompt('Paste a YouTube video or Google Drive audio/video file link');if(!url)return;const media=projectMedia(url);if(!media){toast('Use a YouTube video or Google Drive file link');return}const s=projectDocState(_currentProjId);s.assets.push({...media,id:crypto.randomUUID(),name:media.kind==='drive'?'Google Drive audio / video':'YouTube video'});projectDocChanged(s);renderProjectAssets(s)}
async function uploadProjectImages(s,files){
 if(!docStaff())return;s.uploading=true;docStatus(s,'Uploading original images…');
 try{for(const file of files){if(!['image/png','image/jpeg','image/webp','image/gif','image/avif','image/bmp'].includes(file.type)||file.size>20*1024*1024){toast(file.name+': use an image up to 20 MB');continue}
 const path=s.id+'/'+crypto.randomUUID()+'/'+file.name.replace(/[^a-zA-Z0-9._-]/g,'_');const{error}=await sb.storage.from('project-originals').upload(path,file,{contentType:file.type,upsert:false});if(error)throw error;
 s.assets.push({id:crypto.randomUUID(),kind:'image',path,name:file.name,size:file.size});projectDocChanged(s);if(Number(_currentProjId)===s.id)renderProjectAssets(s)}await saveProjectDocument(s.id)}catch(e){toast('Image upload failed: '+e.message)}finally{s.uploading=false}
}
async function renderProjectAssets(s){
 const host=document.getElementById('project-doc-assets');if(!host||Number(_currentProjId)!==s.id)return;host.innerHTML='';
 for(const [i,a] of s.assets.entries()){const card=document.createElement('section');card.className='project-doc-asset';
 const controls=docStaff()?`<div class="project-doc-asset-tools"><button onclick="moveProjectAsset(${i},-1)" aria-label="Move up">↑</button><button onclick="moveProjectAsset(${i},1)" aria-label="Move down">↓</button><button onclick="removeProjectAsset(${i})">Remove</button></div>`:'';
 card.innerHTML=controls+`<strong>${docEscape(a.name||'Media')}</strong>`;host.append(card);
 if(a.kind==='image'&&typeof a.path==='string'&&a.path.startsWith(s.id+'/')){const img=document.createElement('img');img.alt=a.name||'Reference image';card.append(img);const btn=document.createElement('button');btn.textContent='Download original'+(a.size?' · '+(a.size/1024/1024).toFixed(2)+' MB':'');btn.onclick=()=>downloadProjectImage(a);card.append(btn);sb.storage.from('project-originals').createSignedUrl(a.path,3600).then(({data,error})=>{if(data)img.src=data.signedUrl;else{const msg=document.createElement('p');msg.textContent='Image unavailable. Reopen this tab to retry.';card.append(msg)}})}
 else{const media=projectMedia(a.url);if(!media)continue;const frame=document.createElement('iframe');frame.src=media.embed;frame.title=a.name||'Embedded media';frame.allow='fullscreen; encrypted-media; picture-in-picture';frame.allowFullscreen=true;frame.loading='lazy';card.append(frame);const link=document.createElement('a');link.href=media.url;link.target='_blank';link.rel='noopener noreferrer';link.textContent='Open original link ↗';card.append(link)}
 }
}
function removeProjectAsset(i){if(!docStaff())return;const s=projectDocState(_currentProjId);if(!confirm('Remove this media from the instructions?'))return;s.assets.splice(i,1);projectDocChanged(s);renderProjectAssets(s)}
function moveProjectAsset(i,delta){if(!docStaff())return;const s=projectDocState(_currentProjId),j=i+delta;if(j<0||j>=s.assets.length)return;[s.assets[i],s.assets[j]]=[s.assets[j],s.assets[i]];projectDocChanged(s);renderProjectAssets(s)}
async function downloadProjectImage(a){const{data,error}=await sb.storage.from('project-originals').download(a.path);if(error){toast('Download failed: '+error.message);return}const url=URL.createObjectURL(data),link=document.createElement('a');link.href=url;link.download=a.name||'image';link.click();setTimeout(()=>URL.revokeObjectURL(url),30000)}
window.addEventListener('beforeunload',e=>{if([...projectDocs.values()].some(s=>s.dirty||s.saving||s.uploading)){e.preventDefault();e.returnValue=''}});
window.addEventListener('online',()=>projectDocs.forEach(s=>saveProjectDocument(s.id)));
document.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='s'&&document.getElementById('pdm-tab-script')?.style.display==='flex'){e.preventDefault();saveProjectDocument(_currentProjId)}});

function openProjectInstructions(id){
 openProjDetail(Number(id));
 pdmTab('script',document.querySelector('.pdm-tab[onclick*="script"]'));
}
