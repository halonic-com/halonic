# profile.profile-folder

- Status: active
- Since: 0.1.0
- Source: HAL-191; HAL-2022 G4, applied to the Studio on HAL-2077; HAL-3588 (the sandbox's crash journals); HAL-1736 (the plugins folders)

The profile package shall find the profile folder from `HALONIC_HOME` when it is set, and otherwise from the system's user data folder: `%LOCALAPPDATA%\halonic` on Windows, `<home>/Library/Application Support/halonic` on macOS, and `$XDG_DATA_HOME/halonic` or `<home>/.local/share/halonic` on Linux, so that the CLI and the Studio always share one profile. An empty variable shall count as unset, and a relative `XDG_DATA_HOME` or `LOCALAPPDATA` shall be ignored. When `HALONIC_HOME` or the home folder is not absolute, it shall throw a `RangeError`. It shall name the folder for the sandbox's crash journals, `sandbox-journals` in the profile folder, joined with the profile's own separator. It shall name the folder for the plugins, `plugins`, and the folder for their records, `plugin-records`, in the profile folder the same way.

## Examples

- Given Linux, home `/srv/acme` and no variables, when the profile folder is found, then it is `/srv/acme/.local/share/halonic`.
- Given Linux and `XDG_DATA_HOME=/srv/data`, when the profile folder is found, then it is `/srv/data/halonic`.
- Given macOS and home `/srv/acme`, when the profile folder is found, then it is `/srv/acme/Library/Application Support/halonic`.
- Given Windows and `LOCALAPPDATA` set to the `Local` folder of a home, when the profile folder is found, then it is the `halonic` folder inside it, joined with `\`.
- Given `HALONIC_HOME=/srv/halonic/`, when the profile folder is found, then it is `/srv/halonic` on every system.
- Given `HALONIC_HOME=profile`, when the profile folder is found, then it throws a `RangeError`.
- Given the Linux profile folder `/srv/acme/.local/share/halonic`, when the sandbox journal folder is found, then it is `/srv/acme/.local/share/halonic/sandbox-journals`.
- Given the Linux profile folder `/srv/acme/.local/share/halonic`, when the plugins folder and the plugin records folder are found, then they are `/srv/acme/.local/share/halonic/plugins` and `/srv/acme/.local/share/halonic/plugin-records`.
