---
"@halonicjs/app-studio": patch
---

With `users.mode: many` in `deployments.yaml`, `halonic validate` now refuses a Claude Code or Codex agent that has no provider key, because other people's runs would use your own sign-in; deploying such a deployment, or starting such an agent's run in it, stops with the same `users-many-subscription` code.
