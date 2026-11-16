# studio.inbox-notices

- Status: active
- Since: 0.2.0
- Source: HAL-1305; inbox.notices-section

The Studio shall give the Inbox, for the open workspace, the failed routine runs in its run logs as notices, without the ones the person dismissed. A dismissal shall be kept on this device, per workspace folder, as the notice's key and nothing else, and shall survive a restart. When storage can't be read or written, a dismissal shall last until the window closes.

## Examples

- Given a routine "Daily summary" whose run failed at 06:00,
  when the Inbox asks for the notices,
  then it gets "Daily summary failed at 06:00".
- Given that notice,
  when the person dismisses it,
  then the Inbox hears of the change and the notice is gone, also in a new window on the same workspace.
- Given the same notice in another workspace folder,
  when the Inbox asks for the notices there,
  then it is still there.
- Given storage that refuses,
  when the person dismisses a notice,
  then it is gone until the window closes.
