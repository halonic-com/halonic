# studio.run-notifications-watch

- Status: draft
- Since: unreleased
- Source: HAL-18845, the background watch of `runs.run-notifications` (HAL-18776); Liam's review of halonic#6181; plan approved by Liam on HAL-18907

When a folder opens in the desktop app and the Runs app reads the runs of the workspace and its teams (`services.all-runs`), the app shall start the run notifications (`runs.run-notifications`) over those runs, through the shell's desktop notifications, with the switches saved under Settings › Notifications › Runs read again at every change. An untrusted folder shall start nothing until the person trusts it, so it asks the agent host nothing. A click on one of them shall open Runs. When the folder closes, the watch shall stop and stop listening to the runs. A team agent's run shall never count as one the person started, since Paperclip doesn't say who started it.

## Examples

- Given Acme Ops opens with a run of Nightly report that failed yesterday,
  when a running run of Support reply fails,
  then one notification "Support reply failed" shows, and none for Nightly report.
- Given Acme Ops open, when the folder closes,
  then no later run shows a notification.
