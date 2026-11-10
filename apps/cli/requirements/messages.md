# cli.messages

- Status: active
- Since: 0.1.0
- Source: HAL-2184; the CLI output design on HAL-1981 (cli-output section 5, checklist item 2: "every sentence the user reads comes from the message catalogue by key"), approved by the board on HAL-2123; the sentences of `run` and `runs` from cli-output 3.4 at revision 24, with the team's calls on HAL-2703 (HAL-2676)

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
- Given a run of Support reply whose step Draft reply failed because OpenAI refused the key in the secret openai-key,
  when its two lines are made,
  then line 1 names the secret and its variable, HALONIC_SECRET_OPENAI_KEY, and line 2 reads "Replace the key in Studio (Settings › Models › OpenAI), or set HALONIC_SECRET_OPENAI_KEY, then run again." (cli-output 3.4).
- Given a finished run that changed 1 file, sent 1 email, asked once and spent an estimated €0.004,
  when its receipt is made,
  then it reads "Changed 1 file · sent 1 email · asked you once · estimated spend €0.004", and a run that sent nothing says "Sent nothing" (cli-output 3.4).
- Given a finished run whose wait step was answered with the event `hold`,
  when `halonic runs show` names what the user answered,
  then it reads "you answered hold at 14:02", and only `approve` and `reject` get their own verb (cli-output 3.4).
