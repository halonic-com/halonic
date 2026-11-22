---
"@halonicjs/app-studio": patch
---

`halonic run` now says a plugin's backend didn't start because the sandbox can't start on this computer, in the words `halonic plugin list` uses, and points to `halonic doctor`; `halonic plugin add` offers the trust command as "To trust it anyway" when trusting won't turn the plugin on; and a refusal for an untrusted workspace shows its fingerprint once in a terminal.
