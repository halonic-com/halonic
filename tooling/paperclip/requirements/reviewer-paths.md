# paperclip.reviewer-paths

- Status: active
- Since: unreleased
- Source: HAL-15359; reviewer routing decided on HAL-14809 (Liam, board decision, 21 Nov), widened on 22 Nov; the router package added on HAL-16998 (Liam's decision on HAL-17007, 23 Nov)

When a script routes a pull request on `halonic` to a reviewer, the reviewer path list shall name Liam if the pull request is a security or release change, changes more than 1200 lines unless every changed file is a test or Markdown, touches one of Liam's paths (the root `package.json`, the lockfile and workspace files, `turbo.json`, `biome.json`, `patches/`, `.github/`, `.changeset/config.json`, `tooling/check/`, `tooling/publish/`, `packages/testing/parity/`, `infra/`, `apps/studio/src-tauri/`, `docs/security/`, `docs/adr/`, `packages/host/router/`, `SECURITY.md`, the reviewer path list itself, or a code path containing `sandbox`, `secret`, `sign-in`, `oauth`, `keychain` or `trust`, where tests, Markdown and wording files (the CLI's `messages/`, `*-words.ts`) don't count), or changes a package's `package.json` together with the lockfile or anywhere inside a field that publishes, installs or pins something (`version`, `private`, `publishConfig`, `bin`, `packageManager`, `engines`, `devEngines`, `pnpm`, or an install or publish script), comparing the manifest at the merge base and the head and counting one it can't read or parse as Liam's, and Julian otherwise.

## Examples

- Given a 600-line change to `packages/studio/features/inbox/src/view.tsx`,
  when it is routed,
  then it goes to Julian.
- Given a change to `apps/cli/package.json` that edits `exports` and leaves the lockfile alone,
  when it is routed,
  then it goes to Julian; with a `version` or `postinstall` change, or a lockfile change, it goes to Liam.
- Given a change to `apps/cli/package.json` that edits `access` inside `publishConfig` and `description`,
  when it is routed,
  then it goes to Liam.
- Given a change to `apps/cli/src/messages/sandbox.ts`,
  when it is routed,
  then the word doesn't count in a wording file and it goes to Julian.
- Given a change to `tooling/paperclip/src/reviewer-paths.ts`,
  when it is routed,
  then it goes to Liam.
- Given a change to `packages/host/router/providers.router.yaml`,
  when it is routed,
  then it goes to Liam, because the router's catalog changes what a run may do.
