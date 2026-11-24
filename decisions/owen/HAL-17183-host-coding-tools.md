# Decision: the CLI and the agent host start the coding tools server; its code in the data folder is reopened read-only

- Approval: Paperclip task HAL-17183 (PR 4b of the HAL-16737 plan); Liam approves this note in review
- Kind: internal

The hosts now give the harness profile builder a coding tools server, so fenced Claude Code and Codex runs get `mcp__halonic-tools__…`. This changes one requirement and adds two.

- `harness-kit.coding-tools-server`: a code path inside Halonic's data folder is kept out of that folder's deny and reopened read-only, as the instructions folder is. The agent host's payload is unpacked in the profile (`agent-host/<version>-<digest>`), which the profile denies, so without this the outside check would refuse the host's server on every run. A code path a writable folder holds is still neither reopened nor named.
- New: `cli.coding-tools-mode` (`halonic coding-tools`, run by `bin/halonic.js` before `main.ts`, so nothing else reaches standard output) and `agent-host.coding-tools-mode` (`halonic-agent-host --profile-folder <folder> coding-tools`).

Why this shape:

- The same runtime and entry the host already runs, so no new program is installed. The CLI names its Node and its entry; its code paths are that Node and the repo's root from source, or its own folder once installed. The agent host names its own executable; its code paths are the executable and the payload folder.
- The agent host's mode only reads: it runs only when the payload folder holds every payload file with its digest and nothing else, and never unpacks, claims or removes anything, since the fence lets it change nothing there.
- Windows: the CLI names no server on Windows, and the agent host there is the Linux executable inside Halonic's WSL distro, so a harness never starts a Windows program.
- Reopening the payload exposes only Halonic's own code, read-only, which is public.

## Covers

- harness-kit.coding-tools-server
