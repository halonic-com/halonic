# @halonicjs/tooling-paperclip

Tools that run beside Paperclip, the control plane our agents work in,
without a model: the Agent tools plugin with its PR watcher, and the
reviewer path list that the watcher and the reviewer-routing check share.

- **Layer:** tooling
- **Owner:** mateo
- **Public API:** `@halonicjs/tooling-paperclip` (the PR watcher's `tick`, `decide`, `discoverPulls` and its readers; the plugin's `manifest`, `runWatcher` and host adapter; `reviewerFor`, `isLiamPath` and the path lists)
- **Requirements:** `paperclip.pr-watcher-done`, `paperclip.pr-watcher-wake`, `paperclip.pr-watcher-read-only`, `paperclip.pr-watcher-plugin`, `paperclip.reviewer-paths`

## PR watcher

Replaces the model runs that only ask "is my PR green, has it merged, does
it need a rebase" (the seat plan on HAL-15298, section 3, item 2). It runs
as the `pr-watch` job of the Agent tools plugin (HAL-15920, trigger A1),
every 10 minutes.

**How it finds pull requests.** By branch name, as the root `AGENTS.md`
names branches: `mateo/HAL-15359-pr-watcher` is Mateo's work on HAL-15359.
Each run it lists every open pull request and every one updated in the last
3 days on the configured repositories, leaving out pull requests from forks
(anyone can name a fork's branch like ours). A pull request that merged more
than 3 days ago while its task stayed open is missed; close such a task by
hand. Nobody has to link pull requests on the task.

It looks at open tasks (`todo`, `in_progress`, `in_review`) and acts only
when every branch found for the task names the agent that holds it. When the
reviewer holds it, the branches name different agents, or the author already
has a run going, it does nothing and logs why.

| What it sees | What it does |
| --- | --- |
| Every pull request found for the task is closed, at least one merged, each merged one has `ci-ok` passed on its merge commit (the merge-group run) or is included in the base branch's newest green CI push run, the task has no child task that isn't done or cancelled, and the author hasn't held it (below) | Marks the task `done` and comments |
| `ci-ok` failed on an open pull request's own head | Comments and wakes the author |
| It conflicts with its base branch and isn't in the merge queue | Comments and wakes the author |
| A review comment newer than the watcher's and the author's last comment on the task: a GitHub review that requests changes, an inline comment on the head, or a review or conversation comment with a `[blocker]`, `[major]` or `[minor]` finding or a "changes requested" verdict ("No changes requested" and approvals don't count), by the repository's owner, an organization member or a collaborator | Comments and wakes the author |

Any open pull request keeps the task open, a stacked one included; one
closed without merging is ignored.

**More PRs to come.** A task that delivers several pull requests one after
another would otherwise be closed after its first merge. To hold it open,
put this line in your task comment when a pull request isn't the last one:

```text
PR watcher: more PRs to come
```

The watcher reads only your newest comment on the task: the hold lasts until
you comment again without the line. Leave it out of the comment for the last
pull request.

A failed merge group isn't the author's: the queue session finds the
culprit. Each comment starts with `PR watcher:` and carries a hidden marker
per pull request, head and reason, so the author hears about each new state
once, not every 10 minutes. The host stores no plugin id on a comment, so
the watcher's own comments are the ones with neither an agent nor a user as
author that start with `PR watcher:`. It keeps no state of its own.

It only sends GET requests to GitHub, and only to `api.github.com`. About
four requests per open pull request whose author holds the task, two per
merged one, and one or two list pages per repository each pass.

## The Agent tools plugin

`src/plugin/` holds the plugin: `manifest.ts`, `worker.ts` (the job) and
`host.ts`, the adapter to Paperclip's plugin API. It asks for the fewest
capabilities the watcher needs: jobs, reading companies, agents, tasks and
comments, creating comments, wake-ups, `issues.update`, outbound HTTP and
reading a secret. No webhooks, agent tools, UI, files or processes.

- **Status changes:** the manifest can't narrow `issues.update`, so
  `host.ts` is the only file that changes a task's status, and its
  `doneOnly` refuses anything but `{ status: "done" }`. A test fails if
  another file calls `issues.update(`.
- **Outbound HTTP:** the manifest can't list allowed hosts, so the GitHub
  reader's origin guard keeps the token on `api.github.com`.
- **Settings per company:** `githubToken` (the secret
  `PR_WATCHER_GITHUB_TOKEN`, a read-only fine-grained token), `repos`
  (default `halonic-com/halonic`) and `dryRun`. **Dry run is on unless it is
  set to `false`**: the job then only logs what it would do. A company
  without a token is skipped, and so is one with no saved settings: a
  scheduled job runs outside any company, so the host lets it read only the
  companies whose settings the board saved. `githubToken` is declared `type: "string"`
  with `format: "secret-ref"`: the host stores the secret binding there, but
  checks the field with the binding replaced by its secret id.
- **Trust:** a plugin worker runs with the host's rights and no sandbox. The
  token is read at run time and never logged or kept.

### Building and installing it

```sh
pnpm --filter @halonicjs/tooling-paperclip run build:plugin
```

writes `dist/worker.js` (the SDK bundled in) and `dist/manifest.js`, which
`package.json`'s `paperclipPlugin` block names. The board installs it from
that folder of a `main` checkout on Halonic Server (Settings → Plugins);
publishing it to npm would be a release. Run it in dry run first, read the
job log, then turn `dryRun` off.

## Reviewer path list

`reviewerFor({ files, changedLines, sensitive })` answers `julian` or `liam`
by the rules of HAL-14809. Scripts that route pull requests import it from
here, so there is only one list.
