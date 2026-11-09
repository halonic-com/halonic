# Changesets

A changeset is a short file that says what changed for the people who use
Halonic. Only what we ship gets a version and a changelog: the CLI and the
Studio app. Every other package is private and has neither.

**The rule:** if users will notice the change, write one sentence a user
would understand. If they won't notice it, write "None (no user-visible
change)". The sentence goes in the Changeset section of the pull request
template.

For the Studio app, also add the sentence as a changeset file with
`pnpm changeset` and pick `@halonicjs/app-studio`. The CLI has no package
yet; until it does, only the pull request template collects its sentences.

Good: `Routines now fire interval triggers at the right time.`
Not good: `Fix off-by-one in tick().`

## One app version

The app's version lives in `apps/studio/package.json` and nowhere else by
hand. `pnpm version-packages` runs `changeset version` and then
`pnpm version:sync`, which copies the version into
`apps/studio/src-tauri/tauri.conf.json`, the `[workspace.package]` table of
`apps/studio/src-tauri/Cargo.toml` and the workspace crates in its
`Cargo.lock`. Every crate says `version.workspace = true`. The `versions`
check in `pnpm check` fails when any of them disagree.

The version starts at `0.1.0`, not `0.0.0`: Tauri derives the Android
`versionCode` from it and refuses `0.0.0`, which would make the code 0.

Private packages are versioned only when their `package.json` has a
`version`: the Studio app and the two packages `tooling/publish` ships to
npm (`@halonicjs/adapter-integration-kit`, `@halonicjs/testing-integration`).
Don't add one to other packages.
