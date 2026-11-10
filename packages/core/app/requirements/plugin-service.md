# app.plugin-service

- Status: active
- Since: 0.1.0
- Source: HAL-1735 plan, sections 1 and 5 (`load()`, and one broken plugin never stopping the others), approved by Liam on HAL-4038; the plugins ADR (`docs/adr/2026-11-09-plugins.md`), section 3

The app's `PluginService` shall find every folder at the top of the profile's plugin folder, through the `FolderReader` port, and give one entry for each, sorted by name. It shall read and check each folder as `app.plugin-folder` asks and give the plugin with its trust status from the `TrustService`, or give the folder as broken with every problem found. A link or a special file where a plugin folder should be shall be broken; a file there isn't a plugin and shall be left out. When one plugin can't be read, checked, hashed or trust-checked, that plugin shall be broken, with the error's message, or unreadable when only its trust record can't be read, and the others shall still load. Loading shall fail only when the plugin folder itself can't be listed.

## Examples

- Given the plugin folders `rain` and `weather`, and `broken` between them whose manifest has problems,
  when the plugins are loaded,
  then `broken` is broken with its problems, and `rain` and `weather` are new, each with its real path and a fingerprint that starts with `hpf1:`.
- Given a person trusted the weather plugin with the fingerprint they were shown,
  when the plugins are loaded,
  then it is trusted with a grant; and once a file in it changes, it has changed and has no grant.
- Given the trust record for `rain` can't be read,
  when the plugins are loaded,
  then `rain` is unreadable and `weather` still loads.
- Given the files of `rain` are removed while it is read, and reading `weather` fails,
  when the plugins are loaded,
  then both are broken, and the problem for `weather` gives the error's message.
- Given a `.DS_Store` file and a link `rain` in the plugin folder,
  when the plugins are loaded,
  then the file is left out and `rain` is broken with a `link` problem.
- Given a plugin folder that can't be listed,
  when the plugins are loaded,
  then loading fails.
