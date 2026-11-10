# app.plugin-contributions

- Status: active
- Since: 0.1.0
- Source: HAL-1735 plan, section 1 (`tools()` and `ui()`), approved by Liam on HAL-4038; the plugins ADR (`docs/adr/2026-11-09-plugins.md`), sections 2 and 4

The app shall give the declared tools of every trusted plugin, one set for each part that declares any (the backend first, then each local tool in manifest order), with each tool's `risk` and `untrusted` as the manifest declares them and the plugin's trust grant. It shall give the `ui` of every trusted plugin that has one, as plain data, with the plugin's id and name. A plugin that is new, changed, unreadable or broken shall give no tools and no UI.

## Examples

- Given the weather plugin is trusted, with a backend and the local tool `files`,
  when its tools are asked for,
  then there is a `backend` set with `forecast` (`read`, untrusted) and `post-report` (`send`), then a `local:files` set with `list-files`, each with the plugin's grant.
- Given the weather plugin is trusted and has settings and a command,
  when the UI is asked for,
  then it gives the weather plugin's `ui` with its id and name.
- Given the rain plugin is new, a third one changed and a fourth is broken,
  when the tools and the UI are asked for,
  then none of them gives any.
- Given a trusted plugin with only local tools and no `ui`,
  when the tools and the UI are asked for,
  then it gives no `backend` set and no UI.
