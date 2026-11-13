---
description: Open ClaudeChat — dev stories while Claude works
allowed-tools: Bash
---

Run exactly this command using the Bash tool, and nothing else:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/hook.js" open
```

That invocation makes sure the local ClaudeChat bridge is running and
opens ClaudeChat in the user's default browser. After running it, briefly
confirm to the user that ClaudeChat is opening. Do not run any other
commands, read any files, or do any other work for this command.
