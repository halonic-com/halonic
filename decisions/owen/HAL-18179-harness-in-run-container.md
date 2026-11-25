# Decision: the session settings writer's shell tests run only on POSIX

- Approval: Paperclip task HAL-18179 (B1b-1, design approved on HAL-18239); the approver signs this note in review
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:R94QDV/mqI9NNMYUGl51Dd9VZ2VK0X8Xj9jTFtXLjAuh+qOg+Go5QIuWZVdBwOehuFULr5VTUEuUhFWf0UtmDA==

`sessionSettingsFolder` runs fixed `sh` scripts on the POSIX paths of the run's Linux container. Its round-trip tests run those scripts for real, on this computer's paths, so on Windows they can't run: there is no POSIX `sh` on the paths there, and the writer refuses Windows paths by design. Those six tests run only where the platform isn't `win32` (`it.runIf`), as the `coding-tools` package's shell tests already do.

Nothing about the writer goes untested on Windows that matters there: the writer never runs on Windows. The tests that start no shell run on every OS: the path guard refuses paths outside its two folders or with `..` parts before anything starts, and a script that closes its input early is reported by its own exit code. The Linux and macOS jobs run every test.

## Covers

- packages/adapters/harness-kit/src/session-settings-folder.test.ts
