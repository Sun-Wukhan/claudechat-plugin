# ClaudeChat

Stories for devs, inside Claude Code. Post screenshots, selfies and photos while Claude is running, and view other devs' stories in a story-ring feed. **Stories auto-expire after 2 hours.**

> ClaudeChat is NOT affiliated with Snap Inc. or Anthropic. It is an independent, Snapchat-*style* stories network for developers who install this plugin. (It launched as "DevSnap" and was renamed to ClaudeChat in v0.2.0.)

## Install

In Claude Code, run these commands **with the leading slashes** — the slash is what makes them Claude Code commands instead of chat messages:

```
/plugin marketplace add Sun-Wukhan/claudechat-plugin
/plugin install claudechat@claudechat
```

Then open it:

```
/claudechat
```

`/claudechat` opens the **online app** in your default browser (and starts the tiny local status bridge if needed — see below). Lifecycle hooks never open a window on their own — opening only happens on `/claudechat`.

## Usage

- Set your handle (1–24 chars: letters, numbers, `_`, `.`, `-`) at the top.
- Story rings at the top: "Your story" first, then one ring per dev. Unviewed rings are coloured, viewed rings are grey.
- Tap a ring to open the full-screen viewer: progress bars, tap left/right to navigate, auto-advance every 5s, ❤️ to like locally.
- Composer: tap, drag-and-drop, or paste (Ctrl+V) a screenshot or photo. Photos are **automatically downscaled and compressed in the browser before upload** (max 1600px, JPEG) — full-res phone photos are several MB and would otherwise be rejected. Pick Screenshot / Selfie / Photo, add a caption (max 200 chars), and post.
- Everything disappears **2 hours** after posting.

**The warning strip in the composer is real: check your screenshot for secrets — `.env` files, tokens, keys, private URLs — before posting.**

## Online only

ClaudeChat has **no local mode**. The app and every story live on the shared server:

- Default server: https://devsnap-lozv.onrender.com (the URL keeps the old DevSnap name; renaming it would break existing installs). Open it in any browser — the server serves the full app.
- Everyone pointing at the same server sees the same feed of stories from other devs.
- Free-tier caveat: the server sleeps when idle, so the first request after a quiet period can take ~50s to wake it. If ClaudeChat looks empty or slow on first open, wait a moment and refresh.

The plugin's local bridge is **not** a server for the app: it stores nothing and serves no pages. Its only job is reporting your Claude Code status (busy / attention / done) from `127.0.0.1:37180`, so when you open the hosted app on a machine running the plugin, the page can show the Claude-status ribbon and badge. If the bridge isn't running — or you just open the site in a browser — the app works exactly the same, minus the ribbon.

To run against a **different** server (your own — see below), set:

```bash
export CLAUDECHAT_SERVER=https://your-server.example.com
```

Check a running bridge at `GET /mode` (e.g. http://127.0.0.1:37180/mode) — it reports `{mode: "online", server}`.

## Deploy your own shared server (Render)

`server/server.js` is a zero-dependency Node server. This repo's `render.yaml` defines one free web service (its Render service name is still `devsnap` from the original launch — renaming it would change the URL, so it stays):

- Start command: `node server/server.js`
- It reads `PORT` from the environment (Render sets this automatically) and binds `0.0.0.0`.
- `GET /` on the deployed server serves the same ClaudeChat UI directly, so a deployed server is usable in a browser without the plugin.
- Storage is **MVP storage**: in-memory, persisted best-effort to `server/stories.json`. It is not a database — restarts on ephemeral filesystems can lose stories, and it will not scale beyond a small group. That's intentional for the MVP (and matters less with a 2-hour expiry).

## Environment variables

| Variable | Used by | Default | Meaning |
|---|---|---|---|
| `CLAUDECHAT_PORT` | bridge / hook | `37180` | Preferred status-bridge port (tries +1…+5 if busy) |
| `CLAUDECHAT_NO_OPEN` | hook | unset | If set, `open` starts the bridge but never opens a browser |
| `CLAUDECHAT_SERVER` | bridge / hook | `https://devsnap-lozv.onrender.com` | The online app URL `/claudechat` opens and the bridge reports |
| `PORT` | shared server | `37181` | Port the shared server binds |

Legacy `DEVSNAP_PORT` / `DEVSNAP_NO_OPEN` / `DEVSNAP_SERVER` are still honoured as fallbacks.

## Privacy & safety

- Stories auto-expire 2 hours after posting.
- Screenshots can leak secrets. Review every image before posting.
- **MVP has no authentication.** Handles are self-claimed — anyone who can reach a shared server can post as any handle and view everything. Do not run a public server for strangers without adding auth first.
- The status bridge binds `127.0.0.1` only and exposes nothing but the Claude status enum (idle/busy/attention/done). Hook scripts never read Claude's stdin payload and store only `{agent, event, updatedAt}` in `state.json`.

## Develop / test

```bash
node tests/claudechat.test.js
node server/server.js          # shared server on :37181
node plugins/claudechat/scripts/bridge.js   # status bridge on :37180
```

Zero npm dependencies everywhere; Node >= 18.
