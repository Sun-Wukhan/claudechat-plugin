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

`/claudechat` starts the local bridge (127.0.0.1 only) if needed and opens ClaudeChat in your default browser. Lifecycle hooks never open a window on their own — opening only happens on `/claudechat`.

## Usage

- Set your handle (1–24 chars: letters, numbers, `_`, `.`, `-`) at the top.
- Story rings at the top: "Your story" first, then one ring per dev. Unviewed rings are coloured, viewed rings are grey.
- Tap a ring to open the full-screen viewer: progress bars, tap left/right to navigate, auto-advance every 5s, ❤️ to like locally.
- Composer: tap, drag-and-drop, or paste (Ctrl+V) a screenshot or photo. Photos are **automatically downscaled and compressed in the browser before upload** (max 1600px, JPEG) — full-res phone photos are several MB and would otherwise be rejected. Pick Screenshot / Selfie / Photo, add a caption (max 200 chars), and post.
- Everything disappears **2 hours** after posting.

**The warning strip in the composer is real: check your screenshot for secrets — `.env` files, tokens, keys, private URLs — before posting.**

## Local vs shared mode

**By default the bridge connects to the public shared server** — a fresh install lands straight in the shared feed, no setup needed:

- Shared server: https://devsnap-lozv.onrender.com (the URL keeps the old DevSnap name; renaming it would break existing installs). Also usable directly in a browser — the server serves the same UI.
- Everyone whose plugin points at the same server sees the same feed of stories from other devs.
- Free-tier caveat: the server sleeps when idle, so the first request after a quiet period can take ~50s to wake it. If ClaudeChat looks empty or slow on first open, wait a moment and refresh.

To use a **different** shared server (your own — see below):

```bash
export CLAUDECHAT_SERVER=https://your-server.example.com
```

To opt out of sharing entirely and run **local-only** (stories live in `<CLAUDE_PLUGIN_DATA or ~/.claudechat>/stories.json`, visible only on your own machine):

```bash
export CLAUDECHAT_SERVER=local
```

Check which mode a running bridge is in at `GET /mode` on the bridge (e.g. http://127.0.0.1:37180/mode).

## Deploy your own shared server (Render)

`server/server.js` is a zero-dependency Node server. This repo's `render.yaml` defines one free web service (its Render service name is still `devsnap` from the original launch — renaming it would change the URL, so it stays):

- Start command: `node server/server.js`
- It reads `PORT` from the environment (Render sets this automatically) and binds `0.0.0.0`.
- `GET /` on the deployed server serves the same ClaudeChat UI directly, so a deployed server is usable in a browser without the plugin.
- Storage is **MVP storage**: in-memory, persisted best-effort to `server/stories.json`. It is not a database — restarts on ephemeral filesystems can lose stories, and it will not scale beyond a small group. That's intentional for the MVP (and matters less with a 2-hour expiry).

## Environment variables

| Variable | Used by | Default | Meaning |
|---|---|---|---|
| `CLAUDECHAT_PORT` | bridge / hook | `37180` | Preferred local bridge port (tries +1…+5 if busy) |
| `CLAUDECHAT_NO_OPEN` | hook | unset | If set, `open` starts the bridge but never opens a browser |
| `CLAUDECHAT_SERVER` | bridge | `https://devsnap-lozv.onrender.com` | Shared server URL; `local` (or `off`) = local-only mode, any other URL = that server |
| `PORT` | shared server | `37181` | Port the shared server binds |

Legacy `DEVSNAP_PORT` / `DEVSNAP_NO_OPEN` / `DEVSNAP_SERVER` are still honoured as fallbacks.

## Privacy & safety

- Stories auto-expire 2 hours after posting.
- Screenshots can leak secrets. Review every image before posting.
- **MVP has no authentication.** Handles are self-claimed — anyone who can reach a shared server can post as any handle and view everything. Do not run a public server for strangers without adding auth first.
- The local bridge binds `127.0.0.1` only. Hook scripts never read Claude's stdin payload and store only `{agent, event, updatedAt}` in `state.json`.

## Develop / test

```bash
node tests/claudechat.test.js
node server/server.js          # shared server on :37181
node plugins/claudechat/scripts/bridge.js   # local bridge on :37180
```

Zero npm dependencies everywhere; Node >= 18.
