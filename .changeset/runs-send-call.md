---
"@halonicjs/app-studio": patch
---

`halonic runs send` now takes `--call <id>` to answer only that approval. A run that waits for approvals lists each one's call id, and the answer command it suggests names the oldest's, so running that command twice no longer answers the next approval.
