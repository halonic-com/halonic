# cli.workspace-file-problems

- Status: active
- Since: 0.1.0
- Source: HAL-6613, item 2 of HAL-6585 (found by Sofia on HAL-6556); the words are the team's call, built on doctor's Workspace line and run's Couldn't line

When the workspace's files have errors, as `halonic validate` finds them, `halonic run`, `halonic runs send` and `halonic routines watch` shall start nothing and send nothing, before the trust check, and end with the `invalid_input` kind (exit 2), as for any file the user gave that is wrong. Line 1 shall say how many problems the workspace has, "Acme has 2 problems in its files.", then "Nothing ran." (or "Nothing was sent."), and line 2 "See them with: halonic validate", with the user's `--dir`. `halonic doctor` shall mark the Workspace line ✕ with "Acme · 2 problems in its files · halonic validate" and exit 1. A file with an error is left out of the loaded workspace, so a workspace with any is never taken as reaching the test model only. Only errors count; warnings leave no file out. Neither command shall repeat the problems themselves, so a key pasted into a file never shows.

## Examples

- Given the Acme example with `providers/anthropic.yaml` holding a key pasted as its `secret`, the alias smart on it and `model: smart` on Writer,
  when `halonic run support-reply` runs,
  then it prints, counting the pasted key and the alias whose provider is left out, "✕ Couldn't run support-reply: Acme has 2 problems in its files. Nothing ran." and "  See them with: halonic validate", exits with 2, stores no run and never prints the key.
- Given the same workspace with a run of Support reply waiting,
  when `halonic runs send 01jd8q approve` runs,
  then it ends "Nothing was sent.", exits with 2 and adds nothing to the run.
- Given a workspace whose provider file has a key pasted as its `secret` and on an `apiKey:` line,
  when `halonic doctor --dir acme` runs,
  then the Workspace line is "✕ Workspace   Acme · 2 problems in its files · halonic validate --dir acme", it exits with 1 and never prints the key.
