import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS','Cache-Control':'no-store'};
Deno.serve(async(req)=>{
 const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,'Content-Type':'application/json'}});
 if(req.method==='OPTIONS')return new Response('ok',{headers:cors});
 if(req.method!=='POST')return reply({error:'Method not allowed'},405);
 try{
  const {board_id,share_token,paths}=await req.json();
  if(typeof board_id!=='string'||!Array.isArray(paths)||paths.length>50||!paths.length||paths.some(p=>typeof p!=='string'||!p.startsWith(board_id+'/')||p.includes('..')))return reply({error:'Invalid request'},400);
  const admin=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}});
  let allowed=false;
  if(typeof share_token==='string'){
   const {data}=await admin.from('studio_boards').select('id').eq('id',board_id).eq('share_token',share_token).maybeSingle();allowed=!!data;
  }else{
   const bearer=req.headers.get('Authorization')?.replace(/^Bearer\s+/i,'');
   if(!bearer)return reply({error:'Sign in required'},401);
   const {data:{user},error}=await admin.auth.getUser(bearer);if(error||!user)return reply({error:'Sign in required'},401);
   const {data:p}=await admin.from('profiles').select('role').eq('id',user.id).maybeSingle();
   if(p&&['owner','manager'].includes(p.role))allowed=true;
   else{const {data:m}=await admin.from('studio_board_members').select('user_id').eq('board_id',board_id).eq('user_id',user.id).maybeSingle();allowed=!!m}
  }
  if(!allowed)return reply({error:'Board access denied'},403);
  const {data:items,error:readError}=await admin.from('studio_board_items').select('payload').eq('board_id',board_id).eq('deleted',false);
  if(readError)throw readError;
  const visible=new Set((items||[]).filter(i=>i.payload?.type==='image').map(i=>i.payload.storagePath));
  const approved=[...new Set(paths)].filter(p=>visible.has(p));if(!approved.length)return reply({urls:[]});
  const {data,error}=await admin.storage.from('studio-originals').createSignedUrls(approved,300);if(error)throw error;
  return reply({urls:(data||[]).filter(r=>r.signedUrl).map(r=>({path:r.path,url:r.signedUrl})),expires_in:300});
 }catch{ return reply({error:'Could not load image'},400); }
});
