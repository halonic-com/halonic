---
"@halonicjs/app-studio": patch
---

"Local only" counts an HTTP connector as on this computer only when its `http` or `https` URL plainly names `localhost`, `[::1]` or a `127.x.y.z` address, and an integration setting whose host is an address written in hex is refused.
