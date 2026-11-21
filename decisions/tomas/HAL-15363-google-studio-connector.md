# Decision: halonic google says "in Studio" and "connector"

- Approval: HAL-15363, from Tomas's words check C566 (HAL-15352), rows 42 and 43; wording on an approved command, decided by the team (HAL-2282)
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:PDohMUF3lK+NtZQdkoZlS3gWCBQMhxGhJO0vYH/eOzzkZ8xsfGfJEuih7RDy5DfZefTnF/wZ+BQGzkXCtkE+BA==

Two wording fixes in `halonic google`, so it uses the same words as the rest
of Halonic:

- "in Studio", not "in the Studio" (microcopy E6), in `reset`'s done line and
  in the fix lines of `secret` and the unknown or incomplete account.
- "connector", not "connection" (glossary clash 2 in microcopy 1.2, and 10.2
  for the Google sending row), in the group summary and in `allow-sending`'s
  summary, usage and refusals.

The requirements change only the words they quote. Nothing is removed from
any promise: the same lines print, the same refusals refuse with the same exit
codes, and the tests only change the words they check. The `--json` key
`connection` and sign-in's `--connection` option stay as they are, since
renaming them would change the interface, not only the words.

## Covers

- cli.commands.google.allow-sending
- cli.commands.google.reset
- cli.commands.google.secret
