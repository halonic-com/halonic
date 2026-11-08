# integration.reads-the-sheet

- Status: active
- Since: 0.1.0
- Source: HAL-135 (switch the suite to the permission sheet once HAL-143 lands; recordings checked against `@halonicjs/format/recording`)

The conformance suite shall take an integration's permission sheet as data, check it with the sheet's own schema, load the integration through the kit's loader as Halonic does (so the sheet's limits and `{ fromSetting }` hosts apply), fail when the code differs from the sheet in any way the loader checks, and fail any recording that isn't a valid `halonic.recording/1` file.

## Examples

- Given a sheet with an unknown key,
  when the declaration is checked,
  then it fails with "the sheet is invalid" and `unrecognized_keys`.
- Given code whose `forecast` description differs from the sheet,
  when the declaration is checked,
  then it fails naming `"forecast" differs in description`.
- Given a recording whose method is `get`,
  when the declaration is checked,
  then it fails with "isn't a valid halonic.recording/1 file".
- Given a `{ fromSetting: url }` host and no `url` setting,
  when the policy is checked,
  then it fails with `setting-missing`.
- Given `limits: { maxResponseBytes: 1 }` in the sheet,
  when a case runs,
  then it fails because the kit refused the larger response ("is larger than 1 bytes").
