---
"@halonicjs/app-studio": patch
---

On Windows, a sandboxed run of the CLI no longer loses access to its folders when Studio starts on the same computer at the same time, and only one of them cleans up what crashed sandbox sessions left.
