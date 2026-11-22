---
"@halonicjs/app-studio": patch
---

When a routine has no runs yet, its Runs view now says why it won't start on its own (it can't start, it's off, or it's paused until you trust the workspace) instead of giving a next time it won't keep. A start refused because the workflow or agent isn't in the workspace now says so, and Run now on a routine that is off says it stays off.
