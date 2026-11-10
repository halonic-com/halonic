# cli.commands.runs.send

- Status: active
- Since: 0.1.0
- Source: HAL-2742; word fixes HAL-4577; C174 on HAL-2000 and HAL-1984, C224 on HAL-2588; following the run after the send, HAL-4031 (team decision on HAL-2742); the sandbox check, HAL-4289 and HAL-4349; the CLI output design on HAL-1981 (cli-output section 3.4, "`halonic runs send <run-id> <event>`" and "Which id", revisions 6 and 31, and 3.8), approved by the board on HAL-2123

The `halonic runs send <run-id> <event>` command shall send the event to a run of the workspace, found by its short id or its full id in any case, only while the run waits for that event, through the same `RunEvents.sendEvent` service as `halonic run --event` and the Studio (`app.run-send`). It names no call, so the engine answers the oldest waiting item. Once sent, it shall print "✓ Sent <event> to run <short id>. <title> goes on." The engine is local, so it shall then follow the run until it ends or waits again and print what `halonic run` prints after its heading (`cli.run`): the step lines, each as its step ends and with the running step's live line, as `halonic run` does (`cli.run-live`), then the receipt, the waiting lines or the failed run's lines; it shall exit 0 when the run finished or waits again and 1 when it failed. With `--json` it shall give the run and its events as they are then, as `run` and `events`. Ctrl C shall stop following it, as in `halonic run`. It shall check trust as `halonic run` does (`cli.run`), with "Nothing was sent." as line 1's end, and only for a send the service lets through: a workspace that isn't trusted, or changed since it was trusted, shall exit 3 and send nothing, so the run stays waiting. It shall then check the sandbox for the run as `halonic run` does (`cli.run-sandbox-gate`), with the harness the run named when it started, before it opens the engine: when an agent needs the sandbox and it can't start, it shall exit 9 with "Nothing was sent." as line 1's end, and send nothing. A run that isn't waiting shall stop with "it isn't waiting for you." and when it ended or the step it's running, and the way to see it (`conflict`). An event the step doesn't take shall stop with the events it takes and the one that's close, or else the way to see the step (`invalid_input`). An unknown id shall stop with the way to the waiting runs (`not_found`); a short id that two runs end in shall stop with the way to the full ids (`invalid_input`). Both name the workspace as the trust line does, by its name in `workspace.yaml` (Sofia's word check on HAL-4533). Without a run id and an event, or with more, it shall be a usage error. Every suggested command shall keep the user's `--dir`.

## Examples

- Given a run of Support reply on the Acme example waiting at its step Approve this reply? for approve or reject,
  when `halonic runs send 01JD8Q approve` is run,
  then it sends approve to that run by its full id, prints "✓ Sent approve to run 01jd8q. Support reply goes on.", then a blank line, the step lines and "✓ Support reply finished in 1 s." with its receipt, and exits 0.
- Given that run,
  when `halonic runs send 01jd8q approve --json` is run,
  then it gives the run, now completed, and its events, as `run` and `events`.
- Given that run, after a provider that reaches Ollama was added to the workspace,
  when `halonic runs send 01jd8q approve` is run,
  then it stops with "✕ Couldn't send approve to run 01jd8q: Acme isn't trusted on this computer yet. Nothing was sent.", exit 3, and the run's log is unchanged.
- Given that run, after Writer was put in Claude Code and Acme trusted again, on a computer without bubblewrap,
  when `halonic runs send 01jd8q approve` is run,
  then it stops with "✕ Couldn't send approve to run 01jd8q: the sandbox can't start on this computer. Nothing was sent.", exit 9, and the run's log is unchanged.
- Given a run of Support reply waiting at its step Approve this reply? for approve or reject,
  when `halonic runs send 09d9a0 aprove` is run,
  then it stops with "✕ Couldn't send aprove to run 09d9a0: the step Approve this reply? takes approve or reject." and "Did you mean approve?", exit 2, and sends nothing.
- Given a run that finished 2 minutes ago,
  when `halonic runs send 0f0e0d approve` is run,
  then it stops with "✕ Couldn't send approve to run 0f0e0d: it isn't waiting for you. It finished 2 minutes ago." and "See it with halonic runs show 0f0e0d.", exit 5.
- Given a run that finished at 10:31, more than an hour ago,
  when `halonic runs send a1b2c3 approve` is run,
  then its line 1 ends "It finished at 10:31.".
- Given a run in its step Draft a reply,
  when `halonic runs send 09d9c0 approve` is run,
  then its line 1 ends "It's running, in the step Draft a reply.", exit 5.
- Given no run 01jd8x,
  when `halonic runs send 01jd8x approve --dir ./acme` is run,
  then it stops with "✕ Couldn't send approve: there's no run 01jd8x in Acme." and "See the runs waiting for you with halonic runs --dir ./acme --status waiting.", exit 4.
- Given two runs whose ids end in 09d9a0,
  when `halonic runs send 09d9a0 approve` is run,
  then it stops with "✕ Couldn't send approve: two runs in Acme end in 09d9a0." and "Use the full id, as halonic runs --json shows it.", exit 2.
- Given only a run id,
  when `halonic runs send 09d9a0` is run,
  then it stops with "✕ halonic runs send needs a run id and an event." and the usage line, exit 2.
