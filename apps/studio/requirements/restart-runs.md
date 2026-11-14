# studio.restart-runs

- Status: active
- Since: 0.1.0
- Source: HAL-1295 (4); flow-install-update 4.5 (HAL-1114); ux-checklists-install 3.6 (HAL-1151)

The Studio app shall tell the restart dialog how many runs a restart would stop and how many of those wait for the person, counting only runs the window itself runs. While the window starts no run and no agent session, the app shall report none, so Restart to update asks nothing and restarts at once.

## Examples

- Given the window has started no run,
  when the restart dialog asks how many runs a restart stops,
  then it hears none running and none waiting for the person.
