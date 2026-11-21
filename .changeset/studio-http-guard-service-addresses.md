---
"@halonicjs/app-studio": patch
---

In Studio, a request the app sends for the page is refused for `100.100.100.100` and `100.100.100.200`, while the rest of `100.64.0.0/10` still counts as a private network.
