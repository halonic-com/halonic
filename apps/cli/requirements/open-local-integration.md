# cli.open-local-integration

- Status: active
- Since: 0.1.0
- Source: HAL-8089 (start local integrations and plugin backends from the run host); the factory is `cli.integration-connector-factory`

When the `halonic` command opens a local integration for a run, it shall start its runner only after the workspace's trust check, made again at every start, covers the integration's folder as it is on disk then, and the start gate allows a sandbox; the check shall never be reused from an earlier start, the restart after an idle stop included. The runner shall run `backend/index.js` in the integration's folder and use its `default` export. When the check or the gate refuses, or the built runner is missing, no runner shall start and the call that needed the integration shall fail with the reason. Nothing of the integration's code shall load in the command's own process.

## Examples

- Given a trusted integration, when a run calls its tool, then the runner runs `backend/index.js` and its answer is returned.
- Given a folder whose file changed after the workspace was trusted, when a run calls its tool, then the call fails and no runner started.
- Given a run whose integration started and was closed, when a file in its folder is edited and the integration is called again, then the second start is refused and no second runner starts.
- Given Windows, where the fence isn't there and the user hasn't confirmed running without it, when a run calls the tool, then the call fails naming `windows` and no runner started.
- Given a package that isn't built, when a run calls the tool, then the call fails with "the integration runner isn't built".
