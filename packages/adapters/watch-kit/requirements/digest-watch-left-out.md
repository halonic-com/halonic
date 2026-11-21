# watch-kit.digest-watch-left-out

- Status: active
- Since: unreleased
- Source: HAL-13334 plan, PR 3

Where a digest watch is given `leaveOut`, it shall neither read nor report a file that `isLeftOut` leaves out: when it opens, it shall list the workspace with the same `leaveOut`, and it shall ignore a name its event source gives that is left out or lies inside a left-out folder. When it checks every file, it shall list them with the same `leaveOut`. Without `leaveOut`, it shall behave as `watch-kit.digest-watch` says.

## Examples

- Given a watch with `leaveOut: { names: ["node_modules"] }` on `tools/node_modules/x.js` and `workspace.yaml`,
  when it opens,
  then it reads only `workspace.yaml`.
- Given the same watch,
  when `node_modules/x.js` and `workspace.yaml` change and the source names `node_modules/x.js`, `Node_Modules` and `""`,
  then the listener gets only `workspace.yaml changed`, and nothing under `node_modules` is read.
