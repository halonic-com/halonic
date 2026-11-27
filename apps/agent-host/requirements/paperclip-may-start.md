# agent-host.paperclip-may-start

- Status: active
- Since: unreleased
- Source: HAL-20278 (A2), HAL-20292; the security reviewer's conditions for the shell handing the kept Paperclip key back when a workspace opens

The agent host shall count a workspace as one that may start a run only when the trust check the engine runs before a run starts answers `trusted` or `not-needed` for it, read at that request from the workspace's files and the trust records of the profile the shell named with `--profile-folder`. If that check answers anything else, or reading the workspace or its trust record fails, then the workspace shall count as one that may not start a run. The agent host shall take nothing from the request for that answer: no version and no grant to compare. When Studio lists a workspace's connections with `POST /v1/paperclip/connections` and the body holds `mayStart: true`, the agent host shall add `mayStart`, `true` or `false` by that rule, to the answer. Where the body doesn't hold `mayStart: true`, the answer shall hold no `mayStart` and the agent host shall run no trust check for it. Where the agent host has no profile folder, `mayStart` shall be `false`.

## Examples

- Given Acme as it is, local only and reaching only the test model, with `connections/paperclip/halonic.yaml` and no trust record,
  when the shell lists its connections with `mayStart: true`,
  then the answer holds `mayStart: true`.
- Given Acme with `localOnly: false` and a connector, and no trust record,
  when the shell asks,
  then the answer holds `mayStart: false`.
- Given that workspace trusted, and then its connector file changed,
  when the shell asks,
  then the answer holds `mayStart: false`.
- Given a trust record that can't be read,
  when the shell asks,
  then the answer holds `mayStart: false`.
- Given Settings › Connections listing the connections without `mayStart`,
  when the host answers,
  then the answer holds no `mayStart` and no trust check ran.
