---
"@halonicjs/app-studio": patch
---

On Windows, when the sandbox can't start because Halonic's own Linux system is missing, its setup didn't finish, or another program's sandbox setup is in the way, Settings, the Inbox and the run page now give a fix that works: use Halonic inside WSL 2, try again (or reinstall the Halonic desktop app), or remove the other program's setup. Before, they sent you to Settings to set up the sandbox, which didn't help.
