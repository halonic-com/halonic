# studio.installer-rollback-skipped-says

- Status: active
- Since: unreleased
- Source: HAL-16570 (C724-2, from the review of HAL-16523)

When an update that didn't start within its wait stays on the newer version instead of going back to the version before, because Windows raised the installer to administrator rights or because the rollback guard refused, the Windows installer shall show a message that says why, how to go back and where `updates.log` is, unless the update is silent. A silent update shall show nothing and keep its line in `updates.log`.

## Examples

- Given the installer template,
  when an update raised to administrator rights skips going back,
  then it shows the reason before it returns, as well as writing it to `updates.log`.
- Given the installer template,
  when the rollback guard refuses going back,
  then it shows the reason before it returns, as well as writing it to `updates.log`.
- Given a silent update,
  when going back is skipped,
  then the installer shows no message.
