# profile.trust-folder

- Status: active
- Since: 0.1.0
- Source: HAL-2612 (the desktop shell's trust store shares the CLI's records); `TrustStore` port v1 (records live in the profile, never in a workspace)

The profile package shall name one folder for the trust records, `trust` in the profile folder, joined with the profile's own separator, so that the CLI and the desktop shell keep their trust records in the same folder. The cases in `src/golden/profile-folders.json` shall give the profile folder and the trust folder they list, with `<drive>` read as `D:`, and the desktop shell's Rust port shall give the same answers for the same cases.

## Examples

- Given Linux, home `/srv/acme` and no variables, when the trust folder is found, then it is `/srv/acme/.local/share/halonic/trust`.
- Given `HALONIC_HOME=/`, when the trust folder is found, then it is `/trust`.
- Given Windows and `HALONIC_HOME` set to the root of drive `D:`, when the trust folder is found, then it is `trust` on that drive, joined with `\`.
