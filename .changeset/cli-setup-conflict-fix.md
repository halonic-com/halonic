---
"@halonicjs/app-studio": patch
---

On Windows, when another program's sandbox setup is in the way, `halonic doctor` and a refused run now say to remove that setup, then set up the sandbox with `halonic sandbox setup` (a refused run adds "and run it again", `halonic doctor` adds that Windows asks for administrator rights once), instead of to use Halonic inside WSL 2.
