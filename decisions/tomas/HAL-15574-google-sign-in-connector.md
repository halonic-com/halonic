# Decision: halonic google calls its argument <ref>, and sign-in says "connector"

- Approval: HAL-15574 and HAL-15587, from the words check C595 (HAL-15567, rows 20 to 24) and the flow check C596; wording on an approved command, decided by the team (HAL-2282)
- Kind: user-visible

Two wording fixes in `halonic google`, following HAL-15363:

- `sign-in` says "connector", not "connection", for the connector a setup
  is linked to, in the `--connection` help, the refusal and fix of a wrong
  `--connection` and the fix of another account. The fix line when Google
  can't be reached says "your internet connection", so it can't be read as
  the connector (microcopy 1.2).
- `secret` and `sign-in` call their argument `<ref>`, not `<account>`, in
  usage, help and fix lines, because the command takes the setup's ref that
  Studio's sign-in step shows, not an e-mail address. `reset`'s done line
  names the two commands the same way.

The requirements change only the words they quote. Nothing is removed from
any promise: the same lines print, the same refusals refuse with the same exit
codes, and the tests only change the words they check. The `--json` key
`connection` and the `--connection` option stay as they are.

## Covers

- cli.commands.google.reset
- cli.commands.google.secret
- cli.commands.google.sign-in
