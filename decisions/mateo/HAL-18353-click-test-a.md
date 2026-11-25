# Decision: the Studio preview workflow clicks through the installed app on Windows

- Approval: the task asks for this change (HAL-18353, plan approved with changes on HAL-18317);
  Liam approves and signs this note in review
- Kind: internal

## What changes

`.github/workflows/studio-preview.yml`, the hand-run unsigned Windows preview build:

- a `build-ref` input on `workflow_dispatch`: the installer is built from that ref, and the suite and
  scripts come from the workflow's own ref;
- the installer now packs the WSL image and runtime, as CI and the release already do;
- a new `click-test` job on `windows-2025`, after `installer`. It installs the release-version
  setup, updates it silently with the preview, turns on WSL, checks that `Halonic.lnk` starts the
  installed `Halonic.exe`, and starts a throwaway Paperclip (`paperclipai`, pinned, loopback
  `local_trusted`, on the runner's own PostgreSQL), seeded with a company, a task and a card. Then
  it runs `packages/testing/studio-click-test` and puts its table, screenshots and results in the
  job summary and an artifact.

The suite drives the app with `msedgedriver`, downloaded only from Microsoft's HTTPS host at the
installed WebView2's version, with its version and SHA-256 in the summary. It attaches to Halonic's
WebView2 on a DevTools port that WebView2's registry policy opens on the runner, as
`test-update.ps1` already does. `tauri-driver` from the plan isn't used: it starts the app with a
variable that the shell's own browser arguments override, so the port never opened. No secret,
token or Paperclip of ours is used. After a failing step the suite stops every Halonic process,
starts Halonic from its shortcut again and goes on, so one run lists every failure (the board's
direction on HAL-18353).

A `build-ref` run reuses the installers an earlier run built from the same commit: the installer
job uploads both setups as `halonic-installers-<commit>` (7 days), `resolve` looks that artifact up,
and when it exists the WSL and installer jobs are skipped and `click-test` downloads it from that
run (the board's direction on HAL-18353: a suite change shouldn't rebuild). A run without
`build-ref` always builds, since its preview version is numbered by the run. For this, `resolve`
and `click-test` get `actions: read` besides `contents: read`; nothing gets write rights.

With #6071 and #6142 on `main`, the workflow also runs on pushes to `main`, and publishes them:

- `publish` now needs `resolve` and `installer`, runs only on `main` without a `build-ref`, and
  names `needs.resolve.outputs.sha` as its source, so a run that names an older build never
  publishes it (the board's decision on HAL-18477). It doesn't wait for `click-test`, which reports
  only, until the click test is proven on `main`; a later PR adds that.
- Only a build of `main`'s own commit saves the Rust cache (`!inputs.build-ref`).
- The WSL jobs and `click-test` get the installer's one-per-branch `concurrency`, so a burst of
  merges queues one of each instead of one per merge.

`tooling/check/policy.json` gets `extraExports` entries for the `./words` entry points of
`studio-feature-assistant`, `studio-feature-connections`, `studio-feature-messenger` and
`studio-shell` (`./welcome-words`), so the suite compares against the wording the app ships.

`apps/studio/src/studio/installer-preview-version.test.ts` now expects the paths the workflow uses
after the `build-ref` split (the script from the workflow's ref, the older setup from the checkout).
The test checks the same things as before. `apps/studio/src/studio/preview-auto-build.test.ts`
expects the Rust cache save's stricter condition (`!inputs.build-ref` added); it still checks one
save, only on `main`. `apps/studio/src/studio/preview-publish.test.ts` expects `publish`'s new
`needs: [resolve, installer]` and its stricter `if:` (`!inputs.build-ref` added).

## Why

The board got an installer whose Messenger and engine failed on a real PC (HAL-18311). This click
test catches that on every preview build, before the board gets an installer.

## Tests

`packages/testing/studio-click-test` (`studio-click-test.steps`), and the workflow run on this
branch with `build-ref=9115b95`.

## Covers

- .github/
- tooling/check/policy.json
