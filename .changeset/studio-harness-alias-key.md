---
"@halonicjs/app-studio": patch
---

In Studio, a Claude Code or Codex agent whose `model` is a `models.yaml` alias now calls that alias's provider with its saved key, after the same trust and allowed-address checks as any other model call.
