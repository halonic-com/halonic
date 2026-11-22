---
"@halonicjs/app-studio": patch
---

When a fix is saved but not committed, `halonic run`, `halonic runs send` and `halonic routines watch` now say the fix isn't live yet and to commit it or make it live in Halonic Studio, instead of pointing to `halonic validate`, which finds nothing; a watch with no routine that can start says to leave it running; and a mail routine's connector error in Studio says "mailbox" throughout.
