---
"@halonicjs/app-studio": patch
---

A connector's page lists each secret once, says Studio keeps it in its own keychain, which `halonic secret set` doesn't reach, and shows a locked keychain's reason without the keychain's own prefix; on the run page, a "workspace isn't trusted yet" refusal goes once you trust the workspace from the status bar, and the announced refusal includes the command to run.
