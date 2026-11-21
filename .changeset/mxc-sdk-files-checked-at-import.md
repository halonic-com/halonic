---
"@halonicjs/app-studio": patch
---

The downloaded MXC SDK is checked file by file against the hashes written when it was unpacked, each time it is imported. A changed, missing or added file makes it count as not downloaded, and the next download puts it back.
