# Decision: the kit checks a service's reply and names only the changed field

- Approval: the plan is HAL-18391 rev 2 (Liam's OK, 26 Nov), the task is HAL-19168, and its reviewer approves this note in review
- Kind: internal
- Task: HAL-19168

## What changes

- `integration-kit.integration-entry` now lists `checkReply` and `ReplyChangedError` among what the integration
  entry offers. The entry still imports no outside code: `checkReply` takes any schema with Zod's `safeParse`, as
  `runTool` does.
- `assistant.build.integration-steps` now tells the Build chat to check every reply from the service with
  `checkReply` and a non-strict `z.object(...)` schema.

## Why

I7 (the integration debugger) needs to know which field of a reply changed without keeping the reply. Today a
generated integration's Zod parse just throws, and only its text reaches the run log. With `checkReply` the
failure note carries `reply-changed` and the field paths from the schema, across the bridge as it is
(`integration-kit.check-reply`). A non-strict schema keeps a field the service adds from breaking the
integration.

## Covers

- integration-kit.integration-entry
- assistant.build.integration-steps
