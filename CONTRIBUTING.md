# Contributing to Halonic

Thank you for wanting to help. This guide explains how to set up the repo, how
the code is organised, and what a pull request needs before it can be merged.

By taking part you agree to follow our [code of conduct](CODE_OF_CONDUCT.md).
Questions are welcome in GitHub Discussions (see [SUPPORT.md](SUPPORT.md)).
Security problems go to [SECURITY.md](SECURITY.md), never to a public issue.

## Before you start

- **Small fixes** (a typo, a clear bug with a small fix): open a pull request
  straight away.
- **Anything bigger** (a new feature, a new package, a change across several
  packages, a new dependency): open an issue or a discussion first, so we can
  agree on the approach before you spend time on it.
- Check that nobody is already working on it: look at the open issues and pull
  requests, and run `pnpm who-touches <package>` to list
  the open pull requests that change the package you plan to work on.

## Setup

> **One check doesn't block yet.** The requirement guard (the test-weakening
> check) runs on every pull request but only reports, until approvals of
> user-visible changes exist. See [docs/guides/checks.md](docs/guides/checks.md).

You need:

- **Node 26 LTS** and **pnpm 12**. pnpm manages its own version from
  `packageManager` and installs the Node version the repo pins, so installing
  any recent pnpm is enough.
- **Git.**
- **Rust**, only if you work on the desktop shell (`apps/studio/src-tauri`).
  The toolchain is pinned in `apps/studio/src-tauri/rust-toolchain.toml`.

Then:

```sh
git clone https://github.com/halonic-com/halonic.git
cd halonic
pnpm install
pnpm verify
```

`pnpm verify` runs the repo checks, the leak guard, the licence check,
formatting and the feature-list check, then typecheck, lint, test and build
for the packages your change affects. Run it before every push.
`pnpm verify --full` runs everything, including the trace check, as CI does;
use it only when you need it. For a quick loop, run the checks for the
package you changed and push: CI gives the full verdict. Outside CI, tests use
two workers and Turbo runs two tasks at once; set `HALONIC_TEST_WORKERS` to
change the first (it applies in CI too, and `HALONIC_TEST_TIMEOUT`, in
milliseconds, raises the test timeout). Turbo caches typecheck, lint, test and build results, so a
package nobody changed is a cache hit. Several checkouts on one machine can
share that cache: set `TURBO_CACHE_DIR` to one folder for all of them (Turbo
reads it itself, and parallel runs may write to it at once). `pnpm turbo:prune`
deletes the entries unused for 7 days. `pnpm check` runs
only the repo checks; the rules are listed in [docs/guides/checks.md](docs/guides/checks.md).

`pnpm install` also writes the generated files the CLI and the Studio need
(`src/generated/`, gitignored), so a fresh clone runs both straight away. CI
checks this: its first job runs the CLI right after a fresh install. If a
filtered install (`pnpm install --filter ...`) leaves them out, it says so and
you run `pnpm codegen`. `pnpm install` also installs a git hook that refuses secrets, private keys,
`.env` files, absolute local paths and personal terms before they leave your
machine. See [docs/guides/leak-guard.md](docs/guides/leak-guard.md) for what it
checks, how to add your own local deny-terms file and how to allow a false
positive.

To add something new, use the generators instead of
copying a folder by hand:

```sh
pnpm new package <layer>/<name> --owner <name> --purpose "<one line>"
pnpm new feature <name> --owner <name> --purpose "<one line>"
```

The first adds a package, for example `core/storage`; the second adds a Studio
feature. `--owner` is the lowercase name of whoever looks after it. An adapter
also needs `--runtime <runtime>`; `pnpm new` prints the options.

## How the repo is organised

Halonic is a pnpm monorepo. `apps/` holds the things we ship (the Studio app,
the `halonic` command-line tool and the agent host, a placeholder for now).
`packages/` holds everything they are built from.

Every package belongs to one **layer**, and a layer may only use the layers
below it:

| Layer | Where | May use | Never |
| --- | --- | --- | --- |
| core | `packages/core/*` | lower core packages | any third-party package, Node APIs, browser APIs, React |
| adapters | `packages/adapters/*` | core, Node or browser APIs, approved libraries for that one adapter | Studio packages, other adapters' internals |
| host | `packages/host/*` | core, Web-standard APIs | adapters, Node APIs, third-party code, Studio packages |
| targets | `packages/targets/*` | core, adapters, host (a runtime only) | Studio packages; a runtime using a deploy package |
| studio | `packages/studio/*` | core, React, Tauri, Vite, approved UI libraries | adapters directly, another feature's internals |
| apps | `apps/*` | the public interface of any package | — |
| testing | `packages/testing/*` | anything | being a runtime dependency |
| tooling | `tooling/*` | other tooling packages | being a runtime dependency |

There are no targets yet; the layer is ready for them. A check
(`tooling/check`) enforces this on every pull request and explains how
to fix what it finds. The most important consequences:

- **The core has no third-party code.** If you need a helper, look in
  `packages/core/std` first.
- **No new dependency without approval.** Ask in an issue first. Every
  dependency is on an allow-list with its reason (`tooling/check/dependencies.json`,
  see [docs/guides/dependencies.md](docs/guides/dependencies.md)), and
  `tooling/check` fails on anything that isn't.
- **No central lists.** New file kinds, engine states, CLI commands and Studio
  features register themselves from their own folder. You add a folder, not a
  line in a shared file.
- **Import a package only through its public entry point**, never a file deep
  inside it.

## Requirements and tests

Halonic has one firm rule: **nothing that works may break.**

- **Every feature is written down as requirements.** One Markdown file per
  requirement, next to the code it's about, in a `requirements/` folder. Each
  has a stable ID, one sentence in EARS form ("When the user picks a hub, the
  Agent Explorer shall list only the agents in that hub.") and a few
  Given/When/Then examples.
- **Every requirement is proven by tests** that name it:

  ```ts
  verifies("agents.explorer.filter-by-hub", () => {
    test("lists only the agents in the chosen hub", () => {
      // ...
    });
  });
  ```

  The `trace` check fails if a requirement has no test that ran and passed,
  or if a test names a requirement that doesn't exist.
- **A bug fix starts with a failing test.** Write the test first, show that it
  fails without your fix, then fix it.
- **If code is hard to unit test, refactor it.** Split the logic out so it can
  be tested on its own, rather than skipping the test or covering it only end
  to end.
- **Tests that guard a requirement can't be weakened quietly.** Deleting or
  skipping a test, removing assertions, changing a golden file or editing an
  active requirement needs an approved decision note in the pull request. The
  requirement guard checks this; for now it reports without blocking. If you
  think a requirement is wrong, open an issue.
- **No flaky tests:** no retries, fake timers instead of sleeps, and always
  clean up temporary folders.
- **Only made-up data.** Fixtures, examples and screenshots use invented
  content, such as the `examples/acme` workspace. Never real workspaces, names
  or personal data.

## Code and docs

- **Readable over short.** Clear, full names; early returns; no clever
  one-liners. Comments explain _why_, not _what_.
- **Small files.** Aim for under 300 lines; the check fails above 500.
- **Every exported function, type and class has a doc comment.**
- **Docs change in the same pull request as the behaviour.** See the
  [writing guide](docs/guides/writing-docs.md).
- Formatting is automatic (Biome for TypeScript, CSS and JSON; `rustfmt` for
  Rust). Don't reformat code you didn't otherwise change.

## Pull requests

- **Keep them small:** about 400 changed lines at most, not counting generated
  files, the lockfile and fixtures. One topic per pull request.
- **Title in conventional-commit form**, at most 100 characters, with a type
  from `feat`, `fix`, `docs`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`
  or `revert`, for example
  `fix(routines): fire interval triggers at the right time`.
- **Fill in the template:** what and why, the requirement IDs, how you tested
  it, docs, a changeset sentence and AI assistance.
- **The `built-on` label is a maintainer's job.** The `built-on-label` check
  needs a `built-on:paperclip` or `built-on:halonic` label that outside
  contributors can't add. A maintainer adds it during review, so a red
  `built-on-label` before then is expected. Leave the template's `Built-on:`
  line empty.
- **Write the changeset sentence** in the template's Changeset section if users
  will notice the change. Write one sentence a user would understand. Don't run
  `pnpm changeset` yet: the first release, 0.1.0, is a hand-made pull request,
  and a changeset before it would make the release bot open one for 0.1.1. See
  [`.changeset/README.md`](.changeset/README.md).
- **Your targeted checks pass locally** before you ask for review. All checks
  (`ci-ok`) must pass in CI before anything is merged.
- **Changes to cloud code run against a real cloud account.** A pull request
  that changes a cloud path (the Cloudflare adapters, `packages/targets`,
  `packages/host`, `core/ports` or the deploy command) must pass the live
  suites before it merges. A fork never gets the test account's token, so a
  maintainer reviews the change and pushes your branch into this repository to
  run them.
- **Rebase on `main`** rather than merging `main` into your branch.
- **Two pull requests adding features at once?** After rebasing, run
  `pnpm discover --fix`.

## Developer Certificate of Origin (DCO)

We don't ask for a contributor licence agreement. Instead, every commit must
carry a sign-off under the [Developer Certificate of Origin](https://developercertificate.org/).
By signing off you certify that you wrote the change, or otherwise have the
right to submit it under the project's open-source licence.

Sign off by committing with `-s`:

```sh
git commit -s -m "fix(routines): fire interval triggers at the right time"
```

This adds a line with your real name and email address:

```text
Signed-off-by: Your Name <you@example.com>
```

- Only a person can sign off. An AI tool can't certify anything, so never let
  one add the line for you.
- Forgot it? `git commit --amend -s` fixes the last commit;
  `git rebase --signoff main` fixes all the commits on your branch.
- The DCO check runs on every pull request: pull requests with a
  commit that isn't signed off can't be merged. The one exception is the
  commits of Halonic's own agent account, `halonic-dev`, which a
  [standing statement](docs/legal/dco-standing-statement.md) covers. Everyone
  else signs off every commit.

Your contribution is licensed under the [Apache License 2.0](LICENSE), the same
licence as the rest of Halonic.

## How Halonic is built

Halonic is built with agentic engineering: AI agents write much of the code,
tests and docs. Today the agents run on [Paperclip](https://github.com/paperclipai/paperclip),
and we are moving that work step by step onto Halonic itself. That is why
commits come from the shared `halonic-dev` account, name a task such as
`HAL-1234`, and list the AI model as co-author.

There are always people in the loop:

- People set the direction. Product, design and release decisions are made and
  approved by people.
- Every change goes through a pull request, a review and the automated checks
  before it reaches `main`.
- Nothing is released or published without a person's yes.
- A person can stop or override anything an agent does.

## AI-assisted contributions

As described above, AI tools are welcome here, with these rules:

- **You are responsible for every line you submit.** You must have run the
  change, understood it, and be able to explain it in review.
- **Say what you used.** The pull request template asks for "AI assistance
  used: tool / model". "None" is a fine answer.
- **A person signs off.** The DCO sign-off is made by you, never by the tool.
- **Large AI-generated changes start with an issue or a discussion**, not a
  surprise pull request.
- **Don't file AI-generated issues or security reports you haven't checked
  yourself.**
- **Same bar for everyone.** AI-assisted pull requests get the same review and
  the same checks as any other. Requirements and tests are never optional.
- **Low-effort generated pull requests are closed** with a short note.
- **Replies from the Halonic team may come from an AI agent.** Such a reply is
  marked as an AI agent reply and names the person accountable for it.

## How changes are reviewed

1. The automated checks run.
2. A reviewer reads the change. Changes to tests, requirements, security, build
   or docs also get a review from the person who looks after that area.
   Every finding starts with a severity tag: `[blocker]`, `[major]`,
   `[minor]` or `[nit]`. The tags and the reviewer's checklist are in
   [docs/guides/review.md](docs/guides/review.md).
3. A maintainer approves and merges. Pull requests merge one at a time, so
   `main` always passes its checks.

We try to give a first response within a week. If you haven't heard from us,
a friendly comment on the pull request is welcome.
