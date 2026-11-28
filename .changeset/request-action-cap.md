---
"@halonicjs/app-studio": patch
---

An agent can file at most 10 action requests in one run. After that, `request_action` refuses and
files nothing, so a looping agent can't fill your inbox.
