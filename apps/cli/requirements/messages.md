# cli.messages

- Status: active
- Since: 0.1.0
- Source: HAL-2184; the CLI output design on HAL-1981 (cli-output section 5, checklist item 2: "every sentence the user reads comes from the message catalogue by key"), approved by the board on HAL-2123; the sentences of `init`, `validate` and `test` from cli-output 3.1 to 3.3 at revision 19; the sentences of `trust` and `plugin` from cli-output 3.5 and 3.6 at revision 24, with Liam's F5 and F6 on HAL-2618 and the team's calls on HAL-2703 (HAL-2676)

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
  then they read "Created a copy of the Acme example in ./acme." and "2 hubs · 3 agents · 2 workflows · 1 routine · runs on the test model, no key needed" (cli-output 3.1).
- Given a `halonic validate` that found 2 errors and 1 warning in 2 of 14 files,
  when its summary line is made,
  then it reads "2 errors and 1 warning in 2 files. Checked 14 files.", with "2 errors" in bold (cli-output 3.2).
- Given a `halonic test` run where the test "closes the ticket after a reject" ended in Send reply instead of Closed,
  when its lines are made,
  then the failure reads "Expected the run to end in the step Closed, but it ended in Send reply." and the last line "2 passed, 1 failed. 3 tests in 0.9 s." (cli-output 3.3).
- Given `halonic trust` without a terminal and without `--yes --fingerprint`,
  when its refusal is made,
  then line 1 reads "Acme isn't trusted on this computer yet, and there's no terminal to ask you." and line 2 names the flags, with the user's own `--dir` (cli-output 1.7 and 3.5).
- Given `halonic plugin remove weather` for a plugin with an API key,
  when its question is made,
  then it reads "Remove Weather? Its settings and the API key you entered are removed from this computer." (cli-output 3.6).
- Given a trust check where the only differences are two rows marked Changed,
  when its summary is made,
  then it reads "2 changed programs." and never names a count of 0 (cli-output 3.5).
- Given the code of every command under `src/commands` and of `printError`,
  when its strings and template texts are read, comments left out,
  then none holds two words with a space between them: every sentence comes from `src/messages` (Liam on HAL-2194).
