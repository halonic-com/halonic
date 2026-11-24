---
"@halonicjs/app-studio": patch
---

A workspace connector starts without the sandbox only when this computer has no sandbox, and Halonic now says so each time it does. When the sandbox check fails for another reason, such as a timeout, it is tried once more, and then the connector doesn't start and says why.
