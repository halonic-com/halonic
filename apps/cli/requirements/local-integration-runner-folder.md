# cli.local-integration-runner-folder

- Status: active
- Since: unreleased
- Source: HAL-16335 (the code a person trusted is the code that runs); builds on `cli.open-local-integration` and `cli.commands.trust.run-version`

When the `halonic` command starts a local integration's runner, it shall read and hash the integration in the folder the runner starts from (the copy of the run's commit, or the workspace folder with history off) and make the trust check of that start on the integrations in that same folder. A saved change that isn't committed shall neither stop an integration whose copy holds the trusted code nor let one start whose copy doesn't. When the copy's code or sheet differs from what was trusted, no runner shall start.

## Examples

- Given a workspace trusted with `halonic trust` and a saved change to an integration's code that isn't committed, when a run starts the integration from its copy of the commit, then the trust check passes and the runner runs the copy's `backend/index.js`.
- Given the same workspace, when the trust check is made on the saved folder in place of the copy, then it doesn't pass.
- Given a copy whose code or sheet differs from the trusted version while the saved folder still matches it, when a run calls the integration's tool, then the call fails and no runner started.
