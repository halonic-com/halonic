---
"@halonicjs/app-studio": patch
---

The agent host checks a workspace connector's trust itself before it starts the program, with or without a sandbox. It reads the trust record in the profile and refuses a connector that record doesn't hold.
