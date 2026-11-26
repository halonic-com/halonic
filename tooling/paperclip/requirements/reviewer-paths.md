# paperclip.reviewer-paths

- Status: active
- Since: unreleased
- Source: HAL-15359; reviewer routing decided on HAL-14809 (Liam, board decision, 21 Nov), widened on 22 Nov; the router package added on HAL-16998 (Liam's decision on HAL-17007, 23 Nov); the Paperclip provider's request list added on HAL-17467; the routing files added on HAL-17982; the 1500-line limit and the kernel and event types limit decided on HAL-18459 (Liam, 25 Nov); the approval-counting files and the path list's prefix added on HAL-19246; renamed files counted by both paths on HAL-19283 (Julian's finding on #6385)

When a script routes a pull request on `halonic` to a reviewer, the reviewer path list shall name Liam if the pull request is a security or release change, changes more than 1500 lines, or more than 800 lines in `packages/core/engine/src/kernel/` or `packages/core/events/`, counting neither tests, Markdown nor wording files and counting every line of the pull request when it doesn't know a file's lines, touches one of Liam's paths (the root `package.json`, the lockfile and workspace files, `turbo.json`, `biome.json`, `patches/`, `.github/`, `.changeset/config.json`, `tooling/check/`, `tooling/publish/`, `packages/testing/parity/`, `infra/`, `apps/studio/src-tauri/`, `docs/security/`, `docs/adr/`, `packages/host/router/`, the Paperclip provider's request list (`packages/adapters/paperclip-client/src/requests.ts`), `SECURITY.md`, the reviewer path list itself (any file whose path starts with `tooling/paperclip/src/reviewer-paths`), the code that counts signed approvals (`tooling/paperclip/src/merge-control/approval.ts`, `merge-control/signed.ts`, `pr-tools/approvals.ts`), the routing that says who covers each role (`tooling/paperclip/src/routing.ts` and `routing-load.ts`, their test and requirement, `packages/core/format/src/snapshot/routing.ts` and its requirement), or a code path containing `sandbox`, `secret`, `sign-in`, `oauth`, `keychain` or `trust`, where tests, Markdown and wording files (the CLI's `messages/`, `*-words.ts`) don't count), or changes a package's `package.json` together with the lockfile or anywhere inside a field that publishes, installs or pins something (`version`, `private`, `publishConfig`, `bin`, `packageManager`, `engines`, `devEngines`, `pnpm`, or an install or publish script), comparing the manifest at the merge base and the head and counting one it can't read or parse as Liam's, and Julian otherwise. A renamed file shall count by its old path as well as its new one, and a renamed file whose old path it doesn't know shall make the pull request Liam's.

## Examples

- Given a 600-line change to `packages/studio/features/inbox/src/view.tsx`,
  when it is routed,
  then it goes to Julian.
- Given a 1400-line change to `packages/core/app/src/a.ts`,
  when it is routed,
  then it goes to Julian; at 1600 lines it goes to Liam.
- Given 2000 changed lines in tests and Markdown only,
  when it is routed,
  then it goes to Julian.
- Given a change with 900 lines in `packages/core/events/src/run-events.ts`,
  when it is routed,
  then it goes to Liam.
- Given a change to `apps/cli/package.json` that edits `exports` and leaves the lockfile alone,
  when it is routed,
  then it goes to Julian; with a `version` or `postinstall` change, or a lockfile change, it goes to Liam.
- Given a change to `apps/cli/package.json` that edits `access` inside `publishConfig` and `description`,
  when it is routed,
  then it goes to Liam.
- Given a change to `apps/cli/src/messages/sandbox.ts`,
  when it is routed,
  then the word doesn't count in a wording file and it goes to Julian.
- Given a change to `tooling/paperclip/src/reviewer-paths.ts`, a new `tooling/paperclip/src/reviewer-paths/routine.ts` or `tooling/paperclip/src/merge-control/approval.ts`,
  when it is routed,
  then it goes to Liam.
- Given a change to `packages/host/router/providers.router.yaml`,
  when it is routed,
  then it goes to Liam, because the router's catalog changes what a run may do.
- Given a change to `packages/adapters/paperclip-client/src/requests.ts` alone,
  when it is routed,
  then it goes to Liam, because a new request widens what the board key may do.
- Given a change to `tooling/paperclip/src/routing.ts` or `packages/core/format/src/snapshot/routing.ts`,
  when it is routed,
  then it goes to Liam, because the routing decides who reviews.
- Given a pull request that renames `tooling/paperclip/src/reviewer-paths.ts` to `tooling/paperclip/src/routing/reviewer-paths.ts`, or renames a file without naming its old path,
  when it is routed,
  then it goes to Liam.
