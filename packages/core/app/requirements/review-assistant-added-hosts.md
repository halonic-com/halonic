# app.review-assistant-added-hosts

- Status: active
- Since: unreleased
- Source: HAL-525 (the "added by the assistant" mark); HAL-18271 plan rev 2, section 2.4, with Liam's change B; HAL-18397

When the person accepts an assistant change to a local integration's permission sheet (`integrations/<folder>/integration.yaml`), the review service shall record each fixed host the change adds that the sheet didn't have before the change and that the person didn't name in their own messages in the chat that wrote it. The record shall be kept in the workspace's review folder in the profile, keyed by the integration's folder and the host, never in the workspace, so a workspace file can neither set nor remove a mark. Rejecting a change shall record nothing. A host shall show as added by the assistant only while the sheet still has it, and the next accepted change to that sheet shall drop the marks of hosts it no longer has. When the person's messages can't be read, the person named nothing. A host the person later types into the file by hand keeps its mark, since the two can't be told apart.

## Examples

- Given a sheet with `notes.example.com`,
  when the person accepts a change that adds `api.example.com`, which they didn't name,
  then `api.example.com` is marked and `notes.example.com` isn't.
- Given the same change,
  when the person rejects it,
  then nothing is recorded.
- Given a marked host,
  when the person removes it from the sheet,
  then it isn't marked.
- Given a workspace file that claims a mark,
  when the marks are read,
  then there are none.
- Given the person named `api.example.com` in the chat,
  when they accept a new sheet with `api.example.com` and `cdn.example.com`,
  then only `cdn.example.com` is marked.
