# fs-tauri.discarded-copies

- Status: draft
- Since: unreleased
- Source: HAL-10581 (Changes page: Undo these changes and Discard), review of PR #3020; `source-control.discard`; private entries of the `DefinitionStore` port (`ports.definition-store-private-entries`)

The desktop app shall keep a copy of what a discard throws away in `.studio/discarded` of the open workspace, a folder the workspace's own store refuses as private.

A Tauri definition store made with `folder: "discarded"` shall call the shell's `fs_write` command with the workspace it was made for and `folder: "discarded"`, and shall write only below `.studio/discarded`. The shell shall take nothing else for that folder: `fs_list`, `fs_read` and `fs_remove` with it are refused with `private_path`. The shell shall make `.studio` and `discarded` on the first write only, refuse a link in either with `private_path` and make nothing behind it, and refuse a workspace that isn't open with `folder_not_open`. The workspace's own store shall go on refusing every path in `.studio`.

## Examples

- Given a store for `/workspaces/acme` with `folder: "discarded"`,
  when it writes `2026-11-16T10-00-00.000Z/hubs/a.yaml`,
  then the shell receives `fs_write` with the workspace, `folder: "discarded"` and that path, and the workspace's own files are unchanged.
- Given that store,
  when it lists, reads or removes a path,
  then the shell refuses the call with `private_path`.
- Given `.studio` in the workspace is a link to another folder,
  when a copy is written,
  then the write is refused and nothing is made in the other folder.
