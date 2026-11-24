# cli.coding-tools-mode

- Status: active
- Since: unreleased
- Source: HAL-16737 plan, PR 4; HAL-17183

When `halonic coding-tools` runs, the CLI shall serve Halonic's coding tools server on standard input and output, with the arguments after `coding-tools`, before anything else it does at start, so its standard output carries the server's lines only. The CLI's harness host shall give the harness profile builder the server as the same Node runtime running the CLI's entry in this mode, with that runtime and the folder holding the CLI's code as its code paths. On Windows it shall give no server, since a harness runs only inside the WSL distro and never starts a Windows program.

## Examples

- Given the CLI on Linux or macOS,
  when its harness host is built,
  then the server's program is the CLI's Node, its arguments are the CLI's entry and `coding-tools`, and its code paths are that Node and the repo's root (from source) or the CLI's own folder (installed).
- Given the CLI on Windows,
  when its harness host is built,
  then it names no server.
- Given `halonic coding-tools` without `--tools`,
  when it starts,
  then it writes nothing on standard output, says why on standard error and exits with 1.
