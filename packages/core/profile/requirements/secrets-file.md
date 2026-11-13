# profile.secrets-file

- Status: active
- Since: 0.1.0
- Source: HAL-195 (PR 9a-1, approved by Liam on HAL-8325: the CLI gets the path from the profile package)

The profile package shall name one file for the secrets a person sets with `halonic secret`, `secrets/secrets.json` in the profile folder, joined with the profile's own separator, so that every program that reads or writes them finds the same file, and the file sits in a folder of its own that can be made private.

## Examples

- Given the Linux profile folder `/srv/acme/.local/share/halonic`, when the secrets file is found, then it is `/srv/acme/.local/share/halonic/secrets/secrets.json`.
- Given a Windows profile folder `Users\acme\halonic` on drive `<drive>`, when the secrets file is found, then it is `secrets\secrets.json` in that folder, joined with `\`.
