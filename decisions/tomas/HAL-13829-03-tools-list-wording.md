# Decision: `halonic tools review | approve` say which connector's tools they couldn't list

- Task: HAL-13829 (CN3 of the C248 check on HAL-13818)
- Approval: the team decided the words on HAL-13829 (small wording on an existing command); Liam reviews this pull request and signs this note as the CTO
- Kind: internal

## What changes

When `halonic tools review` or `halonic tools approve` can't list a connector's tools because its program isn't on this computer, or a secret it needs isn't set, line 1 now names the connector, and the fix line is shorter:

```
✕ Couldn't list the tools from notes: its program acme-notes-mcp isn't on this computer.
  Install it, or change the command in library/connectors/notes.connector.yaml.
✕ Couldn't list the tools from mailbox: it needs the secret mailbox-token, which isn't set.
  Set it with: halonic secret set mailbox-token
```

Before, line 1 was "The program acme-notes-mcp isn't on this computer." or "The secret mailbox-token isn't set on this computer.", and the secret's fix also named `HALONIC_SECRET_MAILBOX_TOKEN`. The exit codes, the `--json` `reason`, `program` and `secret`, and how the cause is read (by the error's type, never its text) stay as they are.

`halonic run`'s warning keeps its words. Its line 1, "! notes didn't start, so its tools are off in this run.", already says what went wrong, so a cause line that starts "Couldn't list the tools" would say it twice. `cli.run-connector-warning` said it used "the words of `halonic tools review`"; it now spells out its own words, which are the ones it printed before. Its secret fix still names the `HALONIC_SECRET_…` variable, which matters most for a run in CI.

## Why

The words were decided on HAL-13829 after #4006 had settled others on HAL-13670; the two decisions crossed, and the later one wins (noted on HAL-13829, 19 Nov; nobody objected). Naming the connector matters for `tools approve --all` across a workspace, and the fix lines match Studio's step panel (PR 3 of HAL-12471).

## Tests

No test was weakened or removed. The three tests of `connector-start.test.ts` that check these lines now expect the new words. `halonic run`'s tests are unchanged and pass.

## Covers

- cli.commands.tools.connector-start
- cli.run-connector-warning
