#!/usr/bin/env node
'use strict';
/* ClaudeChat local bridge — 127.0.0.1 ONLY, CLAUDECHAT_PORT default 37180, +1..+5 fallback.
 * Serves client with Claude-status ribbon injected. /api/* proxies to a shared
 * server: CLAUDECHAT_SERVER if set, otherwise the public default below, so a fresh
 * install lands in the shared feed out of the box. CLAUDECHAT_SERVER=local (or off)
 * opts out to a local-only store persisted to <state dir>/stories.json.
 * (Legacy DEVSNAP_* env vars are still honoured as fallbacks.)
 * GET /mode reports {mode:'shared'|'local', server} for diagnostics.
 */
const fs=require('fs'); const os=require('os'); const path=require('path'); const http=require('http'); const https=require('https'); const crypto=require('crypto');
const BASE_PORT=parseInt(process.env.CLAUDECHAT_PORT||process.env.DEVSNAP_PORT,10)||37180; const MAX_TRIES=6;
const DEFAULT_SERVER='https://devsnap-lozv.onrender.com';
function upstreamServer(){ const v=(process.env.CLAUDECHAT_SERVER||process.env.DEVSNAP_SERVER||'').trim(); if(v.toLowerCase()==='local'||v.toLowerCase()==='off') return null; if(v) return v.replace(/\/$/,''); return DEFAULT_SERVER; }
const UPSTREAM=upstreamServer();
const CLIENT_HTML=path.join(__dirname,'..','client','index.html');
const HANDLE_RE=/^[a-zA-Z0-9_.-]{1,24}$/;
const COLORS=['#f59e0b','#ec4899','#8b5cf6','#06b6d4','#22c55e','#f97316','#3b82f6','#eab308'];
function colorFor(h){ let x=0; for(let i=0;i<h.length;i++) x=(x*31+h.charCodeAt(i))>>>0; return COLORS[x%COLORS.length]; }
function stateDir(){ return process.env.CLAUDE_PLUGIN_DATA || path.join(os.homedir(),'.claudechat'); }
function readStatus(){ try{ const d=JSON.parse(fs.readFileSync(path.join(stateDir(),'state.json'),'utf8')); return {agent:d.agent||'idle',event:d.event||null,updatedAt:d.updatedAt||null}; }catch(_){ return {agent:'idle',event:null,updatedAt:null}; } }
function recordPort(port){ try{ const dir=stateDir(); fs.mkdirSync(dir,{recursive:true}); fs.writeFileSync(path.join(dir,'bridge.json'), JSON.stringify({port,pid:process.pid,startedAt:new Date().toISOString()})); }catch(_){} }
// local store
let stories=[]; let viewedBy={};
function storeFile(){ return path.join(stateDir(),'stories.json'); }
function save(){ try{ fs.mkdirSync(stateDir(),{recursive:true}); fs.writeFileSync(storeFile(), JSON.stringify({stories,viewedBy})); }catch(_){} }
function load(){ try{ const d=JSON.parse(fs.readFileSync(storeFile(),'utf8')); if(Array.isArray(d.stories)){ stories=d.stories; viewedBy=d.viewedBy||{}; } }catch(_){} }
function seed(){ if(stories.length) return; const now=Date.now(); const seeds=[{handle:'demo_maya',caption:'Pairing on a gnarly refactor — Claude is cooking',kind:'screenshot',gradient:'linear-gradient(135deg,#f59e0b,#ec4899)',minutesAgo:20,claudeStatus:'busy'},{handle:'demo_kenji',caption:'Desk setup while the tests run green',kind:'photo',gradient:'linear-gradient(135deg,#06b6d4,#3b82f6)',minutesAgo:55,claudeStatus:'busy'},{handle:'demo_sofia',caption:'Shipped it! Post-merge selfie',kind:'selfie',gradient:'linear-gradient(135deg,#8b5cf6,#ec4899)',minutesAgo:100,claudeStatus:'done'}]; for(const s of seeds){ const c=new Date(now-s.minutesAgo*60*1000); stories.push({id:crypto.randomBytes(8).toString('hex'),handle:s.handle,caption:s.caption,kind:s.kind,image:null,gradient:s.gradient,createdAt:c.toISOString(),expiresAt:new Date(c.getTime()+2*3600*1000).toISOString(),claudeStatus:s.claudeStatus,views:0,demo:true}); } save(); }
load(); seed();
function isExpired(s){ return Date.now()>new Date(s.expiresAt).getTime(); }
function publicStory(s){ return {id:s.id,handle:s.handle,caption:s.caption,kind:s.kind,image:s.image||null,gradient:s.gradient||null,createdAt:s.createdAt,expiresAt:s.expiresAt,claudeStatus:s.claudeStatus||null,views:s.views||0,demo:!!s.demo}; }
function feed(){ const live=stories.filter(s=>!isExpired(s)); const by={}; for(const s of live)(by[s.handle]=by[s.handle]||[]).push(s); return Object.keys(by).map(handle=>{ const arr=by[handle].slice().sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt)); return {handle,avatarColor:colorFor(handle),latestAt:arr[0].createdAt,stories:arr.map(publicStory)}; }).sort((a,b)=>new Date(b.latestAt)-new Date(a.latestAt)); }
function readBody(req){ return new Promise(r=>{ let b=''; req.on('data',c=>{b+=c; if(b.length>12000000) req.destroy();}); req.on('end',()=>{ try{r(b?JSON.parse(b):{});}catch(_){r(null);} }); req.on('error',()=>r(null)); }); }
function readRaw(req){ return new Promise(r=>{ let chunks=[]; req.on('data',c=>chunks.push(c)); req.on('end',()=>r(Buffer.concat(chunks))); req.on('error',()=>r(Buffer.alloc(0))); }); }
function send(res,code,obj){ res.writeHead(code,{'Content-Type':'application/json','Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET,POST,DELETE,OPTIONS','Access-Control-Allow-Headers':'Content-Type'}); res.end(JSON.stringify(obj)); }
const RIBBON_JS=['(function(){','  var BASE_TITLE=document.title;','  var bar=document.createElement("div"); bar.id="claudechat-ribbon";','  bar.setAttribute("style","position:fixed;top:0;left:0;right:0;height:28px;z-index:2147483000;pointer-events:none;display:flex;align-items:center;justify-content:center;font:600 13px/1 system-ui,sans-serif;color:#f5f5f5;background:#4b5563;transition:transform .35s ease,background .25s ease;");','  var style=document.createElement("style"); style.textContent="@keyframes claudechat-pulse{0%,100%{background:#b91c1c}50%{background:#ef4444}}"; document.head.appendChild(style);','  function mount(){ if(document.body) document.body.appendChild(bar); else setTimeout(mount,50); } mount();','  var current=null,doneSince=0;','  function render(agent){ var now=Date.now(); if(agent!==current){current=agent; doneSince=(agent==="done")?now:0;} bar.style.animation="none"; if(agent==="attention"){bar.style.background="#b91c1c"; bar.style.animation="claudechat-pulse 1s ease-in-out infinite"; bar.textContent="\\u26A0\\uFE0F Claude needs you \\u2014 check your terminal"; bar.style.transform="translateY(0)"; document.title="\\u26A0\\uFE0F Claude needs you \\u2014 "+BASE_TITLE;} else if(agent==="busy"){bar.style.background="#1d4ed8"; bar.textContent="Claude is working\\u2026"; bar.style.transform="translateY(0)"; document.title=BASE_TITLE;} else if(agent==="done"){bar.style.background="#15803d"; bar.textContent="\\u2714 Claude is done"; bar.style.transform=(now-doneSince>6000)?"translateY(-100%)":"translateY(0)"; document.title=BASE_TITLE;} else {bar.style.background="#4b5563"; bar.textContent="\\uD83D\\uDCAC ClaudeChat \\u00B7 Claude is idle"; bar.style.transform="translateY(0)"; document.title=BASE_TITLE;} }','  render("idle"); setInterval(function(){ fetch("/status",{cache:"no-store"}).then(function(r){return r.ok?r.json():null;}).then(function(s){ if(s&&s.agent) render(s.agent);}).catch(function(){}); },1000);','})();'].join('\n');
const RIBBON_BLOCK='\n<!-- claudechat-ribbon:start -->\n<script>\n'+RIBBON_JS+'\n</script>\n<!-- claudechat-ribbon:end -->\n';
function injectRibbon(buf){ const html=buf.toString('utf8'); const idx=html.toLowerCase().lastIndexOf('</body>'); if(idx===-1) return Buffer.from(html+RIBBON_BLOCK,'utf8'); return Buffer.from(html.slice(0,idx)+RIBBON_BLOCK+html.slice(idx),'utf8'); }
function proxy(req,res,rawBody){ const target=new URL(UPSTREAM+req.url); const lib=target.protocol==='https:'?https:http; const preq=lib.request({hostname:target.hostname,port:target.port|| (target.protocol==='https:'?443:80),path:target.pathname+target.search,method:req.method,headers:{'Content-Type':'application/json'}},(pres)=>{ let chunks=[]; pres.on('data',c=>chunks.push(c)); pres.on('end',()=>{ res.writeHead(pres.statusCode,{'Content-Type':pres.headers['content-type']||'application/json','Access-Control-Allow-Origin':'*'}); res.end(Buffer.concat(chunks)); }); }); preq.on('error',()=>{ send(res,502,{error:'upstream unavailable'}); }); if(rawBody&&rawBody.length) preq.write(rawBody); preq.end(); }
const server=http.createServer(async (req,res)=>{
  const url=(req.url||'/').split('?')[0];
  if(req.method==='OPTIONS'){ send(res,200,{}); return; }
  if(req.method==='GET'&&url==='/health'){ res.writeHead(200,{'Content-Type':'application/json'}); res.end('{"ok":true}'); return; }
  if(req.method==='GET'&&url==='/status'){ res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'}); res.end(JSON.stringify(readStatus())); return; }
  if(req.method==='GET'&&url==='/mode'){ res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'}); res.end(JSON.stringify({mode:UPSTREAM?'shared':'local',server:UPSTREAM})); return; }
  if(url==='/profile'){
    if(req.method==='GET'){ try{ const p=JSON.parse(fs.readFileSync(path.join(stateDir(),'profile.json'),'utf8')); send(res,200,p); }catch(_){ send(res,200,{handle:null,avatarColor:null}); } return; }
    if(req.method==='POST'){ const body=await readBody(req); if(!body||!body.handle||!HANDLE_RE.test(body.handle)){ send(res,400,{error:'invalid handle'}); return; } const prof={handle:body.handle,avatarColor:body.avatarColor||colorFor(body.handle)}; try{ fs.mkdirSync(stateDir(),{recursive:true}); fs.writeFileSync(path.join(stateDir(),'profile.json'),JSON.stringify(prof)); }catch(_){} send(res,200,prof); return; }
  }
  if(url.startsWith('/api/')){
    if(UPSTREAM){ const raw=await readRaw(req); proxy(req,res,raw); return; }
    if(req.method==='GET'&&url==='/api/feed'){ send(res,200,feed()); return; }
    if(req.method==='POST'&&url==='/api/stories'){ const body=await readBody(req); if(!body){ send(res,400,{error:'invalid json'}); return; } const {handle,caption,kind,image,claudeStatus}=body; if(!handle||!HANDLE_RE.test(handle)){ send(res,400,{error:'invalid handle'}); return; } if(caption!=null&&String(caption).length>200){ send(res,400,{error:'caption too long'}); return; } if(image!=null&&image!==''){ if(typeof image!=='string'||!image.startsWith('data:image/')){ send(res,400,{error:'invalid image'}); return; } if(image.length>8000000){ send(res,400,{error:'image too large — the app compresses photos automatically; try a smaller image'}); return; } } const k=['screenshot','selfie','photo'].includes(kind)?kind:'photo'; const now=new Date(); const story={id:crypto.randomBytes(8).toString('hex'),handle,caption:String(caption||''),kind:k,image:image||null,gradient:null,createdAt:now.toISOString(),expiresAt:new Date(now.getTime()+2*3600*1000).toISOString(),claudeStatus:claudeStatus||null,views:0,demo:false}; stories.push(story); save(); send(res,201,publicStory(story)); return; }
    const vm=url.match(/^\/api\/stories\/([^/]+)\/view$/); if(req.method==='POST'&&vm){ const body=await readBody(req)||{}; const s=stories.find(x=>x.id===vm[1]); if(!s){ send(res,404,{error:'not found'}); return; } viewedBy[s.id]=viewedBy[s.id]||[]; if(body.handle&&!viewedBy[s.id].includes(body.handle)){ viewedBy[s.id].push(body.handle); s.views=(s.views||0)+1; save(); } else if(!body.handle){ s.views=(s.views||0)+1; save(); } send(res,200,publicStory(s)); return; }
    const dm=url.match(/^\/api\/stories\/([^/]+)$/); if(req.method==='DELETE'&&dm){ const body=await readBody(req)||{}; const idx=stories.findIndex(x=>x.id===dm[1]); if(idx===-1){ send(res,404,{error:'not found'}); return; } if(stories[idx].handle!==body.handle){ send(res,403,{error:'forbidden'}); return; } stories.splice(idx,1); delete viewedBy[dm[1]]; save(); send(res,200,{ok:true}); return; }
    send(res,404,{error:'not found'}); return;
  }
  if(req.method==='GET'&&(url==='/'||url==='/index.html')){ fs.readFile(CLIENT_HTML,(err,data)=>{ if(err){ res.writeHead(500,{'Content-Type':'text/plain'}); res.end('client not found'); return; } res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'}); res.end(injectRibbon(data)); }); return; }
  res.writeHead(404,{'Content-Type':'text/plain'}); res.end('not found');
});
let tries=0; function listen(port){ tries++; server.once('error',(err)=>{ if(err&&err.code==='EADDRINUSE'&&tries<MAX_TRIES) listen(port+1); else process.exit(0); }); server.listen(port,'127.0.0.1',()=>{ recordPort(port); console.log('claudechat bridge listening on http://127.0.0.1:'+port); }); }
if(require.main===module) listen(BASE_PORT);
module.exports={server};
