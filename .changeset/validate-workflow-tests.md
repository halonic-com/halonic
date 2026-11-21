---
"@halonicjs/app-studio": patch
---

`halonic validate` now checks workflow tests: a mocked agent or an expected step the workflow doesn't have is an error with "Did you mean", and a mocked choice reply that isn't one of the agent's options is a warning.
