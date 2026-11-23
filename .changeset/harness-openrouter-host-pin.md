---
"@halonicjs/app-studio": patch
---

A Claude Code or Codex agent whose model alias is at OpenRouter now runs on the hosts the alias's `params.extra.provider` pins, the run log's `llm.request` shows that pin, and a models file whose pin has an unknown key or a wrong type no longer loads.
