# Reviewing a pull request

What a reviewer checks, and how to write findings so they can be counted.
Who reviews what is in the root `AGENTS.md` ("Review") and in
[CONTRIBUTING.md](../../CONTRIBUTING.md#how-changes-are-reviewed).

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

## Checklist

Check these on every pull request. The guides for
[the failure path](failure-path.md#checklist-for-reviewers) and
[scenario tests](scenario-tests.md#checklist) add their own lists.

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
  `api-report.md` exists yet; the reviewer reads the diff.
- [ ] The docs change in the same pull request as the behaviour.
- [ ] The title is `type(scope): summary` (the scope is optional, at most 100
  characters; the `pr-title` check enforces it), and the change is under about
  400 lines. No check counts lines, so the reviewer does.
