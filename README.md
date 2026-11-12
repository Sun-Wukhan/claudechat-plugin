# DevSnap

Snapchat-like stories for devs, inside Claude Code. Post screenshots, selfies and photos while Claude is running, and view other devs' stories in a story-ring feed. Stories auto-expire after 24 hours.

> DevSnap is NOT affiliated with Snap Inc. and does not use Snapchat's API. It is an independent, Snapchat-*style* stories network for developers who install this plugin.

## Install

In Claude Code, run these commands **with the leading slashes** — the slash is what makes them Claude Code commands instead of chat messages:

```
/plugin marketplace add Sun-Wukhan/devsnap-plugin
/plugin install devsnap@devsnap
```

Then open it:

```
/snap
```

`/snap` starts the local bridge (127.0.0.1 only) if needed and opens DevSnap in your default browser. Lifecycle hooks never open a window on their own — opening only happens on `/snap`.

Local development without GitHub: `/plugin marketplace add ./path/to/devsnap-plugin` also works.

## Usage

- Set your handle (1–24 chars: letters, numbers, `_`, `.`, `-`) at the top.
- Story rings at the top: "Your story" first, then one ring per dev. Unviewed rings are coloured, viewed rings are grey.
- Tap a ring to open the full-screen viewer: progress bars, tap left/right to navigate, auto-advance every 5s, ❤️ to like locally.
- Composer: click, drag-and-drop, or paste (Ctrl+V) a screenshot. Pick Screenshot / Selfie / Photo, add a caption (max 200 chars), and post.

**Warning strip in the composer is real: check your screenshot for secrets — `.env` files, tokens, keys, private URLs — before posting.**

## Local vs shared mode

By default the bridge runs a **local-only** store: stories live in `<CLAUDE_PLUGIN_DATA or ~/.devsnap>/stories.json` and are only visible on your own machine.

To see **other devs'** stories, run (or deploy) the shared server and point the bridge at it:

```bash
export DEVSNAP_SERVER=https://your-devsnap-server.example.com
```

The bridge then proxies all `/api/*` calls to that server. Everyone whose bridge points at the same server sees the same feed.

## Deploy the shared server (Render)

`server/server.js` is a zero-dependency Node server:

- Start command: `node server/server.js`
- It reads `PORT` from the environment (Render sets this automatically) and binds `0.0.0.0`.
- `GET /` on the deployed server serves the same DevSnap UI directly, so a deployed server is usable in a browser without the plugin.
- Storage is **MVP storage**: in-memory, persisted best-effort to `server/stories.json`. It is not a database — restarts on ephemeral filesystems can lose stories, and it will not scale beyond a small group. That's intentional for the MVP.

## Environment variables

| Variable | Used by | Default | Meaning |
|---|---|---|---|
| `DEVSNAP_PORT` | bridge / hook | `37180` | Preferred local bridge port (tries +1…+5 if busy) |
| `DEVSNAP_NO_OPEN` | hook | unset | If set, `open` starts the bridge but never opens a browser |
| `DEVSNAP_SERVER` | bridge | unset | URL of a shared server; enables shared mode |
| `PORT` | shared server | `37181` | Port the shared server binds |

## Privacy & safety

- Stories auto-expire 24 hours after posting.
- Screenshots can leak secrets. Review every image before posting.
- **MVP has no authentication.** Handles are self-claimed — anyone who can reach a shared server can post as any handle, view everything, and (if they know a story id and claim its handle) delete stories. Do not run a public server for strangers without adding auth first. Keep shared servers to people you trust, or behind a private network / VPN.
- The local bridge binds `127.0.0.1` only. Hook scripts never read Claude's stdin payload and store only `{agent, event, updatedAt}` in `state.json`.

## Develop / test

```bash
node tests/devsnap.test.js
node server/server.js          # shared server on :37181
node plugins/devsnap/scripts/bridge.js   # local bridge on :37180
```

Zero npm dependencies everywhere; Node >= 18.
