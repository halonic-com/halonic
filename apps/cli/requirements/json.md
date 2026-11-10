# cli.json

- Status: active
- Since: 0.1.0
- Source: HAL-2184; the CLI output design on HAL-1981 (cli-output sections 1.3, 1.8 and 2, and the checklist items "Exit code", "Streams" and "`--json`" in section 5), approved by the board on HAL-2123; the `--json` section of the CLI reference on HAL-1986

A `halonic` command shall return what it did, and the CLI shall print it: its lines on stdout, each mark as the stream shows it, or with `--json` anywhere before a `--`, exactly one JSON document on stdout instead. The document shall start with `"outputVersion": 1` and `ok`, which is true when the command exits with 0, followed by the command's own fields. A failed command, including a wrong command line, shall give `"ok": false` and an `error` with its `kind` (`usage` for a wrong command line), its `code` when it has one, its `message` and its `fix` when it has one, in the same words as the error's lines without `--json`, and with stderr empty. A bug's own text shall stay out of the document, and every loaded secret shall be removed from it. The exit code shall be the same with and without `--json`. With `--json` and `--debug`, the error's own text shall go to stderr.

## Examples

- Given `halonic schema --json`,
  when it has written the schemas,
  then stdout is one document with `outputVersion` 1, `ok` true, `folder` "./schemas", the `files` it wrote and their `count`, and it exits with 0.
- Given `halonic schema` on a terminal that isn't UTF-8,
  when it has written the schemas,
  then its line starts with `ok` instead of ✓.
- Given a `not_found` error "The moon isn't here." with a fix and `--json`,
  when the command fails,
  then stdout is one document with `ok` false and an `error` with kind `not_found`, that message and that fix; stderr is empty and the exit code is 4.
- Given `halonic --json deploy`, with no command called deploy,
  when it is run,
  then the `error` has kind `usage`, the message 'There's no command "deploy".' and the fix "Run halonic --help to see every command.", and the exit code is 2.
- Given a failure without a kind and `--json --debug`,
  when the command fails,
  then the `error` has kind `internal` and the sentence for a bug, none of the error's own text, and the error's stack goes to stderr.
