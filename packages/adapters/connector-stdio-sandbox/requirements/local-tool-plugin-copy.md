# connector-stdio-sandbox.local-tool-plugin-copy

- Status: active
- Since: unreleased
- Source: HAL-12343 (the time between a local tool's trust check and its program reading its script); the plugins ADR (`docs/adr/2026-11-09-plugins.md`), section 4

The `copyCheckedPlugin` function shall copy the files a plugin's trust check hashed from the plugin's folder into a new folder, writing each file only when the bytes it read hash to the SHA-256 the check listed, and writing exactly those bytes. It shall fail with `PluginFileChangedError`, naming the file's path and never its contents, at the first file that differs, is missing or can't be read, or, on Linux and macOS, is a link, and copy nothing after it. It shall refuse a folder for the copy that already exists, and a listed path with an empty name, `.`, `..`, `\` or `:`, before it copies anything. A file in the plugin's folder that the check didn't list shall not be copied.

## Examples

- Given a plugin folder holding the files its trust check hashed,
  when it is copied,
  then the new folder holds the same files with the same bytes.
- Given a script edited after the trust check,
  when the plugin is copied,
  then it fails with `PluginFileChangedError` naming the script, and the script isn't in the copy.
- Given, on Linux or macOS, a file the check listed that is now a link to another file with the same bytes,
  when the plugin is copied,
  then it fails with `PluginFileChangedError` naming that file.
- Given a file added to the plugin's folder after the check,
  when the plugin is copied,
  then the copy doesn't hold it.
- Given a listed path `../outside.js`,
  when the plugin is copied,
  then it throws a `RangeError` and makes no folder.
