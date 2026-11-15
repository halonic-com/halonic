# app.save-scheduler

- Status: active
- Since: 0.1.0
- Source: HAL-1293, save model 1.1

The kernel shall save a workspace's unsaved changes 1 second after the last change, so a run of typing is one save. When the user leaves a field, switches tabs, closes the window or presses Ctrl S, the kernel shall save at once and not wait for the pause. If nothing is unsaved, then it shall not ask for a save. If a save that the pause started fails, then the kernel shall report the error and not drop it; if a save asked for at once fails, then its caller shall get the error.

## Examples

- Given a change, then another after 600 ms,
  when 1000 ms pass after the second,
  then one save has run, not two.
- Given a change and a save waiting,
  when the user leaves a field,
  then the save runs at once and the pause ends without a second save.
- Given nothing unsaved,
  when the user presses Ctrl S,
  then no save runs.
- Given a save the pause started that rejects,
  then the error goes to `onError`.
- Given a save asked for by closing the window that rejects,
  then the caller gets the rejection and `flush` does not say everything is saved.
