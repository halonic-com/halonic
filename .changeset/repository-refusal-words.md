---
"@halonicjs/app-studio": patch
---

When Halonic won't read a workspace's git repository, such as a linked worktree or one whose config sets `include.path`, the CLI now says why and how to fix it, instead of "Halonic ran into a problem it can't explain yet." `halonic schema` now replaces a link where it writes a schema file, instead of writing to the file the link points to. `halonic init --example` with a name that isn't an example says so.
