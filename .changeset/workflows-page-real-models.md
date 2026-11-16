---
"@halonicjs/app-studio": patch
---

A Workflows page run no longer refuses an agent whose model isn't the mock model. The page's model calls already go through the shell, which checks every address and keeps the keys out of the page.
