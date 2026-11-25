---
"@halonicjs/app-studio": patch
---

halonic validate now refuses a tool file whose parameters leave out one its action needs, such as pr for github.pull-request, or add one the action never reads, so halonic build paperclip-plugin no longer builds a tool that fails every call.
