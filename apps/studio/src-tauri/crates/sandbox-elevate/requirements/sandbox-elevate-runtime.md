# studio.src-tauri.crates.sandbox-elevate.sandbox-elevate-runtime

- Status: draft
- Since: 0.1.0
- Source: HAL-7414 (S-9), HAL-8068

When the helper sets up the agent sandbox, it shall put a pinned `vcruntime140.dll` into the admin-only folder under Program Files, next to srt-win's copy, so that srt-win starts on a Windows without the Visual C++ runtime. The file shall come from a copy shipped next to the helper under another name, and the helper shall check its SHA-256 against the one built into it before it writes any of it into that folder. The helper shall never write a `vcruntime140.dll` into the user's app folder. A removal shall delete the copy, and shall still work when the sandbox was set up before the runtime was shipped.

## Examples

- Given a helper in the user's app folder with the shipped srt-win.exe and the pinned runtime next to it,
  when it runs `setup` with administrator rights,
  then `Program Files\Halonic Sandbox` holds `vcruntime140.dll` for Users to read and run, and the app folder holds none under that name.
- Given a runtime that someone swapped,
  when the helper runs `setup`,
  then it exits 33, writes none of it, deletes an earlier copy and runs nothing.
- Given no runtime next to the helper,
  when it runs `setup`,
  then it exits 32 and runs nothing.
- Given a sandbox set up before the runtime was shipped,
  when Installed apps runs the copy's `remove`,
  then the sandbox is removed.
