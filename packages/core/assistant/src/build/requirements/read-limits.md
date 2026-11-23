# assistant.build.read-limits

- Status: active
- Since: unreleased
- Source: HAL-16788 (Liam's condition on the T14 plan); HAL-65 section F, rules A and B; HAL-16790

The Build chat's `read_file` and `list_files` shall read and list only paths `propose_file` may write: never a path outside the workspace, in `.git/` or `.halonic/` however it is spelled, private as the `DefinitionStore` port defines it, or through a symbolic link, and while the workspace is untrusted only Halonic item files. They shall check the path before the store is touched and refuse with "Couldn't read <path>: it can't be read." or, for a file that isn't an item while untrusted, "Not trusted yet: only Halonic items can be read.".

## Examples

- Given the model calls `read_file` for `.git/config`, `.halonic/review/files/a.json`, `.Halonic./review/files/a.json`, `../outside.txt` or `/etc/hosts`,
  then the result is "Couldn't read <path>: it can't be read.".
- Given `shared` is a symbolic link,
  when the model calls `read_file` for `shared/notes.md`,
  then the result is "Couldn't read shared/notes.md: it can't be read.".
- Given an untrusted workspace,
  when the model calls `read_file` for `package.json`,
  then the result is "Not trusted yet: only Halonic items can be read.".
- Given the model calls `list_files`,
  then the list leaves out `.git/`, `.halonic/` and symbolic links, and `list_files` with `under: ".git"` or `under: "../"` is refused.
- Given an untrusted workspace with `package.json` and `hubs/sales/agents/sorter.agent.yaml`,
  when the model calls `list_files`,
  then the list is only `hubs/sales/agents/sorter.agent.yaml`.
