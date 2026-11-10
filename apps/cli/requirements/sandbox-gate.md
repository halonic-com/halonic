# cli.sandbox-gate

- Status: active
- Since: 0.1.0
- Source: [cli-output](/HAL/issues/HAL-1981#document-cli-output) 3.4 and 3.8, approved by the board on [HAL-2123](/HAL/issues/HAL-2123); Julian's conditions on [HAL-1673](/HAL/issues/HAL-1673); task HAL-1709

When `halonic run` (or `halonic runs send`) is about to start a run, the CLI shall first check the sandbox if the workflow, a workflow it starts, or one of its parallel branches has an agent whose harness starts a program on this computer (any harness but Halonic's own). An agent that a person set to "On this computer" on this computer, for its file as it is now, shall need no check and shall get one ! line, "_Writer_ runs on this computer without the sandbox, as chosen on _9 Nov_.", never a question. Any other such agent needs the sandbox. When the sandbox can't start, the command shall start nothing, write nothing to the run log and end with the `unavailable` kind (exit 9): line 1 "the sandbox can't start on this computer." and "Nothing ran." (or "Nothing was sent." for `runs send`), line 2 the reason and fix for the port's reason code, line 3 the docs link and the code. The words shall come from the code alone, an unknown code reading as `other`; the check's own sentence shall show only with `--debug`. A choice made on another computer, or for an earlier version of the agent's file, shall not count. There is no option that skips the check.

## Examples

- Given Acme's support-reply, whose step runs Writer in Claude Code, on a computer without bubblewrap,
  when the check runs,
  then it refuses with "the sandbox can't start on this computer. Nothing ran.", "bubblewrap isn't installed. Install it, for example on Ubuntu or Debian with sudo apt install bubblewrap, then run it again." and the docs link with `bubblewrap-missing`, and exit 9.
- Given a workflow whose agents all run in Halonic's own loop,
  when the check runs,
  then the sandbox isn't checked.
- Given Writer set to On this computer on 9 Nov,
  when the check runs,
  then the sandbox isn't checked and the line is "Writer runs on this computer without the sandbox, as chosen on 9 Nov.".
- Given that choice and a pull that changed Writer's file,
  when the check runs on a computer without bubblewrap,
  then the run is refused.
- Given a choice made on another computer,
  when the check runs here on a computer without bubblewrap,
  then the run is refused.
