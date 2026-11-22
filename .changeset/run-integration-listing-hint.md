---
"@halonicjs/app-studio": patch
---

When an integration's connector can't list its tools, `halonic run` now suggests `halonic doctor`, which checks the sandbox and trust the integration needs, instead of `halonic tools review`, which can't say why.
