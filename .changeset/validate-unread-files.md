---
"@halonicjs/app-studio": patch
---

`halonic validate` now warns about files Halonic doesn't read because of their name or folder, such as `models.yml` or a `hub.yaml` outside `hubs/`, and says what to rename or move them to. `halonic run` points to `halonic validate` when it skipped such files.
