# Decision: `halonic init --example` no longer points to the Studio Inbox

- Requirement: `cli.commands.init.copy-example` (`apps/cli/src/commands/init/requirements/copy-example.md`)
- Task: HAL-5935; the wording was decided by the team on HAL-5932 (HAL-2282 rule), so it is an
  internal note the CTO signs
- Approval: Liam approves this note in his review of this pull request on
  [HAL-5935](/HAL/issues/HAL-5935)
- Kind: internal

## What changes

The last `Next:` line of `halonic init --example` said "Or open the folder in Studio and start
Support reply from the Inbox." The Studio Inbox has not shipped yet, so the line sent people to a
place that doesn't exist. It now ends after the workflow's title:

```text
before:  Or open the folder in Studio and start Support reply from the Inbox.
after:   Or open the folder in Studio and start Support reply.
```

The requirement's example and both sections of the golden file (colour and `NO_COLOR`) quote the
new line. Nothing else in the output changes. When the Inbox ships, its pull request can add the
place back.

## Tests

No test was weakened or removed. The message test and the command test expect the new line.

## Covers

- cli.commands.init.copy-example
- apps/cli/src/commands/init/golden/example.txt
