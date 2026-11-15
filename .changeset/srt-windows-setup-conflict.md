---
"@halonicjs/adapter-sandbox-srt": patch
---

On Windows, the sandbox check now says `setup-conflict` when srt was installed with loopback open (by another program), instead of `setup-needed`. Halonic doesn't change that machine-wide mode itself, so running the setup again would not fix it.
