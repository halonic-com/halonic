---
"@halonicjs/app-studio": patch
---

`halonic runs send` takes `--call <id>` to answer only that approval, and a run waiting for approvals now shows each one's call id and puts the oldest's in the answer command, so typing it twice no longer answers the next approval.
