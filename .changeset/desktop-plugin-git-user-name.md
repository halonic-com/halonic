---
"@halonicjs/app-studio": patch
---

**Settings → Plugins → Add plugin** in the desktop app now refuses an `https://` git address with a user name in it, as `halonic plugin add` does, and for a password it says to leave it out or use an `ssh://` address with a key.
