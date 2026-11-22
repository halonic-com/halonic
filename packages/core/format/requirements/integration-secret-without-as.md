# format.integration-secret-without-as

- Status: active
- Since: unreleased
- Source: HAL-15880, from Nina's flow check C619 (HAL-15734, item 2), found on HAL-15751; the fields and `as` in quotes and "Halonic reads it as", HAL-16137 (C676 row 41)

When `parseFile` reads an `integration.yaml` whose `secrets` entry has no `as` and has `hosts`, `header`, `field` or `prefix`, the fields only a secret the integration places has, the format shall give one problem for that entry, with the code `unrecognized_keys`, the entry's path and those fields as its `keys`, saying, with each field in quotes, `Secret "<name>" has <fields> but no "as", so Halonic reads it as a sign-in's client secret, which takes only "purpose". Add as: bearer, as: header (with header) or as: form (with field) to say how the kit sends it.`, in place of a `There's no field "<field>"` problem for each of them (`format.missing-key-words`). Any other unknown field of the entry, and an entry that has `as`, keeps the shared words.

## Examples

- Given a secret `notes-key` with `purpose` and `hosts` and no `as`,
  when the sheet is parsed,
  then the one problem says `Secret "notes-key" has "hosts" but no "as", so Halonic reads it as a sign-in's client secret, which takes only "purpose". Add as: bearer, as: header (with header) or as: form (with field) to say how the kit sends it.`, at the `hosts` line.
- Given the same secret with `hosts`, `header` and `prefix`,
  when the sheet is parsed,
  then one problem says `Secret "notes-key" has "hosts", "header" and "prefix" but no "as"`, and so on, where the entry starts.
- Given a secret with `field` and `colour` and no `as`,
  when the sheet is parsed,
  then one problem says to add `as` and the other `There's no field "colour" in "secrets.notes-key".`.
- Given a secret with `as: bearer` and a `header`,
  when the sheet is parsed,
  then the problem says `There's no field "header" in "secrets.notes-key".`.
