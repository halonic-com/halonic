---
"@halonicjs/app-studio": patch
---

When Halonic won't read a workspace's git repository, such as a linked worktree or one whose config sets `include.path`, the CLI says why and how to fix it instead of a problem it can't explain; `halonic schema` replaces a link where a schema file goes instead of writing through it; and `halonic init --example` with a name that isn't an example says so.
