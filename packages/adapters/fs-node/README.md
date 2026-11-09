# @halonicjs/adapter-fs-node

The `DefinitionStore` port on the local file system with Node: workspace
files are plain files under a root folder. The CLI (`halonic validate`,
`test`, `run`) and the parity run use it. A JSONL `RunStore` follows.

- **Layer:** adapters
- **Owner:** tomas
- **Runtime:** node
- **Public API:** `@halonicjs/adapter-fs-node`

## Definitions in a folder

`new FolderDefinitionStore(root)` keeps each file at its path under `root`
and passes the shared `DefinitionStore` contract suite.

- **Paths** are checked with the port's own rules from `@halonicjs/ports`,
  the same code the memory adapter uses: no `..`, no absolute path, no
  `.git`, `.studio` or `.env` files.
- **Links:** a symbolic link or a Windows junction in any segment of a path
  is refused with a `RangeError`, even one that points inside the root.
  `list()` leaves links out, with everything under them.
- **Version:** `sha256:` and 16 hex characters over the files it serves,
  worked out as the memory adapter does, so the same files give the same
  version in both.
- **Limits:** a path is checked, then used. A program that swaps a folder
  for a link in between could get past the check; the store guards its own
  callers, not against other programs writing into its root. A write
  replaces the file in place, without a temporary file.

## Example

Added together with the run store.
