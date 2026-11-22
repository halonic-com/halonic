# Decision: the connector page names a stopped program's file and gives the line to run

- Approval: Tomas decides the words as the team on HAL-15809 (https://paperclip.halonic.com/HAL/issues/HAL-15809), from flow check C634 (#5) on HAL-15803 (HAL-2282 rule: a small wording on an approved screen, built on the CLI's approved words and the page's existing CommandBox).
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:4UTLvPuHiJdzMF5Uzsoa8OfSGbAn/4zF5TldiN+VV1HGB5UGweZoeWpo1ucHGOk8BiNYWfZ0Mz06l7JBZtqiDg==

## What changes

A connector whose program stops right after it starts made the connector page say "… To see why,
run the command and args from its connector file yourself." The CLI names the file; the page named
neither the file nor the command, so a person who uses only Studio didn't know what to run, and
**Try again** fails the same way.

- The desktop app's listed-tools host passes on, with the `program-stopped` cause, the connector
  file's path in the workspace and the line that starts the program by hand: `cd` to the folder it
  starts in (`cwd` read from the workspace folder), then its command and args, each one POSIX shell
  word. Its `env` and secrets are not in it, as the CLI's "the command and args" leaves them out.
- The page names the file in code type, as `halonic tools review` names it, and ends "yourself:"
  with the line in a CommandBox (with **Copy**) under it. A Windows folder gets no line, since
  Studio starts the program there itself and a POSIX line wouldn't run in its terminal; the line
  then ends "yourself." as before. A connector no file holds keeps "its connector file".
- **Try again** stays: once the person has fixed what stops the program, it lists the tools.

## Tests

No test is removed or weakened. The existing load-failure test now checks the line in its new
parts; new tests cover the host's file and line (and none for a Windows folder), the line's
quoting and `cwd`, the words with and without a line, and the page's box with **Copy command**.

## Covers

- library.listed-tools-waiting
- studio.workspace-listed-tools
