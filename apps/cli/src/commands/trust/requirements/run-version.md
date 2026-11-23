# cli.commands.trust.run-version

- Status: active
- Since: unreleased
- Source: HAL-16335, plan approved by Liam on the task; the not-committed line's words are the team's call there, approved by Liam as a single line after the review list, building on `cli.run-live-version`'s line for uncommitted changes

The `halonic trust [--dir <folder>]` command shall review the version `halonic run` would start (`cli.run-live-version`): the live version's definitions and local integrations, read from the latest commit, or the saved files when the folder isn't a git repository or has no commit yet. The trust it saves shall be what a run's trust check on that version finds, so trusting clears a run's refusal. When a definition file or a file under `integrations/` has saved changes that aren't committed, the check shall name each such file, workspace-relative and escaped, on one dimmed line after its rows and before `Fingerprint`, or after the ✓ line when the workspace is already trusted: "Uncommitted changes aren't checked, because runs don't use them: <files>. Commit them, then run halonic trust again." When the folder is a repository but git can't start, the command shall trust nothing and refuse as `halonic run` does, with "Nothing was trusted." in place of "Nothing ran.". `halonic run`, `halonic runs send`, `halonic routines watch` and `halonic serve` shall check trust on the local integrations of the version they start, read from the same commit as its definitions.

## Examples

- Given Acme in git with its connector mail committed, and a saved change to mail's args that isn't committed,
  when `halonic trust --dir acme --yes --fingerprint <the fingerprint it showed>` runs,
  then the trust it saves is that of the committed mail, and `halonic run` on Acme passes its trust check.
- Given the same saved change,
  when `halonic trust --dir acme` shows its check,
  then the line before `Fingerprint` reads "Uncommitted changes aren't checked, because runs don't use them: library/connectors/mail.connector.yaml. Commit them, then run halonic trust again.".
- Given Acme in git with the local integration notes committed, and a saved change to `integrations/notes/backend/index.js`,
  when its trust is checked for a run,
  then the integration's code is hashed as committed, and the check names `integrations/notes/backend/index.js` as not committed.
- Given Acme in git with nothing changed since the latest commit,
  when `halonic trust --dir acme` shows its check,
  then there is no line about saved changes.
