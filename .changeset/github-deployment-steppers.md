---
"@halonicjs/app-studio": patch
---

Two new GitHub action steppers: approve a deployment that waits for you (it stops if the run is no longer waiting or its commit changed since the request, and the preview names the repository, environment, run, commit and who started it), and set up a deployment environment on GitHub's own settings page, with a check afterwards that it was saved.
