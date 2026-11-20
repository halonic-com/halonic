---
"@halonicjs/events": patch
"@halonicjs/engine": patch
"@halonicjs/adapter-workspace-models": patch
---

`llm.request` has an optional `address`: the `host:port` of a provider on this computer, such as `localhost:11434`, never a URL, path or user name. `llm.fallback` names the model it moved to with an optional `provider`, `model`, `alias` and `address`. The workspace's model resolver works out the address, and logs written before read as before.
