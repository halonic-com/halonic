# paperclip.chief-line

- Status: active
- Since: unreleased
- Source: the board's request for a direct line from the board supervisor (later Halonic Studio) to Chief, with a reply signal instead of polling

While the chief line is on (`chiefLine.enabled`), when a signed-in board user calls the Agent tools plugin's `POST /chief-line/thread`, `GET /chief-line/thread` or `POST /chief-line/subscribe` route for a caller whose name matches `^[a-z0-9][a-z0-9-]{0,40}$`, the plugin shall use the caller's stored thread only while that task is still titled exactly `[chief-line] <caller>`, not cancelled and in the project `chiefLine.projectId`, else the newest such task (callers, such as the board, may create it themselves), else create one assigned to Chief there; store it, and answer its id and identifier so the caller posts there as its own Paperclip user through the normal comments API; answer the thread's comments after `since`; and keep a webhook only when its host is in `chiefLine.webhookHosts`. When a comment is created on a task in `chiefLine.projectId` that is not cancelled and is titled exactly `[chief-line] <caller>` (the caller is read from the title, not from the stored thread), the plugin shall wake Chief for a comment by anyone else, at most `chiefLine.maxPerHour` times per caller in the last hour, and for a comment by Chief shall POST `{thread, caller, commentId, at}`, never the comment's body, to the caller's webhook, retrying once and then logging, never throwing. The plugin shall refuse an agent's key and every call while the line is off.

## Examples

- Given an agent's key,
  when it calls any chief line route,
  then the plugin refuses with 403.
- Given caller `studio` and no thread yet,
  when it calls `POST /chief-line/thread` twice,
  then one task `[chief-line] studio`, assigned to Chief, exists and both calls answer its id.
- Given the stored thread of `sup` was cancelled and renamed, and the board created a new `[chief-line] sup` task,
  when Chief comments on the new task,
  then `sup`'s webhook gets the signal for it, and `POST /chief-line/thread` answers the new task.
- Given `maxPerHour` 3,
  when the caller posts four comments on its thread within an hour,
  then Chief is woken for the first three only.
- Given `webhookHosts` `["hooks.acme.test"]`,
  when a caller subscribes `https://evil.test/hook`,
  then the plugin refuses it.
- Given Chief comments "secret answer" on the caller's thread and the webhook answers 500 then 200,
  when the plugin handles the event,
  then it posted `{thread, caller, commentId, at}` twice, with no comment text; Chief's comment on another task and Ravi's comment on the thread send nothing.
