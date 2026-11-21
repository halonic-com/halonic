# paperclip.reviewer-paths

- Status: active
- Since: unreleased
- Source: HAL-15359; reviewer routing decided on HAL-14809 (Liam, board decision, 21 Nov)

When a script routes a pull request on `halonic` to a reviewer, the reviewer path list shall name Liam if the pull request is a security or release change, changes more than 400 lines, or touches one of Liam's paths (a `package.json`, the lockfile and workspace files, `turbo.json`, `biome.json`, `patches/`, `.github/`, `.changeset/config.json`, `tooling/check/`, `tooling/publish/`, `packages/testing/parity/`, `infra/`, `apps/studio/src-tauri/`, `docs/security/`, `docs/adr/`, `SECURITY.md`, or any path containing `sandbox`, `secret`, `sign-in`, `oauth`, `keychain` or `trust` other than a changeset's file name), and Julian otherwise.

## Examples

- Given a 120-line change to `packages/studio/features/inbox/src/view.tsx`,
  when it is routed,
  then it goes to Julian.
- Given a change to `apps/cli/package.json`,
  when it is routed,
  then it goes to Liam.
- Given a change that adds `.changeset/trust-words.md`,
  when it is routed,
  then the file name doesn't count and it goes to Julian.
