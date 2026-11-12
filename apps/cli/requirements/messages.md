# cli.messages

- Status: active
- Since: 0.1.0
- Source: HAL-2184; the CLI output design on HAL-1981 (cli-output section 5, checklist item 2: "every sentence the user reads comes from the message catalogue by key"), approved by the board on HAL-2123; the sentences of `init`, `validate` and `test` from cli-output 3.1 to 3.3 at revision 19; the sentences of `run` and `runs` from cli-output 3.4 at revision 24, with the team's calls on HAL-2703; the sentences of `trust` and `plugin` from cli-output 3.5 and 3.6 at revision 24, with Liam's F5 and F6 on HAL-2618 and the team's calls on HAL-2703; the sentences of `doctor` and the sandbox check from cli-output 3.7 and 3.8 at revision 24, with sandbox-screens 3.1 and the team's calls on HAL-2703 (HAL-2676); the sentences of the `halonic runs` list from cli-output 3.4 at revision 28 (HAL-2739); a failed test's other expectations from cli-output 3.3 at revision 23 (HAL-2676, HAL-2690); a failed run's line 1 for every settled 15.3 reason from cli-output 3.4 at revision 23 (HAL-2676, HAL-2690)

The `halonic` command shall take every sentence it shows the user from the CLI's message catalogue, where the sentence has a key made of its area and its name, such as `usage.unknownCommand`. A sentence shall have the same words in a terminal, through a pipe and in `--json`: colour, bold, dim and the marks' plain-text stand-ins shall be the only difference.

## Examples

- Given the entry `unknownCommand` in the area `usage`,
  when it is made for the name "deploy",
  then its key is `usage.unknownCommand` and its words are 'There's no command "deploy".'.
- Given a sentence with a dimmed code and the › mark between Studio places,
  when it is shown with colour, through a pipe, and as `--json` text,
  then the words are the same each time, and only the terminal gets escape codes.
- Given `halonic --help`'s exit codes,
  when they are made,
  then they are the four lines of cli-output 1.9, joined by ·, each under 80 columns.
- Given `halonic init --example acme` and the example's 2 hubs, 3 agents, 2 workflows and 1 routine,
  when its success lines are made,
  then they read "Created a copy of the Acme example in ./acme." and "2 hubs · 3 agents · 2 workflows · 1 routine · test model, no key needed" (cli-output 3.1).
- Given a `halonic validate` that found 2 errors and 1 warning in 2 of 14 files,
  when its summary line is made,
  then it reads "2 errors and 1 warning in 2 files. Checked 14 files.", with "2 errors" in bold (cli-output 3.2).
- Given a `halonic test` run where the test "closes the ticket after a reject" ended in Send reply instead of Closed,
  when its lines are made,
  then the failure reads "Expected the run to end in the step Closed, but it ended in Send reply." and the last line "2 passed, 1 failed. 3 tests in 0.9 s." (cli-output 3.3).
- Given a `halonic test` run that expected the file reply.md and saved only summary.md,
  when the failure for its `artifacts` is made,
  then it reads "Expected the run to save reply.md, but it didn't. It saved summary.md.", and summary.md isn't a failure of its own, because `artifacts` means "at least these" (cli-output 3.3, HAL-2690).
- Given a run of Support reply whose step Draft a reply failed because OpenAI refused the key in the secret openai-key,
  when its two lines are made,
  then line 1 names the secret and its variable, HALONIC_SECRET_OPENAI_KEY, and line 2 reads "Set HALONIC_SECRET_OPENAI_KEY to a key OpenAI accepts, then run again." (cli-output 3.4; no Studio in 0.1, HAL-6183).
- Given a finished run that changed 1 file, sent 1 email, asked once and spent an estimated €0.004,
  when its receipt is made,
  then it reads "Changed 1 file · sent 1 email · asked you once · estimated cost €0.004", and a run that sent nothing says "Sent nothing" (cli-output 3.4).
- Given a finished run whose wait step was answered with the event `hold`,
  when `halonic runs show` names what the user answered,
  then it reads "you answered hold at 14:02", and only `approve` and `reject` get their own verb (cli-output 3.4).
- Given the `halonic runs` list with `--status failed`, where `--limit` shows 20 of 47 failed runs,
  when the line after the last row is made,
  then it is dimmed and reads "Showing the 20 newest of 47 failed runs. See them all with halonic runs --status failed --limit 47." (cli-output 3.4).
- Given `halonic runs --status failed --workflow support-reply` in Acme, which matches no run,
  when its two lines are made,
  then line 1 reads "No failed runs of support-reply in Acme." and line 2, dimmed, "See every run with halonic runs." (cli-output 3.4).
- Given a run of Support reply that reached its own budget of €5.00 in the step Draft a reply, with an estimated €5.08 spent,
  when its two lines are made,
  then they read "Support reply stopped in the step Draft a reply: this run reached its budget of €5.00 (estimated €5.08 spent)." and "Raise the budget in workspace.yaml.", because a run's budget doesn't reset (cli-output 3.4 revision 23).
- Given `halonic trust` without a terminal and without `--yes --fingerprint`,
  when its refusal is made,
  then line 1 reads "Acme isn't trusted on this computer yet, and there's no terminal to ask you." and line 2 names the flags, with the user's own `--dir` (cli-output 1.7 and 3.5).
- Given `halonic plugin remove weather` for a plugin with an API key,
  when its question is made,
  then it reads "Remove Weather? Its settings and the API key you entered are removed from this computer." (cli-output 3.6).
- Given a trust check where the only differences are two rows marked Changed,
  when its summary is made,
  then it reads "2 changed programs." and never names a count of 0 (cli-output 3.5).
- Given a run refused because bubblewrap isn't installed,
  when its line 2 is made,
  then it reads "bubblewrap isn't installed. Install it, for example on Ubuntu or Debian with sudo apt install bubblewrap, then run it again.", and a reason code Halonic doesn't know gets the `other` line, never the check's own sentence (cli-output 3.8).
- Given `halonic doctor` on a computer whose sandbox can't start,
  when its summary is made,
  then it reads "1 problem. Agents set to run in a sandbox won't start until it's fixed." (cli-output 3.7).
- Given `halonic doctor` with a Models ✕ for Ollama and a Sandbox ✕,
  when its summary line is made,
  then it reads "2 problems. Agents that use Ollama won't run until it answers. Agents set to run in a sandbox won't start until it's fixed." (cli-output 3.7).
- Given the code of every command under `src/commands` and of `printError`,
  when its strings and template texts are read, comments left out,
  then none holds two words with a space between them: every sentence comes from `src/messages` (Liam on HAL-2194).
