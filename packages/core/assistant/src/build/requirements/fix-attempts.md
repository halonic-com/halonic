# assistant.build.fix-attempts

- Status: active
- Since: unreleased
- Source: HAL-19174 (I7 PR 4a, HAL-18391 plan rev 2 section 2.4, with Liam's conditions of 26 Nov); the stop line from Chief on HAL-19173

When the host gives a Build chat its fix attempts, an Accept of one of that chat's changes to the folder of the local integration the chat is about shall count as one fix attempt, pending until the integration's next call. The attempt shall fail when a later call fails with any kind of trouble; a failure whose error kind is `unauthenticated` or `limit_reached`, or whose newest request got a `401` or `429`, shall not count. A Reject or an Undo shall count nothing. The count shall be kept with the chat, outside the workspace, so a new chat starts at zero and no workspace file can reset it. After two failed attempts, `propose_file` and `propose_delete` on a path in that folder, and `read_request_log`, shall change and read nothing and answer the stop result, which holds the stop line; a path outside the folder can still be proposed. The count is a loop guard for the model, not a security boundary.

## Examples

- Given a chat about `notes` whose fix to `integrations/notes/backend/index.js` was accepted,
  when the next call fails with a changed reply,
  then the chat has one failed fix.
- Given the same accepted fix,
  when the next call fails after a `401`,
  then the chat has no failed fix and the attempt stays pending.
- Given two failed fixes,
  when the model proposes `integrations/notes/backend/index.js`,
  then nothing is written and the answer is the stop result.
- Given two failed fixes,
  when the model proposes `library/skills/notes-help.md`,
  then it becomes a change to review.
