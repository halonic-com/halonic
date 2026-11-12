# cli.stop

- Status: active
- Since: 0.1.0
- Source: HAL-2184; the CLI output design on HAL-1981 (cli-output sections 1.5 and 2, and the checklist item "Progress" in section 5), approved by the board on HAL-2123; SIGHUP from HAL-6558

While a `halonic` command runs, the first Ctrl C or SIGTERM shall ask the command to stop cleanly, and the command shall end with "Stopped." and what stopping meant, and exit with 130 for Ctrl C or 143 for SIGTERM. Closing the terminal sends SIGHUP, which shall stop the command in the same way and exit with 129, so a run ends cancelled after its step rather than killed in the middle of it. The stop line shall go to stderr, after the live line is cleared. With `--json`, stderr shall stay empty and stdout shall hold the command's one document, with `"ok": false`. A second Ctrl C or SIGTERM shall end the command at once, without waiting for it to stop: it shall clear the live line, print only "Stopped." and exit with that second signal's code. When the first Ctrl C or SIGTERM comes while a yes-or-no question waits for its answer, the CLI shall stop reading the answer and end the question's line, so "Stopped." starts a line of its own. When a command finishes its work after the first Ctrl C or SIGTERM and returns a normal result rather than that it stopped, the CLI shall print that result and exit with the command's own code, because the work did finish. When a command returns that it stopped although no Ctrl C or SIGTERM came, the CLI shall print the stop line and exit with 130. Before a second Ctrl C or SIGTERM ends the process, the CLI shall wait until stdout and stderr have handed on what they still hold, so a reader at the other end of a pipe gets the whole `--json` document; a third one shall end the process without waiting. When the reader at the other end of stdout or stderr closes the pipe, such as `head` after its lines, the CLI shall drop what it writes after that, without an error or stack trace, and the command shall finish its work (HAL-6007). The same holds for a terminal window that was closed, so a command stopped by SIGHUP still winds down after the window is gone.

## Examples

- Given a command running in a terminal,
  when the user presses Ctrl C,
  then the command is asked to stop and it ends with code 130.
- Given a command a CI job runs,
  when the job is cancelled and SIGTERM arrives,
  then it ends with code 143.
- Given `halonic run support-reply` in a terminal window,
  when the user closes the window and SIGHUP arrives,
  then the run is cancelled after its step, as at Ctrl C, and the command ends with code 129.
- Given a command that is already stopping after Ctrl C,
  when Ctrl C comes again,
  then it ends at once with code 130.
- Given a command that is already stopping after Ctrl C,
  when SIGTERM comes,
  then it prints only "Stopped." and ends at once with code 143.
- Given `halonic trust` waiting at "Trust Acme on this computer? [y/N]",
  when the user presses Ctrl C,
  then it stops waiting, prints "Stopped." on the next line and ends with code 130.
- Given `halonic run support-reply --json`,
  when Ctrl C stops it,
  then stderr stays empty and stdout holds one JSON document with `"ok": false`.
- Given a command that doesn't watch for stopping and finishes with code 0,
  when Ctrl C came while it ran,
  then it prints its result and ends with code 0.
- Given a command that says it stopped on its own, with no signal,
  when it ends,
  then it prints the stop line and ends with code 130.
- Given `halonic run support-reply --json | jq`, already stopping after Ctrl C,
  when Ctrl C comes again while `jq` hasn't read all of stdout yet,
  then the process ends only after stdout is handed on, so `jq` reads one whole document.
- Given `halonic run support-reply | head -2`,
  when `head` has printed its two lines and closed the pipe,
  then the run goes on to its end and nothing is printed about the closed pipe.
- Given a run cancelled after the step Classify,
  when its stop line is made,
  then it reads "Stopped. The run 01JD8Q was cancelled after the step Classify. Nothing after it ran."
