# Area owners

Who is told when part of `main` breaks. Every push to `main` runs the full CI
matrix. When a job fails there, the task for it goes to the owner of that job's
area, and Liam is told on it. The owner fixes or reverts within 2 hours of the
task being created.

This table only routes failures. It doesn't change who reviews a pull request
(see Review in [AGENTS.md](../../AGENTS.md)), and it doesn't replace the owner
each package names in its `package.json` (`"halonic": { "owner" }`): that owner
looks after one package, the area owner after a part of the product.
`.github/CODEOWNERS` stays on `@halonic-com/maintainers`, because every agent
commits as `halonic-dev` and GitHub can't route by agent.

## Areas

Read the table from the top: a file belongs to the first area whose paths match
it. A path ending in `/` covers everything under it.

| Area | Owner | Paths |
| --- | --- | --- |
| Sandbox | Julian | `packages/adapters/sandbox-*/`, `packages/adapters/connector-stdio-sandbox/`, `apps/cli/fence/` |
| Integrations | Tomas, with Ravi | `packages/adapters/integration-*/`, `packages/adapters/mcp/`, `packages/adapters/model-*/`, `packages/adapters/http-*/`, `packages/adapters/token-store/`, `packages/adapters/sign-in-loopback/`, `packages/adapters/tool-approval-kit/`, `packages/core/oauth-sign-in/`, `packages/core/google-setup/`, `packages/host/integration-sign-in/`, `packages/host/google-sign-in/`, `packages/testing/integration/`, `packages/testing/sign-in/` |
| Studio | Elena | `apps/studio/`, `packages/studio/` |
| Engine and CLI | Priya | `apps/cli/`, `packages/core/engine/`, `packages/core/workflow/`, `packages/core/routines/`, `packages/core/test-runner/`, `packages/core/workspace/`, `packages/host/server/`, `packages/targets/`, `packages/testing/cloudflare-live/`, `examples/` |
| Adapters | Owen | `packages/adapters/`, `packages/host/harness-host/`, `apps/agent-host/`, `packages/testing/harness-checks/` |
| Tooling and CI | Mateo | `tooling/`, `.github/`, `infra/`, `patches/`, `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `turbo.json`, `biome.json` |
| Docs | Maya | `docs/`, the Markdown files at the repo root |
| Shared code and everything else | Liam | `packages/core/` (ports, events, app and the other shared packages), `packages/testing/`, `decisions/`, anything not listed above |

A failure caused by a change that crosses areas goes to Liam. For Integrations,
the task goes to Tomas and Ravi is told on it; either of them can take it.

## CI jobs

Most CI jobs check one area. A failing job goes to its area's owner.

| Area | Jobs in `ci.yml` | Other workflows |
| --- | --- | --- |
| Sandbox | Sandbox fence (bubblewrap), Sandbox fence (Seatbelt), Sandbox fence (MXC on Windows 11), Sandbox packages on macOS, Sandbox packages on Windows, Sandbox fence on Windows (canary probes) |  |
| Studio | Tauri shell (Rust checks), Tauri shell on Windows, Keychain contract on macOS, Android shell (debug APK), Android device keys (emulator), Studio end-to-end (Playwright) | `android-screens.yml` |
| Engine and CLI | Live cloud suites passed |  |
| Adapters | Agent host executable |  |
| Tooling and CI | Changed areas, Fast gates, Leak guard, Coverage floors don't go down, Secret scan (gitleaks), Workflow lint (zizmor), Requirements and the requirement guard, Empty package and feature pass every check, Policy rules, Windows installer, Windows update, ci-ok | the jobs in `scheduled.yml` |
| Docs | Docs build and link check |  |

Two jobs test every package: "Typecheck, lint, test, build" and "Merge base's
tests (no cache)". When one of them fails, the task goes to the area of the
package that failed, using the paths above. If the log doesn't name a package,
it goes to Liam.

## The nightly

Every night `scheduled.yml` runs `tooling/check/src/cli/main-failures.ts`. It
reads the newest finished push run of `ci.yml` on `main` and the newest
`android-screens.yml` run, sorts their failed jobs into areas with the tables
above, and opens or updates one GitHub issue per failing area, labelled
`nightly:<area>` (for example `nightly:engine-and-cli`). It closes the issue of
an area that is green again, and then starts `android-screens.yml` for the next
night. A job that also failed on the run from the night before is marked
"second night in a row". Each morning a Paperclip routine turns the open
`nightly:*` issues into tasks for the area owners and tells Liam.
