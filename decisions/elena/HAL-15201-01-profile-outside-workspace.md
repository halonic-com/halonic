# Decision: refuse every profile inside a workspace except the built-in default

- Approval: Liam approved the rule on HAL-15201 (comment of 21 Nov, answer 1 and 2) and signs this note in the review of this pull request
- Kind: user-visible
- Signature:

Nothing stopped the profile folder from being inside a workspace. A profile in a workspace that git tracks comes and goes with a pull or a checkout, and with it the trust records, the yes to run without the sandbox and the placements ("On this computer"), so whoever pushes to that repo controls the profile (Julian's finding I1 on HAL-15195).

**The rule.** Work out the profile path again as if no variables were set: the home folder plus the platform's own data folder (`builtInProfileFolder`). If the real profile isn't that path, and it is the workspace or inside it, the workspace is refused (`profile-in-workspace`). The refusal's reason names the variable that put the profile there: `HALONIC_HOME`, or else `XDG_DATA_HOME` on Linux or `LOCALAPPDATA` on Windows. Its fix always says to set `HALONIC_HOME` to the new place: the other two point at a parent folder, and `LOCALAPPDATA` moves every other app's data too (Sofia's words on HAL-15232). A workspace that is the profile or inside it is refused too, whichever profile it is (`workspace-in-profile`). Paths are compared from their real paths as far as they exist, with names compared as a file system that folds case might open them, as the shell's `Fence` compares them.

**Why the built-in default stays allowed.** It lands in a workspace only when the home folder itself is the workspace, which Liam kept allowed on HAL-7039. There the sandbox denies the data folder, Studio's file commands fence it, and the CLI's workspace store fences it too (HAL-15201, PR 3). Moving the profile is something the person or their setup chose (a `HALONIC_HOME`, or an `XDG_DATA_HOME=<repo>/.data` from a dev container or direnv), and the fix is easy.

**Left open.** A dotfiles repo in the home folder could still track the built-in profile. The fences cover Halonic's own writes; git isn't one of them. The threat model says so.

The CLI refuses in `openWorkspaceDir`, `halonic init` and `halonic extract` in this pull request; Studio's shell, the engine host and the agent host follow in the next one with the same golden cases (`packages/core/profile/src/golden/profile-places.json`). No requirement was changed or retired and no test was removed.

## Covers

- profile.profile-outside-workspace
- cli.profile-outside-workspace
- apps/cli/src/profile-place.test.ts
- packages/core/profile/src/golden/profile-places.json
