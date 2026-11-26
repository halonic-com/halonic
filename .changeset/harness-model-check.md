---
"@halonicjs/app-studio": patch
---

The Model page and `halonic validate` now say when an agent's harness can't use its model: Claude Code and OpenCode use Anthropic models only, Codex only OpenAI's Responses API, and a Codex agent on an OpenAI-compatible provider is asked to check that the endpoint supports it.
