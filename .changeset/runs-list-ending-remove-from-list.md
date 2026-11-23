---
"@halonicjs/app-studio": patch
---

`halonic runs` names the ending a finished run reached, so a rejected reply no longer reads as sent. When a run's changes were deleted outside Halonic, `halonic proposals` now says to remove the run from the list, as Remove from Inbox does in Studio, and exits with code 5 instead of 9.
