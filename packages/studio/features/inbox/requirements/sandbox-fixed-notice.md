# inbox.sandbox-fixed-notice

- Status: active
- Since: 0.1.0
- Source: HAL-4293, HAL-1709; ux-checklists-sandbox (HAL-1833) 3.5; `inbox.sandbox-row`

Once the sandbox row has been seen as Fixed and you open another row or leave the Inbox, the Inbox shall leave one "fixed" notice in Notices, with its ×, that says the sandbox is ready and each routine that didn't run is run again from its page. A check that passed on another screen (a run page's **Check again**) while routines were refused shall go straight to that notice, with no Fixed row, and a check made on the card itself shall not make a second one. The notice holds nothing but the time of the passing check, is kept in memory only, and is gone on the next load; dismissing it hides it and touches none of the app's kept dismissals. Notices from the app and this one are listed together, newest first.

## Examples

- Given the row says "Fixed" and you open another row,
  when the Inbox loads again,
  then Notices has one "fixed" notice with ×, and the row is gone.
- Given routines were refused and a run page's **Check again** passes while the Inbox is closed,
  when you open the Inbox,
  then Notices has the "fixed" notice and there is no sandbox row.
- Given nothing was refused and a check passes,
  then there is no notice.
- Given a failed-run notice at 06:00 and the fixed notice at 09:00,
  then the fixed notice is listed first.
