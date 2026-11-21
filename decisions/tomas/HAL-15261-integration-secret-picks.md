# Decision: doctor checks a local integration's secret picks, and Studio lists its connector once

- Task: HAL-15261
- Approval: Liam approves this note in his review of this pull request on HAL-15261. A team decision with no board card (HAL-2282 rule): the Secrets line's and the CLI trust check's own words, no new wording.
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:e2YTTUfIGQu3vsKv5aAeaIMOWtVY2BG5GL3zfqrnWZeJV4usFcVxJeXBbgRUqsZOyGyexkkbqQQU4Tal4ehBDg==

## What changes

From flow check 38 on `main` (C552 findings 1 and 3, HAL-15218). The workspace: Acme with a
local integration in `integrations/notes` whose connector `notes` gives the sheet's secrets
workspace secrets, used by the agent Writer.

1. **Doctor checks the picks.** `halonic doctor` already checks an HTTP connector's `secret` and
   a program's `secretEnv`, but not the workspace secrets a local integration's connector picks
   for its sheet (`transport.integration.secrets`). With them unset, the run's trust check said
   "Will pass 2 secrets" while doctor showed no Secrets line. Doctor now adds each pick, once,
   used by the connector: "✕ Secrets     my-notes-key isn't set (connector notes) · halonic
   secret set my-notes-key". `cli.doctor-secrets` gets the words and one example.
2. **Studio's trust dialog lists the connector once.** The dialog gave every local integration a
   row of its own, "no address set" when its sheet reads no address from a setting. So notes
   showed twice under **Addresses (3)** while the summary said "list 2 addresses". The CLI gives
   an integration a row only for the setting addresses it reads; Studio now does the same in the
   first-time check.
3. **Studio joins the picks as the CLI does.** "my-notes-key as notes-key, sync-key" read as two
   names for my-notes-key. The line now reads "my-notes-key as notes-key and sync-key", as
   `halonic trust` does. The requirement's example wrote the line as "Gets secrets: …"; the
   dialog shows every label (Gets secrets, Allowed sites, Working folder) in muted text without a
   colon, so the example now names the label and its value apart instead of adding a colon to one
   line. `studio.workspace-trust-review` gets those words and one example, and the existing
   test's expected line changes from the comma to "and".

No requirement was retired, and no test was weakened or skipped.

## Why

Doctor's Secrets line is for "a secret a run needs that the Models line doesn't check"; a pick
the run passes to the integration is one, and the line's approved words already fit it. The
Studio requirement says the dialog uses the CLI's words, and the CLI lists the connector once
and joins with "and"; the two differences were the dialog's, not the CLI's.

## Covers

- cli.doctor-secrets
- studio.workspace-trust-review
