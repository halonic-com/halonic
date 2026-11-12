# @halonicjs/app-studio

The Studio app. It holds the Studio's feature list: one
`"@halonicjs/studio-feature-<name>": "workspace:*"` dependency per feature,
kept in step with `packages/studio/features/` by `pnpm discover --fix` and
checked by `pnpm check features`. Vite builds two pages apart, so the Android app ships none of the Studio: by default the Android app's own page (`connect.html`, into `dist/connect`), and with `--mode studio` the Studio page (`studio.html`, into `dist/studio`) for the desktop app and the served Studio. `pnpm build` runs both, and `pnpm studio` serves the Studio page while you work (`studio.entry`).

On desktop the Studio page starts on the Welcome screen and opens the folders you pick with the `pick_folder` command, each with its own services and the OS keychain as its secrets, and keeps Recent in `localStorage` (`studio.open-folder`). The served Studio opens the one workspace it serves.

- **Layer:** apps
- **Owner:** elena

## Runs in the desktop app

The desktop app registers the Inbox and Runs features. For each folder it
opens, `WorkspaceRuns` (`src/runs/`) gives both the folder's run logs, the
ones the CLI writes, through the shell's `run_*` and `fs_*` commands. While a
page listens, it reads the runs again every 10 seconds and when the window
comes to the front, and tells the page only when a run changed. The window has
no engine of its own yet, so answering a run in the Inbox fails as
`unavailable` until it does (HAL-6602; `studio.workspace-runs`).

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
to the app, with `THIRD-PARTY-NOTICES.txt`: the licences of the bundled npm
libraries and of the Rust crates the app links, which the script writes to
`src-tauri/legal/` with `pnpm check:sbom --notices --cargo`. Only the "Set up the agent sandbox" step asks Windows for
administrator rights, once.

What it shows (design: the install flow, sections 2.2 to 2.7):

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
- **Uninstall:** "Uninstall Halonic?" says first that workspaces aren't
  touched. **Cancel** is the default button. The box "Also remove Halonic's
  settings on this computer" starts unticked. When it is ticked, it removes
  Studio's own data folders (`com.halonic.studio` in `%APPDATA%` and
  `%LOCALAPPDATA%`, which hold Recent and appearance), the profile folder's
  `trust` folder and every workspace's `harness-settings`. Runs, records and
  the rest of the profile folder stay, because the CLI shares them. API keys
  stay in Windows Credential Manager.
- **The sandbox on uninstall:** when the sandbox's Windows account or group is
  there, the uninstaller runs `halonic-agent-host --sandbox-remove`
  (`sandbox-remove.ps1`), and Windows asks for administrator rights once.
  When nothing was set up, it asks nothing. If the person says No, or the
  removal stops, the last page says the account and firewall filters are
  still there, and that installing and uninstalling again removes them. An
  update never removes the sandbox. A silent uninstall removes it only from
  an elevated prompt.

Silent (`/S`) and passive installs show none of this and skip the sandbox step;
`/S /SANDBOX=1` from an elevated prompt runs it. `/RELAUNCH` reopens Halonic
after a silent install.

The `installer-windows` CI job builds it, walks the pages and the messages
(the pictures are in the job's artifacts), installs it silently into a
temporary folder, and uninstalls it through its pages, removing the sandbox.
The runner is an administrator, so CI never sees Windows' prompt: the refused
removal needs a desktop Windows machine. Signing is not built yet.
