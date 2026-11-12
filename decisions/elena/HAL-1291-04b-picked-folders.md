# Decision: the shell remembers the folders the person picked, across restarts

- Approval: [HAL-6637](/HAL/issues/HAL-6637), option A, decided by Liam with seven conditions;
  the profile fence and the Unix identity decided by Liam on [HAL-7039](/HAL/issues/HAL-7039),
  after Priya's security check ([HAL-7040](/HAL/issues/HAL-7040))
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:KB+Y3gSYJATLiFHVV7HuXF7nygz188512S/0yal8IEk287gUy054hvrELJ25MNF2Uyn1/7/ZmkZBg3WvnahBCQ==

## What changes

`studio.src-tauri.crates.trust-grant.trust-grants` gets a second paragraph and seven examples. The
shell remembers each folder the person picks in the folder dialog, in
`<profile>/studio/picked-folders.json`, by its canonical path and, on Unix, its device and inode,
taken from the canonical path the pick opened. On Unix a pick whose device and inode can't be
read still opens but isn't remembered (the reason goes to the log). Only a pick adds to the list;
no command lets the page add a path, and the profile fence below keeps the file commands from
writing the file. Two new commands, for the
local main window only (`desktop-trust`):

- `reopen_folder(location)` opens a remembered folder again, as a picked folder, only when the
  location is exactly an entry and is still the same canonical path and, on Unix, the same device
  and inode, and moves it first in the list, as Recent moves its row. On Unix an entry without a
  device and inode fails closed as `folder_changed`: the shell never writes one, so it was
  written by something else. Otherwise it is refused and
  the entry stays: `not_picked`, `folder_missing`, `folder_changed` or `folder_unreadable`, so
  Studio can tell a moved folder from a refused one.
- `forget_folder(location)` drops the entry and closes the folder opened for it. It only takes
  access away, so the page may call it freely. Trust records stay; removing trust stays
  `trust_revoke`.

The list is fail-closed: a file that can't be read or parsed, or has another version, is an
empty list, and the reason goes to the log. It is replaced through a temporary file and a rename,
and holds at most nine entries, the length of Recent on this device; a longer file is read as its
first nine.

**The profile is off limits to the `fs_*` commands**
(`studio.src-tauri.crates.workspace-files.workspace-files`, a new paragraph and example). Every
workspace call (`fs_list`, `fs_read`, `fs_write`, `fs_remove`, `fs_watch`) refuses a path that is
the profile root or inside it as `private_path`, as it refuses `.git`; lists and watches leave the
profile out, and a workspace that is the profile or inside it is refused as a whole. The check
compares the workspace's real path with the profile's real path, worked out as far as it exists,
so a profile not made yet or named through a link is fenced too, and compares names as a
case-folding file system might open them. The shell's own `folder: "review"` calls, which work in
the profile by design, are unaffected. A profile that can't be found refuses the call, so the
fence is never left off.

`studio.src-tauri.served-page` names the two new commands in its list of what the connect page
may call. The list also gains the `fs_*` commands, which HAL-5761 added to the shell and its
tests without adding them to the sentence.

## Why

Priya's security check found that with the home folder opened, `fs_write` could write
`.local/share/halonic/studio/picked-folders.json`, since only `.git`, `.studio` and `.env*` were
private. A forged entry for `/` would then open the whole disk after a restart, with no dialog.
Fencing the profile closes that and protects the trust records and the run store the same way,
while home stays openable as a workspace. Liam chose this over refusing home as a workspace (a
normal use) and over sealing the list with a keychain HMAC (more machinery than the gap needs).

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
- studio.src-tauri.crates.workspace-files.workspace-files
- studio.src-tauri.served-page
- apps/studio/src-tauri/src/served_page_tests.rs
