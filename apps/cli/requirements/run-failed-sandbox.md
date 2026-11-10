# cli.run-failed-sandbox

- Status: active
- Since: 0.1.0
- Source: [ux-checklists-sandbox](/HAL/issues/HAL-1833#document-ux-checklists-sandbox) 3.6 and 3.7; [cli-output](/HAL/issues/HAL-1981#document-cli-output) 3.4; task HAL-4289

When a run's log ends with `run.failed` for `sandbox-not-ready`, `halonic run` and `halonic runs show` shall word its two failure lines from the `sandboxReason` code alone: line 1 "_Support reply_ failed in the step _Draft reply_: the sandbox can't start on this computer.", line 2 the same reason and fix a run the sandbox check refused gets for that code (`cli.sandbox-gate`). A log without a code, or with a code this version doesn't know, shall read as `other`. The engine's own message shall not show.

## Examples

- Given a run that failed with `sandbox-not-ready` and `bubblewrap-missing`,
  when `halonic runs show` prints it,
  then line 2 is "bubblewrap isn't installed. Install it, for example on Ubuntu or Debian with sudo apt install bubblewrap, then run it again.", as for a refused `halonic run`.
- Given such a run with no `sandboxReason`,
  when it is printed,
  then line 2 is the fix for `other`.
