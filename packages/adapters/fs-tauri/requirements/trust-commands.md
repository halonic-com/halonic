# fs-tauri.trust-commands

- Status: draft
- Since: 0.1.0
- Source: HAL-2612, HAL-191 (the `fs-tauri` trust store), HAL-192 (the shell's opened folders), HAL-2652 (plan approval: picked folders only, one question at a time, revoke closes); `TrustStore` port v1

The Tauri trust store shall implement `TrustStore` by calling the shell's `trust_get`, `trust_list`, `trust_grant` and `trust_revoke` commands, sending the record or the location as given, and shall never ask the shell to open a folder by any other command. When the shell refuses a grant because the person said no, the grant shall reject with a `denied` error, and when it refuses one because it is already asking about another folder, with a `conflict` error. When the shell refuses a record as `unreadable`, `get` and `list` shall reject with an error naming the record's location, or its file when the shell can't read the location. An `io` refusal shall reject with an `unavailable` error that keeps the shell's message. A rejection that isn't the shell's refusal shape, such as a page without the `desktop-trust` capability, shall reject with an `unavailable` error that doesn't repeat its text.

## Examples

- Given the person picked `/workspaces/acme` in the folder dialog,
  when `/workspaces/acme/hubs/shared` is granted,
  then the shell receives `trust_grant` with the record, doesn't ask, and the folder joins the opened folders.
- Given no folder was picked,
  when `/workspaces/acme` is granted and the person says no,
  then it rejects with a `denied` error, nothing is saved and no folder is opened.
- Given the served Studio, which has no `desktop-trust` capability,
  when any method is called,
  then it rejects with an `unavailable` error that doesn't hold the shell's text.
