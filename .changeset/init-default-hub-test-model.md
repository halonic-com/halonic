---
"@halonicjs/app-studio": patch
---

A new workspace, from `halonic init` or Studio's New workspace, now starts with a hub named Default and the built-in test model (the `models.yaml` alias `default` and `providers/mock.yaml`), so a first agent runs with no key. To use your own model, add its provider and change `default` in `models.yaml`. Studio never adds the test model to a folder that already has its own models.
