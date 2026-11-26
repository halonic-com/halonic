---
"@halonicjs/app-studio": patch
---

The new command halonic build paperclip-plugin builds a Paperclip plugin from the workspace's tools at its current commit, and writes it with a release file that holds its SHA-256 and what changed since the build you name with --since. It never installs anything. It runs from a clone of the Halonic repository: the npm package doesn't include the plugin runtime yet.
