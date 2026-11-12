# Release review

Before anything goes public, the whole repository gets a full, independent,
read-only review by the strongest model available. This guide says when it
runs, how to run it, what goes in the report and what blocks a release. The
board decided the rule on 12 Nov 2026 (HAL-5210, HAL-7359).

This review comes on top of the normal pull request review in
[review.md](review.md). It doesn't replace it.

## When it runs

A full review runs before each of these:

1. **Every release tag:** the "Version packages" merge that tags
   `v<version>`, the hand-made 0.1.0 release pull request, and any hotfix tag.
   Test tags (`-test`) and dry runs don't need one.
2. **Every public launch:** the soft launch, the announcement day and any later
   launch moment.
3. **Anything new becoming public:** a repository going public, a first package
   on npm, a new public package, or docs moving to a new public domain.

Deploys of halonic.dev and docs.halonic.dev from `develop` in the
`halonic-com/website` repository don't need one. The
rule applies again when that content goes to halonic.com.

### How fresh it must be

The review covers the **exact commit** being released, or a commit at most
**7 days and 50 merged pull requests** older. In that second case, a **delta
review** covers the diff between the reviewed commit and the release commit,
with the same model and settings, over the changed files and what they touch.
If more has changed, run a new full review.

Run the full review early, about 5 days before the release, on the release
candidate. That leaves time for fixes. Then run a delta review on the final
commit if it changed.

## Who does what

| Step | Who |
| --- | --- |
| Asks for the review when a release candidate is cut | Release owner |
| Runs the review, writes the report header, files the report privately | Security reviewer |
| Re-checks Critical and High findings, creates fix tasks, triages Medium and Low | Maintainer, with the security reviewer |
| Checks that each fix closes its finding (delta review if needed) | Security reviewer |
| Puts the counts and any exceptions on the release card | Whoever prepares the release card |
| Signs exceptions and approves the release | Board |
| Checks that the review passed for the head commit before merging the release pull request | Maintainer (merge captain) |

Nobody reviews code they wrote alone. The review runs in a fresh session with
no memory of the team's tasks or of earlier reviews, never inside an agent
that wrote the code under review.

## How to run it

- **Model:** the strongest generally available Claude model on the day. On
  12 Nov 2026 that is Claude Fable 5.1 (`claude-fable-5-1`). When a newer top
  model comes out, use it and write it in the header. Never step down to a
  cheaper model without the board's yes.
- **Effort:** `max`, for the lead reviewer and every sub-reviewer.
- **Checkout:** a fresh clone of the release commit. Read only: no pushes,
  comments, issues or pull requests. `pnpm install` and targeted tests are
  allowed to confirm a finding.
- **Shape:** the lead reviewer maps the repository and splits it into about
  eight slices. Seven sub-reviewers each read one slice in parallel. The lead
  reads the security core in full and re-checks every Critical and High
  finding.
- **Findings:** no limit on the number. Each one has a severity (Critical,
  High, Medium, Low), a status (CONFIRMED or PLAUSIBLE), a `file:line` and a
  failure scenario.
- **Usage limit:** if the seat hits its usage limit, resume the run when the
  limit resets and note the pause in the header.

## Report header

Every report starts with this table. Fill in every row.

| Field | What to write |
| --- | --- |
| Repo and commit | Repository, branch and full commit hash, and the release it is for |
| Model | Model name and ID |
| Effort | `max`, lead and sub-reviewers |
| Scope | Full repository, or "delta from `<commit>`" |
| Mode | Read only; the commands that were run |
| Date and time | Start and finish, Amsterdam time; any pauses and resumes |
| Who ran it | Name, and which seat or account |
| Cost | Lead tokens and tool calls, number of sub-reviewers, total tokens if shown, money if on the API |
| Counts | Critical, High, Medium, Low; CONFIRMED and PLAUSIBLE |

## What blocks a release

- **No open Critical or High finding**, CONFIRMED or PLAUSIBLE, on the release
  commit. This is gate **A0** on the launch checklist.
- A PLAUSIBLE Critical or High stays open until its owner confirms and fixes
  it, or closes it with the reason written on the task. The maintainer or the
  security reviewer checks every close.
- A fix counts only when it is merged with a test that fails without it, and
  the security reviewer (or a delta review) agrees that it closes the finding.
- **Exceptions:** only the board signs one, on the release card (the approval
  card in Paperclip, not in this repository), one line per finding: the risk in plain words, why it can wait, and the date by which it
  must be fixed. No exception carries over to the next release.
- **Medium and Low** don't block. Before the release, each one has a task with
  an owner or is rejected with a reason.
- **If the review can't run** (no seat, model unavailable), the release waits.
  Only the board can choose to release anyway, in writing on the release card.

## Keep findings private until fixed

The repository is public. Until the fix is released:

- The report stays in Paperclip, on the release review task. It never goes in
  the repository, a public issue, a discussion, a pull request, a commit
  message or release notes.
- Fix tasks live in Paperclip. Fix pull requests have neutral titles and
  descriptions that say what the code now does, with no exploit steps, and
  link the task, not the finding. Tests describe the behaviour, not the attack.
- A Critical or High finding that can't be fixed quickly gets a private GitHub
  security advisory, published with the fix, as [SECURITY.md](../../SECURITY.md)
  promises outside reporters.
- Only counts leave Paperclip (news updates, chat channels). No finding text.
- The pre-release leak scan (gate A1) also checks that no finding text has
  reached the repository, pull requests or release notes.

## Seat and cost

- **Seat (first choice):** a dedicated Claude Max seat, used only for release
  reviews and run by the security reviewer. Until it exists, the review runs
  on the board's own account, with the security reviewer giving the prompt.
- **API (fallback only):** an API key for release reviews only, with a hard
  cap of **$300 a month**. Use it only when no seat can finish the review
  within a day. The key lives in the secret store, never in the repository,
  a task or a comment.
- **What a run costs:** a full run uses most of one 5-hour usage window on a
  Max seat, roughly 2.5 to 4 million tokens, most of it input read again from
  the cache. On the API that is roughly $10 to $40 at Claude Fable 5.1's
  prices, depending on how much of the input is cached. Write the real
  number in the header each time; the board adjusts the cap after two API
  runs.
