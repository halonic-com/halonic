# @halonicjs/testing-studio-click-test

Clicks through the installed Studio on Windows, the way a person does, and writes a pass/fail table
with a screenshot per step (HAL-18317). The board's first live check failed at step 1 on an install
that had passed every package test (HAL-18311); this is the test that runs the real install.

- **Layer:** testing
- **Owner:** mateo
- **Public API:** `@halonicjs/testing-studio-click-test`

## How it runs

The `click-test` job in `.github/workflows/studio-preview.yml` runs it on a hosted `windows-2025`
runner, after the `installer` job:

1. installs the release-version setup, then updates it silently with the preview setup;
2. turns on WSL (`wsl --install --no-distribution`), so the app imports its own distro as on a PC;
3. checks that the Start menu's `Halonic.lnk` starts the installed `Halonic.exe`;
4. starts a throwaway Paperclip (`paperclipai`, pinned, on the runner's PostgreSQL), seeded with a
   company, a task and a board card, and never ours;
5. sets WebView2's registry policy that opens Halonic's DevTools port, starts the `msedgedriver`
   of the installed WebView2, and runs `pnpm --filter @halonicjs/testing-studio-click-test click-test`,
   which starts Halonic through `Halonic.lnk` and attaches to it.

No installer artifact unless the click test passed on this build: only a passing run keeps the
preview setup as the `halonic-studio-preview-windows` artifact (HAL-18356). There is no override;
a flaky run is fixed, not bypassed. Every night `scheduled.yml` also runs it on `main`, when
anything the installed app is built from, or the click test, changed since the last nightly run, and a
failure there opens "Failing on main: Desktop app" (`docs/guides/area-owners.md`).

The shell gives WebView2 its own browser arguments, which beat the variable `msedgedriver` (and
so `tauri-driver`) would use to open that port, so the driver attaches instead of starting the app.

The steps, in `src/steps/`:

| # | Step | Requirements | Passes when |
| --- | --- | --- | --- |
| 1 | The engine answers | `shell.welcome-start`, `shell.welcome-sample`, `agents.chat.try-it`, `agents.chat.engine-quiet`, `studio.workspace-agents-chat` | Open demo turns on, and the demo's Writer agent answers a message in its Try it chat ("Writer replied."; the demo's mock model needs no key) with no "The engine isn't answering" line |
| 2 | Messenger shows its empty state | `studio.installer-focused-apps`, `studio.focused-app-window`, `messenger.not-connected` | the Halonic Messenger shortcut opens a window with No connections |
| 3 | Connect Paperclip | `studio.desktop-connections`, `connections.connect-dialog`, `connections.connection-row`, `services.paperclip-connect` | Settings › Connections › Connect Paperclip, approved on the test Paperclip, shows Connected |
| 4 | The demo is the shown workspace | `workspace.try-sample`, `studio.try-sample`, `workspace.workspace-window`, `workspace.workspace-menu`, `workspace.menu-sample-tag`, `workspace.recent-workspaces`, `shell.window-title` | the window title reads "*page* · *workspace* · Halonic", and the workspace switcher's menu lists `Acme sample` under Recent with the Demo tag, then Open a folder… |
| 5 | The window tabs | `shell.window-tab-strip`, `shell.tab-set`, `shell.window-keys` | New tab adds a tab to the Open tabs strip, Ctrl W closes it and Ctrl Shift T brings it back |
| 6 | Close workspace | `workspace.workspace-window`, `shell.welcome-open`, `shell.welcome-recent`, `shell.welcome-sample` | the workspace menu's Close workspace shows Welcome, with the demo under Recent with the Demo tag, and Open demo |
| 7 | Theme | `settings.feature`, `settings.appearance-section`, `settings.appearance-theme` | Settings › Appearance › Theme Dark sets the window's `data-theme="dark"`, and System takes it off again |
| 8 | Formats | `settings.formats-section`, `settings.formats-format` | Settings › Formats' example turns Dutch (`12.345,60`) after Dutch (Netherlands), and back after Follow this computer |
| 9 | Agent sandbox and About Halonic | `settings.agent-sandbox-section`, `settings.agent-sandbox-state`, `settings.about-section` | Agent sandbox shows a state chip without a button pressed, and About Halonic shows Check now and Update Halonic automatically |

Steps 4 to 6 are the Studio basics (HAL-18866), steps 7 to 9 Settings (HAL-18867). Close workspace
ends the basics because it leaves the window on Welcome; a later step that needs a workspace, such
as each Settings step, opens the demo again from there.

Each step names, in its file, the requirement ids it checks (`requirements`), and the results table
shows them in its Requirements column. The package's tests fail when a step names none, or an id
that isn't a requirement file in the repo (HAL-18862). A new step names its requirements the same way.

After a failing step the suite restarts the app (it stops every Halonic process, starts Halonic from
its shortcut again and attaches) and goes on, so one run lists every failure. A step that needs an
earlier one that didn't pass is "skipped"; if the app won't restart, the rest are "not run". A
failure's code is the words file's name for
the error line on screen, such as `LIST_FAILED`. The expected text comes from the features' words
files (their `./words` entry points), so a copy change moves the test with it. Text no entry point
exports (place names, the Try it chat's words, the demo's agent) is in `screenText`, and Settings'
words in `settingsText`; `words.test.ts` checks each is still in its file.

Step 3 approves the sign-in as the test Paperclip's board. Studio opens the approval page in a
browser, and only that page's address holds the challenge's secret, so Studio reaches the
Paperclip through a recording proxy (`src/paperclip-board.ts`) that keeps the challenge from
Paperclip's answer.

## Example

On the Windows runner, with `msedgedriver` on `127.0.0.1:9515` and the policy set to
`--remote-debugging-port=9222` (PowerShell):

```powershell
$env:HALONIC_DEVTOOLS = '127.0.0.1:9222'
$env:HALONIC_SHORTCUTS = "$env:APPDATA\Microsoft\Windows\Start Menu\Programs"
$env:PAPERCLIP_URL = 'http://127.0.0.1:3100'
$env:CLICK_TEST_OUT = 'click-test'
$env:CLICK_TEST_BUILD = '9115b95'
pnpm --filter @halonicjs/testing-studio-click-test click-test
```

Results: `click-test/results.json`, `click-test/results.md` and `click-test/screenshots/NN-step.png`.
To test an older build with today's suite: `gh workflow run studio-preview.yml -f build-ref=<commit>`.
Such a run reuses the installers an earlier run built from that commit (the
`halonic-installers-<commit>` artifact, kept 7 days), so a change to the suite alone skips the build.
