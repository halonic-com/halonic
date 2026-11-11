# @halonicjs/app-studio

The Studio app. It holds the Studio's feature list: one
`"@halonicjs/studio-feature-<name>": "workspace:*"` dependency per feature,
kept in step with `packages/studio/features/` by `pnpm discover --fix` and
checked by `pnpm check features`. Vite builds two pages apart, so the Android app ships none of the Studio: by default the Android app's own page (`connect.html`, into `dist/connect`), and with `--mode studio` the Studio page (`studio.html`, into `dist/studio`) for the desktop app and the served Studio. `pnpm build` runs both, and `pnpm studio` serves the Studio page while you work (`studio.entry`).

- **Layer:** apps
- **Owner:** elena

## The shell

`src-tauri/` is the Tauri shell, a Cargo workspace whose root package is the
app. It opens one window with the page in `connect/`. On desktop only, the
page may also call the commands for git, secrets, trust, runs and the agent
host (`agent_host_request`, `agent_host_stream`, `agent_host_stream_end`),
each behind its own capability in `src-tauri/capabilities/` (`desktop-*.json`)
that is local only, so the Studio the computer serves gets none of them. The
agent host commands take a route of the host's table, never a URL: the shell
starts the host for the profile and makes each call, so the launch token never
reaches the page (`src-tauri/requirements/agent-host-commands.md`).
`src-tauri/gen/android/` is the Android project, generated once by
`tauri android init` and kept in git, so changes to it show up in review.

To build the debug APK yourself you need Rust, Java 17, the Android SDK and
the NDK, with `JAVA_HOME`, `ANDROID_HOME` and `NDK_HOME` set:

```sh
cd apps/studio
pnpm exec tauri android build --debug --apk --target aarch64
```

CI builds it for arm64 and x86_64 in the `android` job and keeps the APK as
a download on the run for seven days.

## The Windows installer

`src-tauri/windows/installer.nsi` is Halonic's own NSIS template, based on
Tauri's (every change is marked "Halonic change", so a Tauri upgrade can be
merged). Run `pwsh windows/build-installer.ps1` in `src-tauri` on Windows x64:
it builds the agent host as one executable, builds the installer with
`tauri.installer.conf.json` (kept apart so plain `cargo` builds don't need the
host binary) and leaves `dist/Halonic-<version>-windows-x64-setup.exe` at the
repo root. It installs per user, with no admin rights. The `installer-windows`
CI job builds it, installs it silently into a temporary folder and uninstalls
it again. The screens, the sandbox step and signing are not built yet.
