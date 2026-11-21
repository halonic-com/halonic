---
"@halonicjs/app-studio": patch
---

`halonic doctor` now fails with "no model alias default" in a workspace that has no model yet, and `halonic validate` now finds a provider no file has in a hub's model alias or a `provider/model` setting, with "Did you mean", and refuses an artifact name that isn't one file name.
