# agent-host.coding-tools-mode

- Status: active
- Since: unreleased
- Source: HAL-16737 plan, PR 4; HAL-17183

When the agent host executable runs as `--profile-folder <folder> coding-tools [arguments]`, it shall serve Halonic's coding tools server on standard input and output from the payload folder of its version in that profile, without unpacking, claiming or removing anything, and only when that folder holds every payload file with its digest and nothing else; otherwise it shall say so on standard error and exit with 1. When the host runs from an unpacked payload, its harness profile builders shall give the server as this executable in that mode, with the executable and the payload folder as its code paths; from the repo's source they shall give none. On Windows the server is the Linux executable inside Halonic's WSL distro, never a Windows program, so the Windows executable's profile builders shall give none.

## Examples

- Given a host running from its payload folder in the profile,
  when a harness profile builder is made,
  then the server's program is the executable, its arguments are `--profile-folder`, the profile folder and `coding-tools`, and its code paths are the executable and the payload folder.
- Given a host running from the repo's source,
  when a harness profile builder is made,
  then it names no server.
- Given a payload folder that doesn't hold the payload,
  when the executable runs in `coding-tools` mode,
  then it exits with 1 without unpacking it.
- Given the Windows executable running from its payload folder in the profile,
  when a harness profile builder is made,
  then it names no server.
