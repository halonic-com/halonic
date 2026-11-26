---
"@halonicjs/app-studio": patch
---

On Windows, the agent host (`halonic-agent-host.exe`) no longer carries Node's broken signature: it is unsigned, like Halonic's other programs, so Smart App Control and antivirus tools don't flag it as changed after signing.
