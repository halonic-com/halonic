# cli.open-plugin-backend

- Status: active
- Since: 0.1.0
- Source: HAL-8089 (start local integrations and plugin backends from the run host); the start's trust check is `app.plugin-backend`, the runner is the one `cli.open-local-integration` starts

When the `halonic` command opens a plugin's backend for a run, it shall start its runner only after the plugin's folder in the profile's plugins folder, read again at every start, is trusted for exactly the files and manifest in it, and the start gate allows a sandbox; the check shall never be reused from an earlier start, the restart after an idle stop included. The runner shall run the plugin's `backend.entry` and use its `default` export, with the plugin's saved settings and the names its secrets are stored under. Right before the runner starts, the folder shall still hold the files the trust check hashed. When the plugin at a start is not the one the loader read first, the call shall tell the person to start the run again; when the files differ from the trust check's, when the check or the gate refuses, or when the built runner is missing, no runner shall start and the call that needed the backend shall fail with the reason. Nothing of the plugin's code shall load in the command's own process.

## Examples

- Given a trusted plugin, when a run calls its tool, then the runner runs `backend/index.js` and its answer is returned.
- Given a plugin that was never trusted, when a run calls its tool, then the call fails and no runner started.
- Given a trusted plugin whose file changed afterwards, when a run calls its tool, then the call fails and no runner started.
- Given a run whose backend started and was closed, when a plugin file is edited and the tool is called again, then the second start is refused and no second runner starts.
- Given Windows, where the fence isn't there and the user hasn't confirmed running without it, when a run calls the tool, then the call fails naming `windows` and no runner started.
- Given a package that isn't built, when a run calls the tool, then the call fails with "the integration runner isn't built".
