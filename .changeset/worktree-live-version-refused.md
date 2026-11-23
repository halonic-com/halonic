---
"@halonicjs/app-studio": patch
---

In a folder that keeps its git files outside it, such as a git worktree, Studio no longer runs the saved files: it says it can't read that folder's versions, and gives the `halonic run` command that runs the workflow from that folder in a terminal.
