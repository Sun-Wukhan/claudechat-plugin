#!/usr/bin/env node
'use strict';
/*
 * ClaudeChat — Claude Code hook entry point.
 * Invoked as: node hook.js <EventName>
 * Records agent status in <CLAUDE_PLUGIN_DATA or ~/.claudechat>/state.json
 * { agent, event, updatedAt }. NEVER reads stdin.
 * `open` invocation: ensure the status bridge, then open the ONLINE app
 * (CLAUDECHAT_SERVER or the default live server) in the browser, unless
 * CLAUDECHAT_NO_OPEN. ClaudeChat is online only — nothing is served locally.
 * Lifecycle events NEVER open a window (Navid's standing rule, Nov 10 2026).
 * Env: CLAUDE_PLUGIN_DATA, CLAUDECHAT_PORT (default 37180), CLAUDECHAT_NO_OPEN
 * (legacy DEVSNAP_PORT / DEVSNAP_NO_OPEN honoured as fallbacks)
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');
const DEFAULT_PORT = parseInt(process.env.CLAUDECHAT_PORT || process.env.DEVSNAP_PORT, 10) || 37180;
function stateDir(){ return process.env.CLAUDE_PLUGIN_DATA || path.join(os.homedir(), '.claudechat'); }
function writeState(agent, event){ try{ const dir=stateDir(); fs.mkdirSync(dir,{recursive:true}); fs.writeFileSync(path.join(dir,'state.json'), JSON.stringify({agent,event,updatedAt:new Date().toISOString()})); }catch(_){} }
function readBridgePort(){ try{ const raw=fs.readFileSync(path.join(stateDir(),'bridge.json'),'utf8'); const p=parseInt(JSON.parse(raw).port,10); if(p>0) return p; }catch(_){} return DEFAULT_PORT; }
function health(port, timeoutMs){ return new Promise((resolve)=>{ let done=false; const finish=(v)=>{ if(!done){done=true;resolve(v);} }; try{ const req=http.get({host:'127.0.0.1',port,path:'/health',timeout:timeoutMs},(res)=>{res.resume();finish(res.statusCode===200);}); req.on('timeout',()=>{req.destroy();finish(false);}); req.on('error',()=>finish(false)); }catch(_){finish(false);} }); }
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
async function ensureBridge(){
  if(await health(readBridgePort(),400)) return readBridgePort();
  if(await health(DEFAULT_PORT,400)) return DEFAULT_PORT;
  try{ const child=spawn(process.execPath,[path.join(__dirname,'bridge.js')],{detached:true,stdio:'ignore',env:process.env}); child.on('error',()=>{}); child.unref(); }catch(_){ return DEFAULT_PORT; }
  for(let i=0;i<30;i++){ await sleep(100); const p=readBridgePort(); if(await health(p,300)) return p; if(await health(DEFAULT_PORT,300)) return DEFAULT_PORT; }
  return readBridgePort();
}
function appUrl(){ const v=(process.env.CLAUDECHAT_SERVER||process.env.DEVSNAP_SERVER||'').trim(); return v || 'https://devsnap-lozv.onrender.com'; }
function openApp(){ if(process.env.CLAUDECHAT_NO_OPEN || process.env.DEVSNAP_NO_OPEN) return; const url=appUrl(); try{ let child; if(process.platform==='darwin') child=spawn('open',[url],{detached:true,stdio:'ignore'}); else if(process.platform==='win32') child=spawn('cmd',['/c','start','',url],{detached:true,stdio:'ignore'}); else child=spawn('xdg-open',[url],{detached:true,stdio:'ignore'}); child.on('error',()=>{}); child.unref(); }catch(_){} }
const TRANSITIONS={'session-start':'idle',sessionstart:'idle','user-prompt-submit':'busy',userpromptsubmit:'busy',notification:'attention','permission-request':'attention',permissionrequest:'attention',stop:'done','session-end':'idle',sessionend:'idle'};
async function main(){ const rawEvent=String(process.argv[2]||'').trim(); const key=rawEvent.toLowerCase(); if(key==='open'){ await ensureBridge(); openApp(); return; } const agent=TRANSITIONS[key]; if(agent) writeState(agent, rawEvent); }
main().catch(()=>{}).finally(()=>process.exit(0));
