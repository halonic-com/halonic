---
"@halonicjs/app-studio": patch
---

When a service refuses an integration's call (a token it doesn't accept, a token without permission, a request to slow down, or a host the integration doesn't list), the run's step in Studio and in `halonic runs show` now says which one and what to do next.
