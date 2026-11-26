# cli.open-local-integration

- Status: active
- Since: unreleased
- Source: HAL-8089 (start local integrations and plugin backends from the run host); the factory is `cli.integration-connector-factory`; settings from the connector file: HAL-14092; the request log: HAL-19291, `app.integration-request-log`

When the `halonic` command opens a local integration for a run, it shall start its runner only after the workspace's trust check, made again at every start, covers the integration's folder as it is on disk then, and the start gate allows a sandbox; the check shall never be reused from an earlier start, the restart after an idle stop included. The runner shall run `backend/index.js` in the integration's folder and use its `default` export. It shall start with the settings and secret picks of the connector file that names the folder, the same settings the trust check showed, so a `{ fromSetting }` host whose URL changed since the workspace was trusted is refused. When the check or the gate refuses, or the built runner is missing, no runner shall start and the call that needed the integration shall fail with the reason. Nothing of the integration's code shall load in the command's own process. The command shall keep the integration's requests and failed calls in the profile's request log under the key of the workspace folder, also when the runner starts from a copy of a commit, through one store for each profile in the command's process, which every load of every integration shares.

## Examples

- Given a trusted integration, when a run calls its tool, then the runner runs `backend/index.js` and its answer is returned.
- Given a folder whose file changed after the workspace was trusted, when a run calls its tool, then the call fails and no runner started.
- Given a trusted integration whose tool requests a host its sheet doesn't list, when two loads of it call the tool, then both refused requests are in `integration-logs/<workspace key>/<id>.jsonl` in the profile.
- Given the workspace is forgotten while the integration is still loaded, when it makes another request, then the workspace's folder of logs stays gone.
- Given a run whose integration started and was closed, when a file in its folder is edited and the integration is called again, then the second start is refused and no second runner starts.
- Given Windows, where the fence isn't there and the user hasn't confirmed running without it, when a run calls the tool, then the call fails naming `windows` and no runner started.
- Given a sheet whose host is `{ fromSetting: url }` and a connector file with `settings: { url: http://192.168.1.20:3100 }`, when a run calls its tool, then the runner starts with that setting.
- Given a connector file whose `url` changed since the workspace was trusted, when a run calls its tool, then the call fails saying the address from its settings changed, and no runner started.
- Given a package that isn't built, when a run calls the tool, then the call fails with "the integration runner isn't built".
