---
"@halonicjs/events": patch
"@halonicjs/ports": patch
"@halonicjs/engine": patch
---

A run can record that a person answered an approval from a remote device. `SendOptions` takes `by: "remote-device"`, and `approval.resolved` then says `by: "remote-device"` instead of `"person"`. The answer is taken exactly as a card click is: the same call id check, and the first answer wins.
