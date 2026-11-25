# paperclip.chief-line

- Status: active
- Since: unreleased
- Source: the board's request for a direct line from the board supervisor (later Halonic Studio) to Chief, with a reply signal instead of polling

While the chief line is on (`chiefLine.enabled`), when a signed-in board user calls the Agent tools plugin's `POST /chief-line/thread`, `GET /chief-line/thread` or `POST /chief-line/subscribe` route for a caller whose name matches `^[a-z0-9][a-z0-9-]{0,40}$`, the plugin shall find or create one task per caller titled `[chief-line] <caller>`, assigned to Chief, in the project `chiefLine.projectId`, and answer its id and identifier so the caller posts there as its own Paperclip user through the normal comments API; answer the thread's comments after `since`; and keep a webhook only when its host is in `chiefLine.webhookHosts`. When a comment is created on a caller's chief-line task, the plugin shall wake Chief for a comment by anyone else, at most `chiefLine.maxPerHour` times per caller in the last hour, and for a comment by Chief shall POST `{thread, caller, commentId, at}`, never the comment's body, to the caller's webhook, retrying once and then logging, never throwing. The plugin shall refuse an agent's key and every call while the line is off.

## Examples

- Given an agent's key,
  when it calls any chief line route,
  then the plugin refuses with 403.
- Given caller `studio` and no thread yet,
  when it calls `POST /chief-line/thread` twice,
  then one task `[chief-line] studio`, assigned to Chief, exists and both calls answer its id.
- Given `maxPerHour` 3,
  when the caller posts four comments on its thread within an hour,
  then Chief is woken for the first three only.
- Given `webhookHosts` `["hooks.acme.test"]`,
  when a caller subscribes `https://evil.test/hook`,
  then the plugin refuses it.
- Given Chief comments "secret answer" on the caller's thread and the webhook answers 500 then 200,
  when the plugin handles the event,
  then it posted `{thread, caller, commentId, at}` twice, with no comment text; Chief's comment on another task and Ravi's comment on the thread send nothing.
