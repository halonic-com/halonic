# @halonicjs/app-studio

The Studio app. It holds the Studio's feature list: one
`"@halonicjs/studio-feature-<name>": "workspace:*"` dependency per feature,
kept in step with `packages/studio/features/` by `pnpm discover --fix` and
checked by `pnpm check features`. Vite builds two pages apart, so the Android app ships none of the Studio: by default the Android app's own page (`connect.html`, into `dist/connect`), and with `--mode studio` the Studio page (`studio.html`, into `dist/studio`) for the desktop app and the served Studio. `pnpm build` runs both, and `pnpm studio` serves the Studio page while you work (`studio.entry`).

- **Layer:** apps
- **Owner:** elena

## The shell

`src-tauri/` is the Tauri shell, a Cargo workspace whose root package is the
app. On desktop it opens one window with the Studio page (`studio.html`, built
into `dist/studio`; `tauri build` and `tauri dev` build it first), and on
Android one with the connect page (`dist/connect`). Tauri reads that folder
when the shell compiles, so run `pnpm build` here once before a plain
`cargo clippy` or `cargo test` (`studio.desktop-page`). On desktop only, the
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
repo root. It installs per user and puts the repo's `LICENSE` and `NOTICE` next
to the app. Only the "Set up the agent sandbox" step asks Windows for
administrator rights, once.

What it shows (design: the install flow, sections 2.2 to 2.5):

- One page (folder, sandbox box, desktop shortcut box), the step lines, and a
  finish page that says whether the sandbox is ready, or why not.
- Run again with the same version: one page with the sandbox box (or "The agent
  sandbox is set up.") and **Repair Halonic**. Without Repair it copies nothing.
- A newer Halonic already installed: a message, and nothing is installed.
- Halonic open: a message with **Retry** and **Cancel**. The installer never
  closes Halonic itself.
- **Cancel during the steps:** NSIS disables Cancel while the steps run, so the
  sandbox step ends only when Windows' administrator prompt is answered (No
  counts as refused, and the finish page says so).

Silent (`/S`) and passive installs show none of this and skip the sandbox step;
`/S /SANDBOX=1` from an elevated prompt runs it. `/RELAUNCH` reopens Halonic
after a silent install.

The `installer-windows` CI job builds it, walks the pages and the messages
(the pictures are in the job's artifacts), installs it silently into a
temporary folder and uninstalls it again. Signing and the uninstall page are
not built yet.
