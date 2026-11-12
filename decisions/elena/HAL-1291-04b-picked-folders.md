# Decision: the shell remembers the folders the person picked, across restarts

- Approval: [HAL-6637](/HAL/issues/HAL-6637), option A, decided by Liam with seven conditions
- Kind: internal

## What changes

`studio.src-tauri.crates.trust-grant.trust-grants` gets a second paragraph and six examples. The
shell remembers each folder the person picks in the folder dialog, in
`<profile>/studio/picked-folders.json`, by its canonical path and, on Unix, its device and inode.
Only a pick adds to the list; no command lets the page add a path. Two new commands, for the
local main window only (`desktop-trust`):

- `reopen_folder(location)` opens a remembered folder again, as a picked folder, only when the
  location is exactly an entry and is still the same canonical path and the same device and
  inode, and moves it first in the list, as Recent moves its row. Otherwise it is refused and
  the entry stays: `not_picked`, `folder_missing`, `folder_changed` or `folder_unreadable`, so
  Studio can tell a moved folder from a refused one.
- `forget_folder(location)` drops the entry and closes the folder opened for it. It only takes
  access away, so the page may call it freely. Trust records stay; removing trust stays
  `trust_revoke`.

The list is fail-closed: a file that can't be read or parsed, or has another version, is an
empty list, and the reason goes to the log. It is replaced through a temporary file and a rename,
and holds at most nine entries, the length of Recent on this device.

`studio.src-tauri.served-page` names the two new commands in its list of what the connect page
may call. The list also gains the `fs_*` commands, which HAL-5761 added to the shell and its
tests without adding them to the sentence.

## Why

The shell forgot every opened folder when it quit, and only the picker or a trust question
opened one again. With a real workspace scope (T3 part 4, HAL-1291), every Recent row would fail
after a restart with "you don't have permission to read it." The rule behind `trust-grants` is
that only a choice the person made in the shell gives access to a folder. A picked folder that
survives a restart still meets it: the person chose it in the shell, the page can't add to the
list, and reopening checks the folder again as a grant does.

Left for later, as Liam allowed: on Windows an entry has no identity yet, because the standard
library has no stable call for a folder's file ID. A folder deleted and made again at the same
path there passes the path check alone. The page side (`reopenFolder`, `forgetFolder` and the
three new refusal kinds in `packages/adapters/fs-tauri`) comes in part 4c.

## Covers

- studio.src-tauri.crates.trust-grant.trust-grants
- studio.src-tauri.served-page
- apps/studio/src-tauri/src/served_page_tests.rs
