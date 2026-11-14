#!/usr/bin/env node
'use strict';
/* ClaudeChat status bridge — 127.0.0.1 ONLY.
 * ClaudeChat is ONLINE ONLY: the app and all stories live on the shared
 * server (DEFAULT_SERVER below). This bridge stores nothing and serves no
 * pages. Its single job is to report the local Claude Code status (written
 * by hook.js into <state dir>/state.json) so the hosted app can show the
 * Claude-status ribbon when opened from a machine running the plugin.
 * Endpoints: /health, /status, /mode. Everything else 404s.
 * CORS is open (*) plus the Private-Network-Access header so the hosted
 * https page may read /status from loopback; the payload is only the
 * agent status enum (idle/busy/attention/done), never any user data.
 * Env: CLAUDECHAT_PORT (legacy DEVSNAP_PORT honoured), CLAUDE_PLUGIN_DATA.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

const BASE_PORT = parseInt(process.env.CLAUDECHAT_PORT || process.env.DEVSNAP_PORT, 10) || 37180;
const DEFAULT_SERVER = 'https://devsnap-lozv.onrender.com';
function appServer() { const v = (process.env.CLAUDECHAT_SERVER || process.env.DEVSNAP_SERVER || '').trim(); return v || DEFAULT_SERVER; }
function stateDir() { return process.env.CLAUDE_PLUGIN_DATA || path.join(os.homedir(), '.claudechat'); }
function readAgent() {
  try {
    const st = JSON.parse(fs.readFileSync(path.join(stateDir(), 'state.json'), 'utf8'));
    const ok = ['idle', 'busy', 'attention', 'done'];
    return ok.includes(st.agent) ? st.agent : 'idle';
  } catch (_) { return 'idle'; }
}
function send(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Private-Network': 'true',
    'Cache-Control': 'no-store'
  });
  res.end(body);
}
const server = http.createServer((req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': '*',
      'Access-Control-Allow-Private-Network': 'true',
      'Content-Length': '0'
    });
    res.end();
    return;
  }
  const url = (req.url || '/').split('?')[0];
  if (req.method !== 'GET') { send(res, 405, { error: 'method not allowed' }); return; }
  if (url === '/health') { send(res, 200, { ok: true }); return; }
  if (url === '/status') { send(res, 200, { agent: readAgent() }); return; }
  if (url === '/mode') { send(res, 200, { mode: 'online', server: appServer() }); return; }
  send(res, 404, { error: 'not found — ClaudeChat is online only; the app lives at ' + appServer() });
});
function listen(port, attempt) {
  const onErr = (e) => {
    server.removeListener('listening', onOk);
    if ((e.code === 'EADDRINUSE' || e.code === 'EACCES') && attempt < 5) listen(port + 1, attempt + 1);
  };
  const onOk = () => {
    server.removeListener('error', onErr);
    try {
      const dir = stateDir();
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'bridge.json'), JSON.stringify({ port }));
    } catch (_) {}
    console.log('claudechat status bridge listening on http://127.0.0.1:' + port);
  };
  server.once('error', onErr);
  server.once('listening', onOk);
  server.listen(port, '127.0.0.1');
}
listen(BASE_PORT, 0);
