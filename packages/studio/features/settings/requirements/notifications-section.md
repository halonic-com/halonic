# settings.notifications-section

- Status: active
- Since: unreleased
- Source: HAL-18846 (follow-up from the review of halonic#6181), design revision 3 on HAL-18594 (Runs: Notification settings), approved by the board on 25 Nov 14:48 UTC

The Studio shall show Settings → Notifications, kept on the computer running Halonic, with a group headed "Runs" and the three switches of `runs.run-notification-prefs` in the design's words and order: "When a run fails", "When a run I started finishes" and "When any run finishes". A switch shall be saved by itself when it is turned. When a save fails, the Studio shall put the switch back, say "Couldn't save "When a run fails" on this computer." (with that switch's words) under it, and say it in the dialog with whether it is back on or off. When the computer's settings couldn't be read, the section shall say "Couldn't load the notification settings" with Try again, as Settings → Assistant does. Until the background service shows run notifications (HAL-18845), the section shall stay hidden with the other unfinished settings (`unfinished.ts`).

## Examples

- Given nothing is saved, when Notifications shows,
  then "When a run fails" and "When a run I started finishes" are on and "When any run finishes" is off.
- Given Notifications shows, when "When any run finishes" is turned on,
  then it is saved on, and the run notifications read it on.
- Given saving fails, when "When a run fails" is turned off,
  then it is on again and the dialog says "Couldn't save "When a run fails" on this computer. It's back on."
