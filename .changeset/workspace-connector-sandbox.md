---
"@halonicjs/app-studio": patch
---

A program connector's `inheritEnv` is refused when the program starts in a sandbox, because the sandbox gives it only its own `env` and secrets. A connector can now name the sites it may reach with `sites`, and `halonic trust` lists them.
