# Decision: the way to answer a waiting run no longer points to the Studio Inbox

- Requirement: `cli.commands.runs.show` (`apps/cli/src/commands/runs/requirements/show.md`)
- Task: HAL-5952; the wording was decided by the team on HAL-5952 (HAL-2282 rule), building on
  HAL-5932, so it is an internal note the CTO signs
- Approval: Liam approves this note in his review of this pull request on
  [HAL-5952](/HAL/issues/HAL-5952)
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:i5lOjcNhNCffXIi/tIL0Rip5xH+ggSDzhVsFoypd1Eg1qZINiiqu5lcrluan9uUtEnOwEYjk10fpQxQekCOZAg==

## What changes

A run waiting for an answer ends, in `halonic runs show` and in `halonic run`, with the way to
answer. It said "Answer in Studio's Inbox, or here: …". The Studio Inbox has not shipped yet, so
the line sent people to a place that doesn't exist, the same problem HAL-5932 decided for
`halonic init`. It now names Studio only; the rest of the line stays as it was:

```text
before:  Answer in Studio's Inbox, or here: halonic runs send 09d9a0 approve (or reject)
after:   Answer in Studio, or here: halonic runs send 09d9a0 approve (or reject)
```

The requirement's three examples and both sections of the `halonic run` golden file (colour and
`NO_COLOR`) quote the new line. Nothing else in the output changes. When the Inbox ships, its pull
request can add the place back.

## Tests

No test was weakened or removed. The message test and the `runs show` command test expect the new
line.

## Covers

- cli.commands.runs.show
- apps/cli/src/commands/run/golden/support-reply-waiting.txt
