# Decision: Nora goes live as the routine reviewer

- Approval: the board's decision of 26 Nov (no shadow trial, Nora live once she runs, scope set on HAL-18424); Julian's findings on #6385 and his scope list on HAL-18424. Julian signs, since Liam wrote the pull request
- Kind: internal

Nora now covers the `routine-reviewer` role without a routing (`defaultRoles`), so
`reviewerFor` names `nora` for a routine pull request, such as one to
`apps/cli/src/commands/run.ts`. Before she takes the role, the tools that count
approvals know her: the gate in this repository, `pr_status` and the PR watcher count a
signed "Nora: approved on head `<sha>`" only where `routineRefusal` names nothing, never
on a `nora/` branch, and the watcher hands a routine pull request to her.

Julian's review of #6385 found gaps that had to close first:

- A renamed file was routed and gated by its new path only. It now counts by its old path
  too, and a rename whose old path isn't known goes to Liam (`paperclip.reviewer-paths`).
  The gate reads the old paths from a REST compare, since GitHub's GraphQL file list has none.
- A public interface is now any entry point a package exports (`src/index.ts`, `src/api.ts`
  and the other `exports` targets, which a test keeps in step with every `package.json`), or
  a change to a package's `exports`.
- The routine reviewer doesn't approve `tooling/config/`, the root `AGENTS.md` and
  `CLAUDE.md`, `.gitattributes`, or the legal files alone.

Julian's scope list for Nora on HAL-18424 adds more, closed here too:

- The Merger's rules (`tooling/paperclip/src/merge-control/`, tests included), plugin
  manifests, every file at the root and every root dot-folder but `.changeset/` (`.claude/`,
  `.mcp.json`, `.npmrc`, `.pnpmfile.cjs` among them) aren't routine.
- A path with one of the code reviewer's security words isn't routine even in a test or a
  doc, where it doesn't make the path Liam's.
- A pull request the team didn't write (a fork, a bot's branch, any branch not named
  `<agent>/HAL-<n>-…`) isn't routine.
- `sensitive` is no longer always `false`: a `changeset-release/` or `release/` branch, or the
  `area: trust and sandbox` label, sends a pull request to Liam in all three places that
  route it. The author still says so on the task for a security pull request without them.

Test fixtures that expect Nora now say the team wrote the pull request (`ours: true`, a
team branch in this repository), since a pull request without that is never routine.

Tests that named Julian as the reviewer of a routine pull request now name Nora; the
standalone loader's example routes `view.tsx` to Nora.

## Why

The board decided on 26 Nov that Nora goes live as soon as she runs, with no shadow trial,
and that Liam audits her approvals afterwards. Each gap above would let an approval count
outside the scope the board set, so they close in the same change that names her.

## Covers

- paperclip.reviewer-paths
- paperclip.reviewer-routing
- paperclip.routine-review
- paperclip.pr-watcher-handoff
- paperclip.reviewer-paths-standalone
