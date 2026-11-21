---
"@halonicjs/app-studio": patch
---

Loading a workspace no longer reads the folders Claude Code and Codex agents work in, or any `node_modules` folder, and `halonic extract` no longer copies `node_modules` folders into the new workspace.
