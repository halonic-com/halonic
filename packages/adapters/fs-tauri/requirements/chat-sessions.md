# fs-tauri.chat-sessions

- Status: active
- Since: unreleased
- Source: T14 PR plan, PR 3 (HAL-1307); HAL-16792; `ChatSessions` port v1; `contracts.chat-sessions`; the shell's `"chats"` folder (HAL-17305)

The Tauri chat store shall implement `ChatSessions` by calling the shell's `fs_*` commands with the folder `"chats"` and the workspace, keeping each chat as `<id>.json` in the workspace's chats folder in the profile, and pass the `contracts.chat-sessions` suite. It shall never send a path outside that folder. A file that isn't JSON, isn't a saved chat, isn't UTF-8 text, or holds a chat whose id isn't its file's shall be left out of `list`, read as `null` by `load`, and still be replaced by `save` and removed by `delete`; other files in the folder shall be left out. For a workspace the person didn't open it shall reject with a `denied` error; for any other refusal, an answer the shell never gives, or a rejection that isn't the shell's refusal shape, with an `unavailable` error, without the text of a rejection that isn't a refusal.

## Examples

- Given the opened folder `acme`,
  when chat `c-1` is saved,
  then the shell gets `fs_write` with `folder: "chats"`, the path `c-1.json` and `expected: null`, and nothing is written in the workspace.
- Given a chats folder that holds `notes.txt` and `c-4.json` holding chat `c-1`,
  when the chats are listed,
  then neither is in the list, and loading `c-4` gives `null`.
- Given a workspace the person didn't open,
  when its chats are listed,
  then the store rejects with a `denied` error.
