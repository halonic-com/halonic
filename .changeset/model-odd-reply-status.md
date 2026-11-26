---
"@halonicjs/app-studio": patch
---

When Anthropic or an OpenAI-compatible server, or a proxy in front of it, answers with an unusual status or status text, the call now fails with the usual explanation, such as "was busy", instead of saying the call was refused.
