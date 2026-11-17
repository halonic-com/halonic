# studio.inbox-notices

- Status: active
- Since: unreleased
- Source: HAL-1305; inbox.notices-section; HAL-11190

The Studio shall give the Inbox, for the open workspace, the failed routine runs in its run logs as notices, without the ones the person dismissed, each named by its routine, or by its workflow when the routine is gone. A dismissal shall be kept on this device, per workspace folder, as the notice's key and nothing else, and shall survive a restart. A dismissal shall not undo what another window of the same workspace dismissed, and a dismissal whose notice is gone shall be forgotten. When storage can't be read or written, a dismissal shall last until the window closes.

## Examples

- Given a routine "Daily summary" whose run failed at 06:00,
  when the Inbox asks for the notices,
  then it gets "Daily summary failed at 06:00".
- Given that run's routine is gone from the files,
  when the Inbox asks for the notices,
  then the notice names the run's workflow, not the routine's key.
- Given that notice,
  when the person dismisses it,
  then the Inbox hears of the change and the notice is gone, also in a new window on the same workspace.
- Given the same notice in another workspace folder,
  when the Inbox asks for the notices there,
  then it is still there.
- Given storage that refuses,
  when the person dismisses a notice,
  then it is gone until the window closes.
- Given two windows on the same workspace that each dismiss a different notice,
  when both have dismissed,
  then a new window shows neither.
- Given a dismissed notice that is no longer in the run logs,
  when the Inbox asks for the notices,
  then its key is no longer stored.
