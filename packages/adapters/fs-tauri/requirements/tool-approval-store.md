# fs-tauri.tool-approval-store

- Status: active
- Since: 0.1.0
- Source: HAL-8868 (PR 2 of 4a, plan approved by Liam on HAL-8904); `ToolApprovalStore` port v1; `contracts.tool-approval-store`; `studio.src-tauri.tool-approval-folder`

The Tauri tool approval store shall implement `ToolApprovalStore` by calling the shell's `fs_*` commands with the folder `"tool-approvals"`, the key's workspace and its source, and shall never send a path outside that folder. It shall keep the files `FileToolApprovalStore` keeps, an approval in the SHA-256 of the tool's name and `.json`, and the waiting versions in `waiting.json`, in the text of `@halonicjs/adapter-tool-approval-kit`. It shall believe a file only when it is exactly as Halonic writes it, throwing `UnreadableToolApprovalError` naming the tool otherwise, and never overwrite a file a newer Halonic wrote. `list` shall read only the files named like an approval. Every write shall name the text it read, so when another write came between, the store shall read and decide again, and after 5 such changes in a row reject with an `unavailable` error. When the shell refuses a name, it shall reject with a `RangeError`; for a workspace the person didn't open, with a `denied` error; and for any other refusal, with an `unavailable` error carrying the shell's message; and for a rejection that isn't the shell's refusal shape, such as a page without the capability, with an `unavailable` error without that text. A file that isn't UTF-8 text shall be read by `approve`, `revoke` and `noteWaiting` as a damaged one, as `FileToolApprovalStore` does.

## Examples

- Given the source `notes` in the opened folder `acme`,
  when an approval is stored,
  then the shell gets `fs_write` with `folder: "tool-approvals"`, `source: "notes"` and the file name `<hash of the tool's name>.json`.
- Given a folder that also holds a file named `lock`,
  when the approvals are listed,
  then the file is left out.
- Given another write to `waiting.json` between the store's read and its write,
  when a waiting version is noted,
  then the store reads again and keeps both changes.
- Given an approval written by a newer Halonic,
  when the page approves the same tool,
  then it rejects naming the tool, and the file is as it was.
