# plugin-build.change-list

- Status: active
- Since: unreleased
- Source: HAL-17950 plan rev 1 (the plugin builder), with Liam's conditions on HAL-17985; HAL-17986; the routing from HAL-18263; the signals from HAL-18365

The plugin builder shall list the tools a new snapshot adds and removes compared with the previous build's snapshot, and for each tool in both, the fields whose values differ as canonical JSON, the routing entries (`roles.<role>` or `areas.<area>`) whose agent differs, added or removed ones included, and under `signals` the signal ids the new snapshot adds and removes and those in both whose signal differs as canonical JSON, each list sorted. Without a previous build it shall list every tool and every signal as added and every routing entry as changed. When the routing didn't change, the change list shall have no `routing` field, and when no signal was added, removed or changed, no `signals` field, so a build without `routing.yaml` or signal files gives the same release file as before.

## Examples

- Given no previous build and the tools `b` and `a`, then `added` is `a`, `b`.
- Given a previous build with `a` and `old` and a new snapshot with `a` (another description) and `new`, then `new` is added, `old` removed, and `a` changed in `description`.
- Given a field whose keys only come in another order, then it is not changed.
- Given a previous build whose code reviewer is `liam` and area `docs` is `maya`, and a new one whose code reviewer is `julian` and area `studio` is `elena`, then `routing` is `areas.docs`, `areas.studio`, `roles.code-reviewer`.
- Given the same routing in both builds, or none in either, then the change list has no `routing`.
- Given a previous build with the signals `watcher` and `old` and a new snapshot with `watcher` (other settings) and `new`, then `signals` lists `new` as added, `old` as removed and `watcher` as changed.
- Given the same signals in both builds, or none in either, then the change list has no `signals`.
