# app.doctor-no-sandbox

- Status: active
- Since: 0.1.0
- Source: HAL-5397; HAL-3779 design (section 7)

While the person's choice is no sandbox and the sandbox choice runs it, `halonic doctor` shall have a No sandbox line marked as a warning, with the time and app version of the choice and the limit codes `no-file-fence` and `no-network-fence`. With any other choice, or none, there shall be no such line.

## Examples

- Given a saved `none` and `active` of `none`,
  then the line is ! with both limit codes and the saved time and version.
- Given a saved `srt` setting in use,
  then there is no No sandbox line.
- Given no saved setting,
  then there is no No sandbox line.
