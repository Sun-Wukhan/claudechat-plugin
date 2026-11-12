---
description: Open DevSnap — dev stories while Claude works
allowed-tools: Bash
---

Run exactly this command using the Bash tool, and nothing else:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/hook.js" open
```

That invocation makes sure the local DevSnap bridge is running and
opens DevSnap in the user's default browser. After running it, briefly
confirm to the user that DevSnap is opening. Do not run any other
commands, read any files, or do any other work for this command.
