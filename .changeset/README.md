# Changesets

A changeset is a short file that says what changed for the people who use
Halonic. Only what we ship gets a version and a changelog: the CLI and the
Studio app. Every other package is private and has neither.

**The rule:** if users will notice the change, write one sentence a user
would understand. If they won't notice it, write "None (no user-visible
change)". The sentence goes in the Changeset section of the pull request
template.

Also add the sentence as a changeset file with `pnpm changeset` and pick
`@halonicjs/app-studio`. This goes for the CLI too: it has no versioned
package yet, so its changes go into the app's changelog, which is
Halonic's one changelog.

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
`version`: the Studio app. Don't add one to other packages. The npm
packages `tooling/publish` builds, one per layer, carry their version in
`tooling/publish/layers/<layer>/layer.json`, outside changesets.

## Releasing

The Version packages workflow (`.github/workflows/version-packages.yml`)
runs on every push to `main`. While changesets are waiting, it keeps one
pull request open, "chore(release): Halonic <version>", on the branch
`changeset-release/main`, made with `pnpm version-packages`. Merging it is
the release decision: the run finds that the merged pull request is titled
"chore(release): Halonic <version>", with the version the app has now, and
tags the merge commit `v<version>`. Changing the version in any other pull
request never makes a tag.

The first release, 0.1.0, had no Version packages pull request: it went
out as the hand-made pull request "chore(release): Halonic 0.1.0", which
wrote the 0.1.0 section of `apps/studio/CHANGELOG.md`. Every release after
it is made from changesets. Use `patch` until the board decides otherwise
for a release.
