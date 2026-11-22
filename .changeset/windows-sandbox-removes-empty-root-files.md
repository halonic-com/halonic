---
"@halonicjs/app-studio": patch
---

On Windows, when the last sandboxed run in a project folder ends, Halonic removes the empty settings files, such as `.npmrc`, `.mcp.json` and `.pre-commit-config.yaml`, that the sandbox made when the run started. A file that was there before, or that has content, stays.
