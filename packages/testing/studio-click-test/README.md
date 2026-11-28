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
4. starts a throwaway Paperclip (`paperclipai`, pinned, on the runner's PostgreSQL), never ours,
   which the suite seeds with a company, an agent, a task, a board card on it and a chat
   (`src/test-paperclip.ts`; Agent Chat is an experimental setting the seed turns on);
5. sets WebView2's registry policy that opens Halonic's DevTools port, starts the `msedgedriver`
   of the installed WebView2, and runs `pnpm --filter @halonicjs/testing-studio-click-test click-test`,
   which starts Halonic through `Halonic.lnk` and attaches to it.

No installer artifact unless the click test passed on this build: only a passing run keeps the
preview setup as the `halonic-studio-preview-windows` artifact (HAL-18356). There is no override;
a flaky run is fixed, not bypassed. Every night `scheduled.yml` also runs it on `main`, when
anything the installed app is built from, or the click test, changed since the last nightly run, and a
failure there opens "Failing on main: Desktop app" (`docs/guides/area-owners.md`).

A merge's build runs only the short check plus the steps its change touched (HAL-18863). The job
lists the paths changed since main's last green build (in `CLICK_TEST_CHANGED`), and the suite
runs (`src/affected.ts`):

- the short check, the step marked `shortCheck` (the app installs, starts and its engine answers);
- each step that one of these paths touches: one of its requirement files, anything in the folder
  that holds that requirement's `requirements/` folder (for `messenger.not-connected`,
  `packages/studio/features/messenger/`), or the step's own file in `src/steps/`;
- the steps those need.

A change to the suite's other code or to `studio-preview.yml` runs every step, and so do the
nightly run and a run by hand, which list nothing. The results table names the steps a build left
out.

The shell gives WebView2 its own browser arguments, which beat the variable `msedgedriver` (and
so `tauri-driver`) would use to open that port, so the driver attaches instead of starting the app.

The steps, in `src/steps/`:

| # | Step | Requirements | Passes when |
| --- | --- | --- | --- |
| 1 | The engine answers | `shell.welcome-start`, `shell.welcome-sample`, `agents.chat.try-it`, `agents.chat.engine-quiet`, `studio.workspace-agents-chat`, `studio.open-folder-before-engine`, `shell.engine-starting` | Open demo turns on, and the demo's Writer agent answers a message in its Try it chat ("Writer replied.", or its reply in the transcript, no longer busy and with no failed, stopped or model-call-limit line; the demo's mock model needs no key) with no "The engine isn't answering" line; once it replied, no "Starting the engine…" line is left |
| 2 | Messenger shows its empty state | `studio.installer-focused-apps`, `studio.focused-app-window`, `messenger.not-connected` | the Halonic Messenger shortcut opens a window with No connections |
| 3 | Connect Paperclip | `studio.desktop-connections`, `connections.connect-dialog`, `connections.connection-row`, `studio.src-tauri.paperclip-key-keep` | Settings › Connections › Connect Paperclip, approved on the test Paperclip, shows Connected |
| 4 | The account switcher opens Settings › Connections | `connections.account-switcher` | the sidebar's account switcher shows "Show Inbox and Messenger for", and its Settings › Connections row opens the section with the connection |
| 5 | The row and who it's signed in as | `connections.connection-row`, `connections.connection-user`, `agent-host.paperclip-signed-in-user` | the row reads Read-only and Connected, has no Sign in again, and its label names the signed-in user |
| 6 | A restart keeps the Paperclip sign-in | `services.paperclip-restore`, `connections.connection-row` | after Halonic quits fully and starts again from its shortcut, the reopened demo's row reads Connected with no Sign in again, and Halonic Messenger lists the seeded chat, not No connections |
| 7 | Connect Paperclip refuses plain http | `connections.connect-dialog` | `http://paperclip.acme.test` gets the https-only line on the field, and the dialog closes |
| 8 | Add another account | `connections.add-account`, `agent-host.paperclip-add-account` | a second sign-in, approved, lists two connections; the step then disconnects the second, which stays listed as Not connected (or Signed out), leaving step 3's the only connected one |
| 9 | Inbox | `inbox.every-waiting-item`, `inbox.decisions`, `paperclip-client.approval-fields`, `studio.desktop-agent-messaging`, `kit.plain-row-size`, `kit.plain-row-fit`, `kit.avatar-badge`, `inbox.row-meta-wraps`, `inbox.header-avatar`, `inbox.proposal-page` | the seeded card shows, its row is 72px high with a 48px avatar, its title clamped to two 20px lines, its meta line cut on one and its avatar's badge 20px, Approve answers it, and the test Paperclip has it approved |
| 10 | Messenger | `studio.focused-app-window`, `messenger.chat-rows`, `messenger.send-text`, `messenger.agent-pictures`, `kit.avatar-picture`, `kit.avatar-on-row-fill`, `kit.plain-row-size`, `kit.content-header`, `kit.prompt-look` | a message in the seeded chat, in the Halonic Messenger window, is a comment on the test Paperclip; the chat's row is 72px high with a 48px picture; the chat header is 64px high with no bottom border, and the message box has 26px corners and is at least 52px high (`studio-click-test.conversation-look`) |
| 11 | Search | `studio.desktop-search-overview`, `search.palette` | Ctrl+K and the seeded task's title find the task |
| 12 | Overview and recap | `studio.desktop-search-overview`, `overview.place` | Overview shows the recap and the blocked list |
| 13 | Start menu shortcuts | `studio.installer-focused-apps`, `studio.focused-app-window` | with Halonic running, Halonic Inbox opens a new window in it, and Halonic Messenger shows the seeded chat |
| 14 | Quick ask's box | `quick-ask.box-look`, `studio.src-tauri.focused-apps`, `studio.src-tauri.quick-ask-window` | a second start with `--app ask` shows the box in the `ask` window; once the agent chip shows (up to 30 s), the box has 8px corners and the dialogs' shadow, and its message box has 26px corners and holds the chip and Ask; Esc hides it again (`studio-click-test.quick-ask-look`) |
| 15 | A yes/no card, in the Inbox and the Messenger | `inbox.agent-inbox-items`, `messenger.inline-cards` | its seeded copies (the Inbox's from the board, the Messenger's from the agent's run) answer Accept in the Inbox and Reject in the chat, and the test Paperclip has each so |
| 16 | A plan approval's Reject needs a reason | `inbox.option-note`, `messenger.option-note` | in the Inbox, Reject opens "Why are you rejecting this?" and sends the reason, which the test Paperclip keeps; the chat leaves Reject out, says so, and Accept answers it |
| 17 | A one-question card | `inbox.agent-inbox-items`, `messenger.inline-cards`, `paperclip-client.question-cards` | an option's button answers each copy, and the test Paperclip has that option |
| 18 | A checkbox confirmation | `inbox.agent-inbox-items`, `messenger.question-cards`, `paperclip-client.card-kinds` | ticking Email and Blog in the Inbox and Social in the chat, then Submit, leaves the test Paperclip with each copy accepted with those picks |
| 19 | Item verdicts | `inbox.agent-inbox-items`, `messenger.question-cards`, `paperclip-client.card-kinds` | a verdict per item (Approve and Defer, the other way round in the chat), then Submit, leaves each copy answered with those verdicts |
| 20 | Suggested tasks | `inbox.agent-inbox-items`, `messenger.question-cards`, `paperclip-client.card-kinds` | ticking one draft on each surface, then Submit, leaves each copy accepted, with that draft made and the other skipped |
| 21 | Disconnect | `studio.src-tauri.paperclip-key-keep` | Disconnect says the key is revoked, and the test Paperclip refuses that key |
| 22 | The demo is the shown workspace | `workspace.try-sample`, `studio.try-sample`, `workspace.workspace-window`, `workspace.workspace-menu`, `workspace.menu-sample-tag`, `workspace.recent-workspaces`, `shell.window-title` | the window title reads "*page* · *workspace* · Halonic", and the workspace switcher's menu lists `Acme demo` under Recent with the Demo tag, then Open a folder… |
| 23 | The window tabs | `shell.window-tab-strip`, `shell.tab-set`, `shell.window-keys` | New tab adds a tab to the Open tabs strip, Ctrl W closes it and Ctrl Shift T brings it back |
| 24 | Close workspace | `workspace.workspace-window`, `shell.welcome-open`, `shell.welcome-recent`, `shell.welcome-sample` | the workspace menu's Close workspace shows Welcome, with the demo under Recent with the Demo tag, and Open demo |
| 25 | Theme | `settings.feature`, `settings.appearance-section`, `settings.appearance-theme` | Settings › Appearance › Theme Dark sets the window's `data-theme="dark"`, and System takes it off again |
| 26 | Formats | `settings.formats-section`, `settings.formats-format` | Settings › Formats' example turns Dutch (`12.345,60`) after Dutch (Netherlands), and back after Follow this computer |
| 27 | Settings' two columns | `shell.settings-two-columns`, `kit.list-column` | Settings › Appearance's list column ("Settings sections") is 34% of the dialog's row, between 208px and 380px, and only the current row has a fill, in Light and in Dark; System again after (`studio-click-test.settings-two-columns-look`) |
| 28 | Agent sandbox and About Halonic | `settings.agent-sandbox-section`, `settings.agent-sandbox-state`, `settings.about-section` | Agent sandbox shows a state chip without a button pressed, and About Halonic shows Check now and Update Halonic automatically |
| 29 | Writer's Try it chat comes back | `agents.chat.saved`, `agents.chat.first-load`, `kit.chat-message`, `kit.chat-message-corner` | in the demo the Settings steps opened again, Writer opened from the Agents list shows step 1's message, in a filled bubble with 7.5px corners (`studio-click-test.conversation-look`) |
| 30 | A key in a Try it message is held | `agents.chat.box-lines` | a message with a made-up key stays out of the chat while the key line shows, and Send anyway sends it |
| 31 | The Model page checks the harness | `agents.configuration.harness-model` | on Writer's page, Configuration (after the panel's button in the 800 px window) › Harness › Codex, then Model › `default` (the demo's test model) shows "This model can't be used with Codex. Choose another.", and Writer goes back to Halonic |
| 32 | The places open | `shell.sidebar-places`, `inbox.page`, `inbox.request`, `runs.app-list`, `library.library-place`, `library.library-page`, `source-control.changes-page` | with Settings closed, Inbox, Runs, Library and Changes each open from Places and show their own text (New request, the Runs app's "No runs yet today.", the Skills sentence, a Changes state); every place is tried, and the note names each that failed |
| 33 | The focus ring after a click | `shell.focus-ring-after-pointer` | from Welcome (the demo closed first), Open demo leaves the page's title focused with no ring and `<html data-input="pointer">`; Shift alone keeps that mark and Tab turns it to `keyboard`; then Enter on Runs in Places opens that page, whose title takes focus with the ring |
| 34 | A wait step's answers | `inbox.wait-card` | in a 1280 × 800 window, the demo's Support reply, started from New request with an invented email, waits at its review step, and that card's Reject and Approve sit in one right-aligned row at their natural width, Approve at the right end |

Steps 4 to 8 cover the Connections requirements (`requirements/connections-steps.md`, HAL-18868).
They and steps 9 to 21 come straight after Connect Paperclip: the restart after a failing step used
to sign step 3's connection out (HAL-19027), so a failure in between would fail them too. Step 6
restarts the app on purpose, whatever the step before did, and checks the sign-in survives it: the
board's acceptance for HAL-18910 on every preview build. Not covered, because the click test can't bring them about on a real install: the list
failing (`connections.list-retry`), a signed-out or expiring key, and a keychain that refuses the key.

Steps 9 to 21 are the rest of the phase 1 list on the connected Paperclip (HAL-18354), which the
suite seeds itself, with quick ask's box (step 14, HAL-20826) and the card kinds (steps 15 to 20,
HAL-19002) after the Start menu shortcuts, and Disconnect last. Steps 22 to 24 are the Studio basics
(HAL-18866), steps 25 to 28 Settings
(HAL-18867). Close workspace
ends the basics because it leaves the window on Welcome; a later step that needs a workspace, such
as each Settings step, opens the demo again from there. Steps 29 and 30 are Try it (HAL-18869);
they come straight after Settings so they find step 1's chat in that reopened demo. The Build chat
has no step: the desktop app doesn't load the Assistant feature. Step 31 puts Writer in Codex
for the Model page's check (HAL-18930) on the page Try it leaves open, and back on Halonic. Step 32
opens the other places (HAL-18870), so its page visits come after Try it has read the chat.
Steps 33 and 34 come last (HAL-20621): step 33 closes and reopens the demo, and step 34 leaves
its run waiting in the Inbox.
The app opens at 800 × 600, a narrow window
where the sidebar sits behind ☰ Places and the tabs fold into "1 open tab ▾", so each basics step
sizes the window to 1280 × 800 first and gives it its size back afterwards (HAL-19048).

Each step names, in its file, the requirement ids it checks (`requirements`), and the results table
shows them in its Requirements column. The package's tests fail when a step names none, or an id
that isn't a requirement file in the repo (HAL-18862). A new step names its requirements the same way.

After a failing step the suite restarts the app (it stops every Halonic process, starts Halonic from
its shortcut again and attaches) and goes on, so one run lists every failure. A step that needs an
earlier one that didn't pass is "skipped"; if the app won't restart, the rest are "not run". A
step marked `restartsFirst` (step 6) gets the same restart before it runs. A
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

Steps 4 to 21 need step 3. Steps 9, 10 and 15 to 21 also check their click through the test
Paperclip's API, not only on screen. Step 21 checks that the test Paperclip refuses the key Studio signed in
with, which the suite reads from the recording proxy.

Results: `click-test/results.json`, `click-test/results.md` and `click-test/screenshots/NN-step.png`.
To test an older build with today's suite: `gh workflow run studio-preview.yml -f build-ref=<commit>`.
Such a run reuses the installers an earlier run built from that commit (the
`halonic-installers-<commit>` artifact, kept 7 days), so a change to the suite alone skips the build.

To post a run's table and screenshots on a Paperclip task, an agent runs, from the repo root, with
its own `gh` and its run's Paperclip key in the environment (CI never holds one):

```sh
pnpm exec node tooling/paperclip/src/cli/post-click-test.ts <run id> <task, such as HAL-18317>
```
