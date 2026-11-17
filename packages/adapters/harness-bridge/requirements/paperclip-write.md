# harness-bridge.paperclip-write

- Status: active
- Since: unreleased
- Source: HAL-3107 (step 3 of HAL-3023, plan section 4.5); follows `harness-bridge.github-write`

The Node bridge shall offer, as `BridgeTools` the engine can serve at `/mcp` under the rules of `harness-bridge.mcp`, two tools that write to one Paperclip task fixed when the tools are made: `paperclip_post_comment`, which takes a `body`, and `paperclip_set_status`, which takes a `status` of `todo`, `in_progress`, `in_review`, `blocked` or `done`. The program shall never name the task or the Paperclip address. The tools shall make only a `POST` to the task's `comments` path or a `PATCH` to the task's path, to the address given when the tools were made, and shall not follow a redirect. They shall offer no way to reassign, cancel, delete or create a task, and an argument they don't list shall get an error result.

Writing is outward-facing, so the check of a call to either tool shall be `ask`, which sends it to a person under `harness-bridge.approvals`, when its arguments are acceptable, and `refused`, without asking anyone, when they are not. A body is text of 1 to 20,000 characters. The check of any other tool name shall be `refused`. The call shall run the same checks again before it writes.

The key shall be read from the `Secrets` port, by the secret's name, on each call, and shall go only in the `authorization` header of the call to Paperclip. It is meant to be a short-lived key that can write to this one task. A secret that isn't set, can't be read or can't go in a header gets an error result that names the secret. No result, error or event shall contain the key, Paperclip's error text or a network failure's own text. The result of a call that worked shall hold the task's or comment's `id` and, for a status change, the new `status`.

## Examples

- Given acceptable arguments,
  when the bridge checks `paperclip_post_comment`,
  then the answer is `ask`.
- Given a `status` of `cancelled`,
  when the bridge checks `paperclip_set_status`,
  then it is refused and no one is asked.
- Given an approved status change to `in_review`,
  when the tool runs,
  then Paperclip was sent one `PATCH` to the task with only the status.
- Given Paperclip answers 500,
  when the tool answers,
  then the result is an error that names the status and none of Paperclip's words.
