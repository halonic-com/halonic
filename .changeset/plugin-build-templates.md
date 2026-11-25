---
"@halonicjs/app-studio": patch
---

`halonic build paperclip-plugin` now puts the workspace's templates (`library/templates/<id>.md`) in the plugin, so agents can read them, and refuses a template file that isn't committed.
