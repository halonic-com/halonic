---
"@halonicjs/app-studio": patch
---

Each Claude Code and Codex run starts from a clean agent settings folder that keeps only Halonic's settings and the agent's sign-in, and a Codex run doesn't start when its working folder or project holds its own `.codex/config.toml`: the error names the file to remove.
