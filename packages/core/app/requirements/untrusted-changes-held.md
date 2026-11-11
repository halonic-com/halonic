# app.untrusted-changes-held

- Status: active
- Since: 0.1.0
- Source: HAL-65 section F, `workspace.trust.untrusted-changes-held` (rule C, HAL-3268); agreed on HAL-3362; HAL-3277

When the assistant writes a file while the workspace is untrusted, the review service shall mark its record as written untrusted, and keep the mark through later writes until the record goes. While the mark is there, the Try it and Test source shall use the file's baseline whole, even after the workspace is trusted, and count its line changes as left out from before trust.

## Examples

- Given the assistant changed workflow `intake` while the workspace was untrusted, and the person then trusted it,
  when Try it asks for its source,
  then the source has `intake` as it was, and says it leaves out 1 change from before trust.
- Given the same, and the person accepts the change to `intake`,
  when Try it asks for its source,
  then the source has the new `intake` and leaves nothing out.
