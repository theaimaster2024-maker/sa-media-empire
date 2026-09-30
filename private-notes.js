'use strict';
const ownerDoc={loaded:false,saving:false,dirty:false,version:null,timer:null,range:null,conflict:false};
function cleanOwnerDocument(html){
 const t=document.createElement('template');t.innerHTML=html||'';
 const allowed=new Set(['P','DIV','BR','SPAN','B','STRONG','I','EM','U','S','STRIKE','UL','OL','LI','H1','H2','H3','BLOCKQUOTE','FONT']);
 function walk(root){for(let n of [...root.childNodes]){if(n.nodeType!==1)continue;if(['SCRIPT','STYLE','IFRAME','OBJECT','SVG','MATH'].includes(n.tagName)){n.remove();continue}if(!allowed.has(n.tagName)){n.replaceWith(document.createTextNode(n.textContent));continue}
 if(n.tagName==='FONT'){const span=document.createElement('span');span.innerHTML=n.innerHTML;span.style.color=n.getAttribute('color')||'';span.style.fontSize=({1:10,2:13,3:16,4:20,5:24,6:32,7:40}[n.getAttribute('size')]||16)+'px';n.replaceWith(span);n=span}
 const keep={};for(const prop of ['color','backgroundColor','fontWeight','fontStyle','textDecoration','textAlign','fontSize','fontFamily']){const v=n.style[prop];if(v&&!/url|expression|var\(/i.test(v))keep[prop]=v}for(const a of [...n.attributes])n.removeAttribute(a.name);Object.assign(n.style,keep);walk(n)}}walk(t.content);return t.innerHTML;
}
function ownerDocStatus(text){document.getElementById('owner-doc-status').textContent=text}
async function loadOwnerDocument(){
 if(profile?.role!=='owner')return;if(ownerDoc.loaded||ownerDoc.dirty)return;
 const editor=document.getElementById('owner-doc-editor');ownerDocStatus('Loading…');editor.contentEditable='false';
 const {data,error}=await sb.from('owner_private_documents').select('*').eq('owner_id',user.id).maybeSingle();
 if(error){ownerDocStatus('Could not load. Use Retry.');return}
 editor.innerHTML=cleanOwnerDocument(data?.content||'');ownerDoc.version=data?.version??null;ownerDoc.loaded=true;editor.contentEditable='true';ownerDocStatus(data?'All changes saved':'Ready to write');ownerDocCount();
}
function ownerDocCount(){const t=document.getElementById('owner-doc-editor').textContent.trim();document.getElementById('owner-doc-count').textContent=(t?t.split(/\s+/).length:0)+' words'}
function ownerDocChanged(){if(!ownerDoc.loaded||profile?.role!=='owner')return;ownerDoc.dirty=true;ownerDocCount();ownerDocStatus(ownerDoc.conflict?'Newer version exists. Copy your text before reloading.':'Saving…');clearTimeout(ownerDoc.timer);if(!ownerDoc.conflict)ownerDoc.timer=setTimeout(saveOwnerDocument,1000)}
async function saveOwnerDocument(){
 if(profile?.role!=='owner'||!ownerDoc.loaded||ownerDoc.saving||ownerDoc.conflict||!ownerDoc.dirty)return;
 ownerDoc.saving=true;ownerDocStatus('Saving…');const editor=document.getElementById('owner-doc-editor'),html=cleanOwnerDocument(editor.innerHTML),version=ownerDoc.version;
 try{const patch={content:html,version:(version||0)+1,updated_at:new Date().toISOString()};let q=version===null?sb.from('owner_private_documents').insert({...patch,owner_id:user.id}):sb.from('owner_private_documents').update(patch).eq('owner_id',user.id).eq('version',version);const {data,error}=await q.select('version');
 if(error){if(error.code==='23505')ownerDoc.conflict=true;throw error}if(!data?.length){ownerDoc.conflict=true;throw new Error('A newer version exists in another tab. Copy your text before reloading.')}
 ownerDoc.version=data[0].version;ownerDoc.dirty=cleanOwnerDocument(editor.innerHTML)!==html;ownerDocStatus(ownerDoc.dirty?'Saving…':'All changes saved');
 }catch(e){ownerDocStatus(ownerDoc.conflict?'Save conflict — copy your text, then reload.':'Save failed — your text is still here. Click Save to retry.')}finally{ownerDoc.saving=false;if(ownerDoc.dirty&&!ownerDoc.conflict){clearTimeout(ownerDoc.timer);ownerDoc.timer=setTimeout(saveOwnerDocument,5000)}}
}
function rememberOwnerSelection(){const s=window.getSelection(),ed=document.getElementById('owner-doc-editor');if(s.rangeCount&&ed.contains(s.anchorNode)&&ed.contains(s.focusNode))ownerDoc.range=s.getRangeAt(0).cloneRange()}
function ownerFormat(command,value=null){if(!ownerDoc.loaded||profile?.role!=='owner')return;const ed=document.getElementById('owner-doc-editor');ed.focus();if(ownerDoc.range&&ed.contains(ownerDoc.range.commonAncestorContainer)){const s=window.getSelection();s.removeAllRanges();s.addRange(ownerDoc.range)}document.execCommand(command,false,value);rememberOwnerSelection();ownerDocChanged()}
const ownerEditor=document.getElementById('owner-doc-editor');
ownerEditor.addEventListener('input',ownerDocChanged);document.addEventListener('selectionchange',rememberOwnerSelection);
ownerEditor.addEventListener('paste',e=>{e.preventDefault();document.execCommand('insertHTML',false,cleanOwnerDocument(e.clipboardData.getData('text/html')||e.clipboardData.getData('text/plain').split('\n').map(s=>'<div>'+finEscape(s)+'</div>').join('')));ownerDocChanged()});
ownerEditor.addEventListener('drop',e=>e.preventDefault());
document.querySelectorAll('#owner-doc-toolbar button').forEach(b=>b.addEventListener('mousedown',e=>e.preventDefault()));
document.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='s'&&document.getElementById('pg-owner-notes').classList.contains('on')){e.preventDefault();saveOwnerDocument()}});
window.addEventListener('beforeunload',e=>{if(ownerDoc.dirty||ownerDoc.saving){e.preventDefault();e.returnValue=''}});
window.addEventListener('online',()=>{if(ownerDoc.dirty)saveOwnerDocument()});
