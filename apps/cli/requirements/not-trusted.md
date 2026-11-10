# cli.not-trusted

- Status: active
- Since: 0.1.0
- Source: HAL-188 build plan items 10 and 10a (stack 4a); HAL-2043 (the fingerprint is never shortened); HAL-2013 G6 and HAL-2022 (`error.fingerprint` in the `not_trusted` error); the CLI output design on HAL-1981 (cli-output section 4)

When a command refuses because the workspace isn't trusted on this computer, the `halonic` command shall exit with 3, write the command's trust check and then the error's ✕ line and fix line to stderr, and write the workspace's full fingerprint, `hfp1:` and 64 lower-case hex characters, as the last line of stdout with nothing else on that line. With `--json`, it shall write only the error document to stdout, with `kind` `not_trusted`, `code` `not-trusted` and the full fingerprint in `fingerprint`. The fingerprint shall never be shortened, broken across lines or cut with "…".

## Examples

- Given a command that refuses because Acme isn't trusted,
  when it runs without a terminal,
  then stderr ends with "✕ Acme isn't trusted on this computer yet." and its fix line, the last stdout line matches `^hfp1:[0-9a-f]{64}$`, and it exits with 3.
- Given the same command with `--json`,
  when it runs,
  then stdout is one document whose `error` has `kind` `not_trusted`, `code` `not-trusted` and the full `fingerprint`, and it exits with 3.
- Given the trust check's lines,
  when the command refuses,
  then they come on stderr before the ✕ line.
