---
"@halonicjs/app-studio": patch
---

Studio now gives an agent in Claude Code or Codex that runs in the sandbox the key of your workspace's provider, as `halonic run` does, so it no longer runs signed out. The program never sees the key. A provider with its own address doesn't work from Studio yet: the run stops and says so.
