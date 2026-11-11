# profile.settings-folder

- Status: active
- Since: 0.1.0
- Source: HAL-6159 (the settings host API, design on HAL-6159); the T11 spec on HAL-1294, section 6 (host settings are saved where Halonic runs, never in a workspace file)

The profile package shall name one folder for the settings kept where Halonic runs, `settings` in the profile folder, joined with the profile's own separator, so that the CLI and the Studio read and write the same settings. It shall create nothing.

## Examples

- Given the Linux profile folder `/srv/acme/.local/share/halonic`, when the settings folder is found, then it is `/srv/acme/.local/share/halonic/settings`.
- Given the Windows profile folder `<drive>\Users\acme\halonic`, when the settings folder is found, then it is `<drive>\Users\acme\halonic\settings`.
