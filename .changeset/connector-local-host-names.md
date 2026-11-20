---
"@halonicjs/format": patch
---

An `http` connector without a `local` key now counts as local only at `localhost`, `[::1]` or a `127.x.x.x` address, the same hosts the connection itself keeps on this computer. Other host names, such as `tools.localhost`, count as outside under `privacy.localOnly`; set `local: true` on the connector if it really runs on your machine.
