# cli.commands.runs.show

- Status: active
- Since: 0.1.0
- Source: HAL-2742; C174 on HAL-2000 and HAL-1984; the CLI output design on HAL-1981 (cli-output section 3.4, "`halonic runs show <run-id>`" and "Which id", revisions 24 to 38), approved by the board on HAL-2123

The `halonic runs show <run-id>` command shall show one run of the workspace, real or test, found by its short id or its full id in any case. It shall start with the heading: the workflow's title, the workspace, "run" or "test run" with the short id, when it started and how it ended, with times written by the list's When rule. After the heading and a blank line it shall print one line per step the run reached, as `cli.run-view` lines them up; a finished run shall then end as a finished `halonic run` does, with "✓ <title> finished in <duration>." and the receipt indented under it. A run waiting at a wait step shall end, after a blank line, with `halonic run`'s two waiting lines word for word: "! Waiting for you: <description>" (or "! Waiting for you in the step <step>." without one) and the way to answer, indented, and no receipt. The way to answer shall name each answer by its event, which is what the user types, followed by the workflow author's label in brackets when the answer has one and the label says something the event doesn't; a label that matches its event apart from case, spaces, dashes and underscores shall be left out. A failed or stopped run shall end, after a blank line, with `halonic run`'s two failure lines, "✕" and line 1, then the fix indented, and the receipt indented under them; a run cancelled somewhere else shall instead end with one ✕ line that says where the cancel landed (in a step, before a step, or before it started), and the receipt. With `--json`, it shall give the run's events, oldest first, with full ids. It shall never print where the run log is. It shall exit 0 for any run it shows, failed or not. An unknown id shall stop with "There's no run" and the way to the list (`not_found`); a short id that two runs end in shall stop with the way to the full ids (`invalid_input`); no run id or more than one shall be a usage error. Every suggested command shall keep the user's `--dir`.

## Examples

- Given a run of Support reply that finished at 10:31,
  when `halonic runs show a1b2c3` is run,
  then it starts with "Support reply in acme · run a1b2c3 · started 10:31, finished 10:31" and exits 0.
- Given a run of Mail triage whose step Read the email took 1 s and that finished in 18 s without a tool call,
  when `halonic runs show 0a0b0c` is run,
  then after the heading it prints "", "✓ Read the email Writer · default 1 s", "", "✓ Mail triage finished in 18 s." and " Sent nothing".
- Given a run still in its step Read the email since 10:20,
  when `halonic runs show 0a0b0d` is run,
  then it ends with "◌ Read the email Writer · default · running since 10:20".
- Given a run that failed yesterday at 16:41,
  when `halonic runs show 01jd6m` is run,
  then its heading ends "started yesterday 16:40, failed yesterday 16:41", on stdout, and it exits 0.
- Given a run of Mail triage that failed in its step Read the email because Ollama doesn't have llama3.2,
  when `halonic runs show 0f0f01` is run,
  then it ends with "✕ Mail triage failed in the step Read the email: Ollama is answering, but it doesn't have llama3.2 yet.", " Run ollama pull llama3.2, or point the model alias local at another model in models.yaml." and " Sent nothing", on stdout, and exits 0.
- Given a run of Mail triage cancelled while it moved from Read the email to Classify,
  when `halonic runs show 0c0c02` is run,
  then it ends with "✕ Mail triage was cancelled before the step Classify. Nothing after it ran." and " Sent nothing".
- Given a run waiting for the user since 10:41,
  when `halonic runs show 09d9a0` is run,
  then its heading ends "started 10:40, waiting for you since 10:41".
- Given that run waiting at its step Approve this reply? for approve or reject,
  when `halonic runs show 09d9a0` is run,
  then it ends with `! Waiting for you: Approve this reply?` and `  Answer with: halonic runs send 09d9a0 approve (or reject)`.
- Given that run's answers labelled Send reply for approve and Discard for reject,
  when `halonic runs show 09d9a0` is run,
  then it ends with `  Answer with: halonic runs send 09d9a0 approve (Send reply) (or reject (Discard))`.
- Given that run's answers approve and needs_changes labelled Send it and Needs changes,
  when `halonic runs show 09d9a0` is run,
  then it ends with `  Answer with: halonic runs send 09d9a0 approve (Send it) (or needs_changes)`.
- Given a test run,
  when `halonic runs show a1b2c3` is run,
  then its heading says "test run a1b2c3".
- Given the run a1b2c3,
  when `halonic runs show A1B2C3` or its full id is run,
  then it shows that run.
- Given no run 01jd8x,
  when `halonic runs show 01jd8x --dir ./acme` is run,
  then it stops with "✕ There's no run 01jd8x in acme." and "See recent runs with halonic runs --dir ./acme.", exit 4.
- Given two runs whose ids end in a1b2c3,
  when `halonic runs show A1B2C3` is run,
  then it stops with "✕ Two runs in acme end in a1b2c3." and "Use the full id, as halonic runs --json shows it.", exit 2.
- Given no run id,
  when `halonic runs show` is run,
  then it stops with "✕ halonic runs show needs a run id." and its usage line, exit 2.
- Given a finished run,
  when `halonic runs show a1b2c3 --json` is run,
  then it gives the run's events, oldest first, each with the full run id.
