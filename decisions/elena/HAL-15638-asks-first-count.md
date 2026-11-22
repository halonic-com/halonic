# Decision: one phrase for each meaning of approve

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-15645 (wording decided by Sofia with Elena, team wording under HAL-2282; flow check C605 #7 on HAL-15638)
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:SFhCiF7d1EES4yF2aM+rfidZs/EZJysN6SKPPnX5N7lkgrXK00SVtdh6OBJBKqt8s4rSIW0JAZfEBGeul7uCAQ==

"Approve" meant two things: letting agents use a listed tool, and a person
approving one call during a run. Letting agents use a listed tool is now
"review" and "turn on": the connector page says "3 tools are off until you
review them", the dialog and the CLI say "Nothing to review." and "Nothing
from X to review.", and the help for `halonic tools review`, `approve` and
`revoke` says "turn on". "Approve" stays inside the review and for a single
call during a run. YAML `tools.approve` and the command names don't change.
The requirements below change only their wording and examples to match; no
behaviour changes and no test was weakened.

## Covers

- library.listed-tools-waiting
- library.listed-tools-review-states
- library.connector-tools-line
- library.connector-secrets-focus
- cli.commands.tools.review
- cli.commands.tools.approve
