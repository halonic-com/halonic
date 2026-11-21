---
"@halonicjs/app-studio": patch
---

The CLI no longer reads the folders Claude Code and Codex agents work in, or any `node_modules` folder, when it checks or loads a workspace (a run that copies the workspace for its agents still copies them), and `halonic extract` no longer copies `node_modules` folders into the new workspace.
