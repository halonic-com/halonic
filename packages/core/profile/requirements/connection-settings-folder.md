# profile.connection-settings-folder

- Status: active
- Since: 0.1.0
- Source: HAL-9044 (9c); plan v1.7 (each connector's "allow sending" is kept in the user's profile, never in a workspace)

The profile package shall name one folder for each connector's settings, `connections` in the profile folder, joined with the profile's own separator, so that `halonic google allow-sending` and every other reader of those settings use the same folder.

## Examples

- Given the Linux profile folder `/srv/acme/.local/share/halonic`, when the connection settings folder is found, then it is `/srv/acme/.local/share/halonic/connections`.
- Given a Windows profile folder `Users\acme\halonic` on drive `<drive>`, when the connection settings folder is found, then it is `connections` in that folder, joined with `\`.
