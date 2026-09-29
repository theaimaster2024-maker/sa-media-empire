import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS'};
Deno.serve(async req=>{
 const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,'Content-Type':'application/json'}});
 if(req.method==='OPTIONS')return new Response('ok',{headers:cors});
 if(req.method!=='POST')return reply({error:'Method not allowed'},405);
 try{
  const token=req.headers.get('Authorization')?.replace(/^Bearer\s+/i,'');
  const admin=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}});
  const {data:{user},error}=await admin.auth.getUser(token||'');if(error||!user)return reply({error:'Sign in required'},401);
  const {url,board_id}=await req.json();
  const {data:p}=await admin.from('profiles').select('role').eq('id',user.id).maybeSingle();
  if(!p||!['owner','manager'].includes(p.role)){
   const {data:m}=await admin.from('studio_board_members').select('can_edit').eq('board_id',board_id).eq('user_id',user.id).maybeSingle();
   if(!m?.can_edit)return reply({error:'Board edit access required'},403);
  }
  const u=new URL(url);if(!['youtube.com','www.youtube.com','m.youtube.com'].includes(u.hostname)||!/^\/(?:@[\w.%-]+|channel\/[\w-]+|c\/[\w.%-]+|user\/[\w.%-]+)\/?$/.test(u.pathname))return reply({error:'Enter a YouTube channel URL'},400);
  // Fixed origin, no redirects: user input cannot fetch arbitrary hosts or private networks.
  const response=await fetch('https://www.youtube.com'+u.pathname+'?hl=en',{redirect:'error',signal:AbortSignal.timeout(8000),headers:{'User-Agent':'Mozilla/5.0','Accept-Language':'en'}});
  if(!response.ok||!response.body)throw new Error('Unavailable');
  const reader=response.body.getReader();let size=0,html='';const decoder=new TextDecoder();
  while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>3000000){await reader.cancel();break}html+=decoder.decode(value,{stream:true})}
  const unescape=(v:string)=>v.replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>');
  const meta=(key:string)=>{for(const tag of html.match(/<meta\b[^>]*>/gi)||[]){if(tag.includes(`property="${key}"`)||tag.includes(`name="${key}"`))return unescape(tag.match(/content="([^"]*)"/i)?.[1]||'')}return ''};
  let name=meta('og:title').replace(/ - YouTube$/,''),logo=meta('og:image'),description=meta('og:description');
  try{const raw=html.match(/(?:var\s+)?ytInitialData\s*=\s*(\{.*?\});\s*<\/script>/s)?.[1];if(raw){const m=JSON.parse(raw).metadata?.channelMetadataRenderer;if(m){name=m.title||name;description=m.description||description;logo=m.avatar?.thumbnails?.at(-1)?.url||logo}}}catch{}
  if(!name||(name==='YouTube'&&!logo.includes('yt3.')))return reply({error:'Channel preview unavailable. You can add a name and logo manually.'},422);
  if(logo){const l=new URL(logo);if(l.protocol!=='https:'||!['yt3.googleusercontent.com','yt3.ggpht.com','www.youtube.com'].includes(l.hostname))logo=''}
  return reply({name:name.slice(0,180),logo,description:description.slice(0,220)});
 }catch{return reply({error:'Channel preview unavailable. Add a name and logo manually.'},422)}
});
