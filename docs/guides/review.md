# Reviewing a pull request

What a reviewer checks, and how to write findings so they can be counted.
Who reviews what is in the root `AGENTS.md` ("Review") and in
[CONTRIBUTING.md](../../CONTRIBUTING.md#how-changes-are-reviewed). The
full review of the whole repository before every release is in
[release-review.md](release-review.md).

## Who reviews what

`reviewerFor` in `tooling/paperclip/src/reviewer-paths.ts` picks one of three
roles by the paths and size of a pull request, and `pr_status` names who
covers it. **One reviewer per pull request:** send the task to the reviewer
`pr_status` names, not to whoever seems safest, and the others don't review it
too. A reviewer who gets a pull request outside their scope passes it on.

| Role | Who | Approves alone |
| --- | --- | --- |
| Routine reviewer | Nora | Everything the second reviewer may approve on a team branch (`<agent>/HAL-<n>-…`, not a fork or a bot), except `packages/core/`, `packages/host/`, `packages/testing/spec/`, `tooling/config/`, the Merger's rules (`tooling/paperclip/src/merge-control/`), the review verdicts (`tooling/paperclip/src/verdicts/`, `tooling/paperclip/src/plugin/review-verdict-tool*`), plugin manifests, any file at the root (`AGENTS.md`, `CLAUDE.md`, `CONTRIBUTING.md`, `.npmrc` and the rest) or in a root dot-folder but `.changeset/`, `.claude/` and `.mcp.json` in any folder, `.gitattributes`, the legal files (`LICENSE`, `NOTICE`), security tests and docs (a path with one of the security words), and a public interface (an entry point a package exports, such as `src/index.ts` or `src/api.ts`, or a change to its `exports`) |
| Second reviewer | Julian | Everything outside the maintainer's paths and the security words, up to 1500 changed lines of code (800 in the kernel and the event types) |
| Maintainer | Liam | Everything else: the maintainer's paths, security and release pull requests, anything that changes what a run may do |

Tests, Markdown and wording files don't count toward the line limits. A
renamed file counts by its old path as well as its new one, and one whose old
path isn't known goes to the maintainer. A `changeset-release/` or `release/`
branch, or the `area: trust and sandbox` label, makes a pull request a
security or release one, which goes to the maintainer. The
exact lists are `paperclip.routine-review` and `paperclip.reviewer-paths` in
`tooling/paperclip/requirements/`.

**Plugin manifests need the second reviewer too.** A pull request that
changes a module a Paperclip plugin manifest is built from (`manifestFileOf`:
the `manifest`, `declaration` and `settings` modules in
`tooling/paperclip/src/plugin/` and `tooling/paperclip/src/seats/plugin/`,
every module the manifests import, directly or further down, and the build
files that bundle them) needs the second reviewer's approval on its head as
well as its own reviewer's, at any size. The plugin deployer ships it only
then, so the Merger doesn't queue it before and `pr_status` says so
(`paperclip.manifest-julian`). A test fails when the list misses a module
the manifests' bundle holds (`paperclip.manifest-closure`).

On a pull request outside its scope, the routine reviewer may post a first
pass of findings; the role `pr_status` names still gives the signed approval.
The second reviewer keeps approving within its own scope, and its approval
counts on routine pull requests too. The routine reviewer never approves a
pull request from its own branch. A decision note is still signed by the
maintainer (or, for the maintainer's own pull request, the second reviewer)
right after the routine reviewer's approval, in one quick step.

**Audit.** There is no shadow period (the board's decision of 26 Nov). The
maintainer reads the routine reviewer's approvals afterwards, and the board
then reviews how it did. An escaped `[blocker]` or `[major]` goes on the
maintainer's review task and can narrow the scope again.

## Tag every finding

A finding is something the author should change or decide. Start every
finding with one of four severity tags:

- **`[blocker]`**: the change is wrong or unsafe. A bug, data loss, a
  security hole, a secret, a test that no longer checks anything. It must be
  fixed before merging.
- **`[major]`**: something important is missing or likely to break. New
  behaviour without a test, an unhandled error case, docs that disagree with
  the code. It must be fixed before merging, unless the reviewer agrees to a
  follow-up task.
- **`[minor]`**: worth fixing, with small impact. An unclear name,
  duplicated code, a confusing message. Fix it now or in a follow-up.
- **`[nit]`**: taste. Wording, style, ordering. The author may ignore it.

- **One finding, one tag.** The tag is the first thing on its line: at the
  start of an inline comment, or at the start of a list item in the review
  text (`- [major] The retry has no limit.`).
- **When in doubt, pick the higher tag.**
- **A comment without a tag is not a finding.** Questions, praise and
  context need no tag.
- **Findings on the task use the same tags.** Agents often review on the
  Paperclip task instead of the pull request; the same rule applies there.
- **Don't repeat a tag when you quote a finding.** Quoted lines (`>`) and
  code blocks aren't counted, so a reply that quotes a finding doesn't count
  it twice.
- **A finding counts once it is raised**, whether it is later fixed,
  answered or withdrawn.

We count findings per pull request by severity, to see whether our reviews
and our changes get better over time. Untagged findings are lost to that
count.

## Decision notes

A pull request that needs a decision note comes to review with the note
unsigned, and its `ci-ok` red only because "the note has no signature line".
That counts as ready for review. The reviewer signs in the same run as the
approval, never in a separate round: review, then
`pnpm decision sign <number> --push` from a clean `origin/main` worktree, then
approve the head it prints. If you request changes, don't sign yet. Details:
[checks.md, "Signing with the review"](checks.md#requirement-guard-nothing-that-works-may-break).

## After approval

An approval names the head it was given on. Once a pull request is
approved, its author leaves the branch alone:

- **Don't rebase or push** unless the pull request conflicts with `main`, or
  the merge queue asks for it in a comment on the pull request.
- **Being behind `main` is not a reason.** The merge queue tests the pull
  request on top of current `main` before it lands, so an extra rebase
  checks nothing new.
- **Every push costs a round.** It starts a new CI run and needs a new
  approval on the new head. About one approved pull request in six was
  rebased anyway (HAL-17891), each costing 35 to 90 minutes.
- **When you must push**, push only the fix for the conflict or for what the
  queue asked, and send the pull request back to the reviewer who approved
  it.

Reviewers: don't ask for a rebase after you approve, unless the pull request
conflicts.

## Checklist

Check these on every pull request. The guides for
[the failure path](failure-path.md#checklist-for-reviewers) and
[scenario tests](scenario-tests.md#checklist) add their own lists.

- [ ] Every finding is in this one round, nits included, and so is the
  decision note's `Kind` and `Covers` (run
  `tooling/check/src/cli/guard-notes.ts` on the pull request before you
  write the review). A second round is only for a problem the fix itself
  brought in.
- [ ] The change does what its task asks, and nothing the task doesn't ask.
- [ ] Each requirement it adds or changes has a test linked with
  `verifies()`, and that test fails without the change.
- [ ] No test is skipped, loosened or deleted without a decision note.
- [ ] Errors have a kind and reach the user as a plain sentence, never a
  stack trace or an internal path.
- [ ] No secret, key or token, no real person's name and no absolute local
  path in code, tests, fixtures, docs or the commit message.
- [ ] Input from outside (files, pull requests, model output, the network)
  is checked before it is used, and never run as a command.
- [ ] A new dependency has an entry in `tooling/check/dependencies.json`.
- [ ] A change to a package's public interface (what its `src/index.ts`
  exports) is meant, and the maintainer reviews it. No generated
  `api-report.md` exists yet; the reviewer reads the diff. An API report replaces this once we
  generate one.
- [ ] The docs change in the same pull request as the behaviour.
- [ ] The title is `type(scope): summary` (the scope is optional, and the
  100-character limit is for the summary; the `pr-title` check enforces it),
  and the change is under about 400 lines. No check counts lines, so the
  reviewer does. A pull request with one commit lands with that commit's
  subject, not the title, so its subject must pass too (`pnpm check:enqueue`
  checks it).
- [ ] The pull request has a `built-on:paperclip` or `built-on:halonic` label
  and the matching `Built-on:` line in its description (the `built-on-label`
  check fails without the label). For an outside contributor, the maintainer
  adds the label.
