#!/usr/bin/env node
'use strict';
/* DevSnap shared stories server — zero-dependency Node http.
 * Binds 0.0.0.0, PORT env (default 37181).
 * MVP storage: in-memory store persisted best-effort to stories.json next to this file.
 */
const fs=require('fs'); const path=require('path'); const http=require('http'); const crypto=require('crypto');
const PORT=parseInt(process.env.PORT,10)||37181;
const STORE_FILE=path.join(__dirname,'stories.json');
const CLIENT_HTML=path.join(__dirname,'..','client','index.html');
const HANDLE_RE=/^[a-zA-Z0-9_.-]{1,24}$/;
const COLORS=['#f59e0b','#ec4899','#8b5cf6','#06b6d4','#22c55e','#f97316','#3b82f6','#eab308'];
function colorFor(handle){ let h=0; for(let i=0;i<handle.length;i++) h=(h*31+handle.charCodeAt(i))>>>0; return COLORS[h%COLORS.length]; }
let stories=[]; let viewedBy={}; // storyId -> [handles]
function save(){ try{ fs.writeFileSync(STORE_FILE, JSON.stringify({stories,viewedBy})); }catch(_){} }
function load(){ try{ const d=JSON.parse(fs.readFileSync(STORE_FILE,'utf8')); if(Array.isArray(d.stories)){ stories=d.stories; viewedBy=d.viewedBy||{}; } }catch(_){} }
function seed(){
  if(stories.length) return;
  const now=Date.now();
  const seeds=[
    {handle:'demo_maya',caption:'Pairing on a gnarly refactor — Claude is cooking',kind:'screenshot',gradient:'linear-gradient(135deg,#f59e0b,#ec4899)',hoursAgo:2,claudeStatus:'busy'},
    {handle:'demo_kenji',caption:'Desk setup while the tests run green',kind:'photo',gradient:'linear-gradient(135deg,#06b6d4,#3b82f6)',hoursAgo:5,claudeStatus:'busy'},
    {handle:'demo_sofia',caption:'Shipped it! Post-merge selfie',kind:'selfie',gradient:'linear-gradient(135deg,#8b5cf6,#ec4899)',hoursAgo:9,claudeStatus:'done'},
  ];
  for(const s of seeds){ const created=new Date(now - s.hoursAgo*3600*1000); stories.push({id:crypto.randomBytes(8).toString('hex'),handle:s.handle,caption:s.caption,kind:s.kind,image:null,gradient:s.gradient,createdAt:created.toISOString(),expiresAt:new Date(created.getTime()+24*3600*1000).toISOString(),claudeStatus:s.claudeStatus,views:0,demo:true}); }
  save();
}
load(); seed();
function isExpired(s){ return Date.now() > new Date(s.expiresAt).getTime(); }
function publicStory(s){ return {id:s.id,handle:s.handle,caption:s.caption,kind:s.kind,image:s.image||null,gradient:s.gradient||null,createdAt:s.createdAt,expiresAt:s.expiresAt,claudeStatus:s.claudeStatus||null,views:s.views||0,demo:!!s.demo}; }
function feed(){
  const live=stories.filter(s=>!isExpired(s));
  const by={};
  for(const s of live){ (by[s.handle]=by[s.handle]||[]).push(s); }
  return Object.keys(by).map(handle=>{ const arr=by[handle].slice().sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt)); return {handle,avatarColor:colorFor(handle),latestAt:arr[0].createdAt,stories:arr.map(publicStory)}; }).sort((a,b)=>new Date(b.latestAt)-new Date(a.latestAt));
}
function readBody(req){ return new Promise((resolve)=>{ let b=''; req.on('data',c=>{ b+=c; if(b.length>5000000){ req.destroy(); } }); req.on('end',()=>{ try{ resolve(b?JSON.parse(b):{}); }catch(_){ resolve(null); } }); req.on('error',()=>resolve(null)); }); }
function send(res,code,obj){ const body=typeof obj==='string'?obj:JSON.stringify(obj); res.writeHead(code,{'Content-Type': typeof obj==='string'?'text/plain':'application/json','Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET,POST,DELETE,OPTIONS','Access-Control-Allow-Headers':'Content-Type'}); res.end(body); }
const server=http.createServer(async (req,res)=>{
  const url=(req.url||'/').split('?')[0];
  if(req.method==='OPTIONS'){ send(res,200,{}); return; }
  if(req.method==='GET'&&url==='/health'){ send(res,200,{ok:true}); return; }
  if(req.method==='GET'&&url==='/api/feed'){ send(res,200,feed()); return; }
  if(req.method==='POST'&&url==='/api/stories'){
    const body=await readBody(req); if(!body){ send(res,400,{error:'invalid json'}); return; }
    const {handle,caption,kind,image,claudeStatus}=body;
    if(!handle||!HANDLE_RE.test(handle)){ send(res,400,{error:'invalid handle'}); return; }
    if(caption!=null && String(caption).length>200){ send(res,400,{error:'caption too long'}); return; }
    if(image!=null && image!=='' && (typeof image!=='string'||!image.startsWith('data:image/')||image.length>2500000)){ send(res,400,{error:'invalid image'}); return; }
    const k=['screenshot','selfie','photo'].includes(kind)?kind:'photo';
    const now=new Date();
    const story={id:crypto.randomBytes(8).toString('hex'),handle,caption:String(caption||''),kind:k,image:image||null,gradient:null,createdAt:now.toISOString(),expiresAt:new Date(now.getTime()+24*3600*1000).toISOString(),claudeStatus:claudeStatus||null,views:0,demo:false};
    stories.push(story); save(); send(res,201,publicStory(story)); return;
  }
  const viewMatch=url.match(/^\/api\/stories\/([^/]+)\/view$/);
  if(req.method==='POST'&&viewMatch){ const body=await readBody(req)||{}; const s=stories.find(x=>x.id===viewMatch[1]); if(!s){ send(res,404,{error:'not found'}); return; } const viewer=body.handle; viewedBy[s.id]=viewedBy[s.id]||[]; if(viewer && !viewedBy[s.id].includes(viewer)){ viewedBy[s.id].push(viewer); s.views=(s.views||0)+1; save(); } else if(!viewer){ s.views=(s.views||0)+1; save(); } send(res,200,publicStory(s)); return; }
  const delMatch=url.match(/^\/api\/stories\/([^/]+)$/);
  if(req.method==='DELETE'&&delMatch){ const body=await readBody(req)||{}; const idx=stories.findIndex(x=>x.id===delMatch[1]); if(idx===-1){ send(res,404,{error:'not found'}); return; } if(stories[idx].handle!==body.handle){ send(res,403,{error:'forbidden'}); return; } stories.splice(idx,1); delete viewedBy[delMatch[1]]; save(); send(res,200,{ok:true}); return; }
  if(req.method==='GET'&&(url==='/'||url==='/index.html')){ fs.readFile(CLIENT_HTML,(err,data)=>{ if(err){ send(res,500,'client not found'); return; } res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'}); res.end(data); }); return; }
  send(res,404,{error:'not found'});
});
if(require.main===module){ server.listen(PORT,'0.0.0.0',()=>console.log('devsnap server listening on http://0.0.0.0:'+PORT)); }
module.exports={server};
