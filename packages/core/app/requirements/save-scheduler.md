# app.save-scheduler

- Status: active
- Since: unreleased
- Source: HAL-1293, save model 1.1

The kernel shall save a workspace's unsaved changes 1 second after the last change, so a run of typing is one save. When the user leaves a field, switches tabs, closes the window or presses Ctrl S, the kernel shall save at once and not wait for the pause. If nothing is unsaved, then it shall not ask for a save. If a save is still writing, then the kernel shall not start another until it ends, and shall then save only what is still unsaved. If a save that the pause started fails, then the kernel shall report the error, and the changes stay unsaved; if a save asked for at once fails, then its caller shall get the error.

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
- Given a save the pause started that is still writing,
  when the user types again and 1000 ms pass,
  then no second save starts until the first ends.
- Given a save the pause started that is still writing,
  when the window closes,
  then `save` is not called again and `flush` resolves after the first save ends.
- Given a save that is still writing and then fails,
  when the user pressed Ctrl S meanwhile,
  then `flush` saves again and does not say everything is saved if that fails too.
- Given the scheduler was disposed,
  when something changes,
  then no save is waiting.
