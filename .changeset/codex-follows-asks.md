---
"@halonicjs/app-studio": patch
---

Codex agents now follow `asks`: a Codex agent without `asks: in-sandbox` asks before nearly every command, even inside the sandbox, so an unattended `halonic run` waits for an answer; give the agent `asks: in-sandbox` to let it work on its own inside the sandbox.
