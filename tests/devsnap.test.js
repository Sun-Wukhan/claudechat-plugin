'use strict';
/* DevSnap tests — plain Node, zero deps. Run: node tests/devsnap.test.js */
const fs=require('fs'); const os=require('os'); const path=require('path'); const http=require('http'); const {spawn}=require('child_process');
const ROOT=path.join(__dirname,'..'); const PLUGIN=path.join(ROOT,'plugins','devsnap');
const results=[]; function check(name,ok,detail){ results.push({name,ok}); console.log(`${ok?'PASS':'FAIL'}  ${name}${detail?'  '+detail:''}`); }
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function req(port,method,p,body){ return new Promise((resolve,reject)=>{ const data=body?JSON.stringify(body):null; const r=http.request({host:'127.0.0.1',port,path:p,method,headers:data?{'Content-Type':'application/json','Content-Length':Buffer.byteLength(data)}:{}},res=>{ let chunks=[]; res.on('data',c=>chunks.push(c)); res.on('end',()=>{ let j=null; try{j=JSON.parse(Buffer.concat(chunks).toString());}catch(_){} resolve({status:res.statusCode,json:j,body:Buffer.concat(chunks).toString()}); }); }); r.on('error',reject); if(data) r.write(data); r.end(); }); }
async function waitHealth(port){ for(let i=0;i<50;i++){ try{ const x=await req(port,'GET','/health'); if(x.status===200) return true; }catch(_){} await sleep(100);} return false; }
(async()=>{
  // manifests
  let mp,pj,hj;
  try{ mp=JSON.parse(fs.readFileSync(path.join(ROOT,'.claude-plugin','marketplace.json'),'utf8')); pj=JSON.parse(fs.readFileSync(path.join(PLUGIN,'.claude-plugin','plugin.json'),'utf8')); hj=JSON.parse(fs.readFileSync(path.join(PLUGIN,'hooks','hooks.json'),'utf8')); check('manifests parse',true); }catch(e){ check('manifests parse',false,e.message); throw e; }
  check('marketplace is devsnap with one devsnap plugin v0.1.0', mp.name==='devsnap'&&mp.plugins.length===1&&mp.plugins[0].name==='devsnap'&&mp.plugins[0].source==='./plugins/devsnap'&&mp.plugins[0].version==='0.1.0');
  check('plugin.json is devsnap v0.1.0', pj.name==='devsnap'&&pj.version==='0.1.0');
  const EVENTS=['SessionStart','UserPromptSubmit','Notification','PermissionRequest','Stop','SessionEnd'];
  check('hooks cover 6 events -> hook.js', EVENTS.every(ev=>{ const g=hj.hooks&&hj.hooks[ev]; return Array.isArray(g)&&g.some(x=>(x.hooks||[]).some(h=>h.command.includes('scripts/hook.js')&&h.command.includes(ev))); }));
  const hooksRaw=fs.readFileSync(path.join(PLUGIN,'hooks','hooks.json'),'utf8');
  check('hooks have no autostart', !hooksRaw.includes('autostart'));
  check('client copies identical', fs.readFileSync(path.join(ROOT,'client','index.html'),'utf8')===fs.readFileSync(path.join(PLUGIN,'client','index.html'),'utf8'));
  // server e2e on ephemeral port — use fixed high port derived from pid
  const PORT=37400+(process.pid%400);
  const tmpStore=path.join(ROOT,'server','stories.json'); const backup=fs.existsSync(tmpStore)?fs.readFileSync(tmpStore):null;
  try{ fs.rmSync(tmpStore,{force:true}); }catch(_){}
  const srv=spawn(process.execPath,[path.join(ROOT,'server','server.js')],{env:{...process.env,PORT:String(PORT)},stdio:'ignore'});
  try{
    const up=await waitHealth(PORT); check('server /health',up);
    const feed0=await req(PORT,'GET','/api/feed'); const handles=(feed0.json||[]).map(g=>g.handle).sort();
    check('seed feed has 3 demo groups', feed0.status===200&&handles.join(',')==='demo_kenji,demo_maya,demo_sofia', handles.join(','));
    const post=await req(PORT,'POST','/api/stories',{handle:'tester_dev',caption:'hello devsnap',kind:'screenshot',image:null,claudeStatus:'busy'});
    check('POST story 201', post.status===201&&!!post.json.id, 'status='+post.status);
    const sid=post.json&&post.json.id;
    const feed1=await req(PORT,'GET','/api/feed'); const grp=(feed1.json||[]).find(g=>g.handle==='tester_dev');
    check('feed groups posted story', !!grp&&grp.stories.length===1&&grp.stories[0].id===sid);
    const v1=await req(PORT,'POST',`/api/stories/${sid}/view`,{handle:'viewer_a'}); check('view increments', v1.status===200&&v1.json.views===1, 'views='+(v1.json&&v1.json.views));
    const v2=await req(PORT,'POST',`/api/stories/${sid}/view`,{handle:'viewer_a'}); check('view once per viewer', v2.json.views===1);
    const v3=await req(PORT,'POST',`/api/stories/${sid}/view`,{handle:'viewer_b'}); check('second viewer increments', v3.json.views===2);
    const badHandle=await req(PORT,'POST','/api/stories',{handle:'bad handle!',caption:'x',kind:'photo',image:null}); check('invalid handle 400', badHandle.status===400);
    const bigCap=await req(PORT,'POST','/api/stories',{handle:'tester_dev',caption:'x'.repeat(201),kind:'photo',image:null}); check('oversize caption 400', bigCap.status===400);
    const delForbidden=await req(PORT,'DELETE',`/api/stories/${sid}`,{handle:'someone_else'}); check('delete by non-owner 403', delForbidden.status===403);
    const delOk=await req(PORT,'DELETE',`/api/stories/${sid}`,{handle:'tester_dev'}); check('delete by owner 200', delOk.status===200);
  } finally { srv.kill('SIGTERM'); await sleep(300); try{ if(backup) fs.writeFileSync(tmpStore,backup); else fs.rmSync(tmpStore,{force:true}); }catch(_){} }
  const failed=results.filter(r=>!r.ok).length; console.log(`\n${results.length-failed}/${results.length} passed`); process.exit(failed?1:0);
})().catch(e=>{ console.error(e); process.exit(1); });
