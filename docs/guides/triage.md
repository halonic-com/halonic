# Triaging issues

What happens to a new issue on `halonic-com/halonic`, and what the labels
mean. For maintainers; contributors can read it to see what to expect.
How to open an issue or a pull request is in
[CONTRIBUTING.md](../../CONTRIBUTING.md).

## A new issue

Every issue form adds `needs-triage`. Whoever triages an issue:

1. **Reads it and replies.** Public replies speak for "the team".
2. **Sorts it.** One of these:
   - a real bug or request: add a type label (`bug`, `enhancement`,
     `documentation`, `install`, `regression`, `integration`), an `area:` label
     and, if it only happens on one system, a `platform:` label;
   - `needs-info`: we asked the reporter a question;
   - `needs-repro`: we can't reproduce it from the steps given;
   - `duplicate`: link the original issue and close it;
   - `question`: move it to Discussions Q&A;
   - `not-now` or `wontfix`: say why when you close it.
3. **Sets a priority** on every bug or install problem (see below).
4. **Removes `needs-triage`.**

The `needs-triage` queue should be empty at the end of each day.

## Priority

Every bug or install problem gets exactly one priority label.

| Label | Use it when | What happens |
| --- | --- | --- |
| `priority: crash` | Halonic crashes, loses data, or doesn't install | Fixed before anything else |
| `priority: high` | A common workflow is blocked and there is no easy workaround | Fixed in the current release |
| `priority: low` | It is minor, or there is a workaround | Fixed when there is time |

A bug with no priority label has not been triaged yet.

A security problem is never a public issue. If one arrives as an issue, edit
the details out of it, delete the old revision from the edit history (or ask
an admin to delete the issue), and point the reporter to
[SECURITY.md](../../SECURITY.md). Do the same with a key, token or password in
an issue, and ask the reporter to revoke it.

## Good first issues

`good first issue` marks a small, well-described task for a first
contribution. Each one names an owner on the team who answers questions on
it. Small fixes still go straight to a pull request, as CONTRIBUTING says;
the good first issues are a starting point, not a gate.

Once a week, a maintainer checks the label:

- **Older than 30 days:** close it, or remove the label if it is no longer a
  good first task.
- **Claimed, but no pull request after 7 days:** ask the person, then free it
  for someone else.
- **Fewer than 5 open:** add new ones, so 5 to 10 stay open.
