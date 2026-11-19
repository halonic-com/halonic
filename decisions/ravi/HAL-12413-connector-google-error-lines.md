# Decision: connector and Google error lines say why

- Task: HAL-12413
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-12413 (rows C1, C3, C4 and C5 of Sofia's UX check of the error lines on HAL-12390; small wording on approved screens, a team decision with no board card, HAL-2282 rule)
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:0npa4fjOm75GfDHdtIFmkEoVUJ6z7aJ7O0N4O+y1YwhBX5VShoYduJlepfeu6DqlE+BVYDzNPrjVAx4coZ+QBA==

## What changes

- `studio.workspace-google-setup-accounts` (C1): a refusal the agent host
  words itself (a 400, 403, 404 or 409 answer, such as "There is no Google
  setup for this account.") keeps its words and gets the matching error
  kind, so step 7 shows it after "Couldn't start the sign-in:" instead of
  "Halonic ran into a problem it can't explain yet." Anything else, such as
  502 `google_failed`, whose fixed sentence names the agent host, stays
  unexplained, with its detail in Copy details. The "not yet" refusals of
  the checks are kinded `unavailable`, so their words (changed by L8 on
  HAL-12369) reach the screen.
- `library.listed-tools-waiting` (C3): when the tools can't be listed
  because the workspace isn't trusted, the line keeps its sentence and
  offers **Review**, which opens the workspace page at Trust (the
  `workspace.open-trust` command Settings' **Open Trust** runs), and no
  **Try again**, which can't help. The host rejects with
  `WorkspaceNotTrusted` for this, so the page doesn't guess from a kind
  that other refusals share.
- `library.refusal-line` (C4): a refused call is one sentence, "notes-mcp
  refused a call to `create_note`: reason.", with the tool's name in code
  type and one full stop. `refusalLine` returns the line in parts for that.
  Refused tools, listings and keywords read as before: they are
  `refusalStatusLine`'s words, which the CLI shares.
- `google-setup.check-again` (C5): "Halonic couldn't reach Google to
  check." (rule E6). The service line in the results says "Halonic" too,
  for the same rule.

G2 (the engine's words instead of "agent host") and C2 (the connector's
causes) wait for HAL-12410 and come in a second pull request.

No test was skipped or loosened.

## Covers

- studio.workspace-google-setup-accounts
- library.listed-tools-waiting
- library.refusal-line
- google-setup.check-again
