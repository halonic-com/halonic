---
"@halonicjs/app-studio": patch
---

The workspace trust check lets you allow its integrations to run without the sandbox on this computer, as the plugin check does. On Windows with the WSL sandbox, the `halonic` command's refusal no longer tells you to trust the workspace in Studio, because a yes given in Studio doesn't reach the command there.
