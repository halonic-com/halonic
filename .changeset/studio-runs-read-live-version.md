---
"@halonicjs/app-studio": patch
---

In a workspace with versions, Studio's Run, Run now, the Inbox form and routines now start from the live version, as `halonic run` does. A saved change isn't used until you make it live, except connector programs and a harness agent's skills, which are still read as saved. While nothing is live yet, Run says so.
