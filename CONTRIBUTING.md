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

> **Some checks are still being built.** The requirement, test-weakening and DCO
> checks are coming in Phase 1. Until a check exists, this guide describes it
> as "coming".

You need:

- **Node 26 LTS** and **pnpm 12**. pnpm manages its own version from
  `packageManager` and installs the Node version the repo pins, so installing
  any recent pnpm is enough.
- **Git.**
- **Rust**, only if you work on the desktop shell (`apps/studio/src-tauri`).
  The toolchain is pinned in `rust-toolchain.toml`.

Then:

```sh
git clone https://github.com/halonic-com/halonic.git
cd halonic
pnpm install
pnpm verify
```

`pnpm verify` runs the checks, type checks, lint and tests
for the packages your change affects. Run it before every push.
`pnpm verify --full` runs everything. `pnpm check` runs
only the repo checks; the rules are listed in [docs/guides/checks.md](docs/guides/checks.md).

To add something new, use the generators instead of
copying a folder by hand:

```sh
pnpm new package <layer>/<name>    # a new package, e.g. pnpm new package core/storage
pnpm new feature <name>            # a new Studio feature
```

## How the repo is organised

Halonic is a pnpm monorepo. `apps/` holds the things we ship (the Studio app,
the `halonic` command-line tool and the docs site). `packages/` holds
everything they are built from.

Every package belongs to one **layer**, and a layer may only use the layers
below it:

| Layer    | Where                 | May use                                                             | Never                                                   |
| -------- | --------------------- | ------------------------------------------------------------------- | ------------------------------------------------------- |
| core     | `packages/core/*`     | lower core packages                                                 | any third-party package, Node APIs, browser APIs, React |
| adapters | `packages/adapters/*` | core, Node or browser APIs, approved libraries for that one adapter | Studio packages, other adapters' internals              |
| host     | `packages/host`       | core, adapters, Node APIs                                           | Studio packages                                         |
| studio   | `packages/studio/*`   | core, React, Tauri, Vite, approved UI libraries                     | adapters directly, another feature's internals          |
| apps     | `apps/*`              | the public interface of any package                                 | —                                                       |
| testing  | `packages/testing/*`  | anything                                                            | being a runtime dependency                              |

A check (`tooling/check`) enforces this on every pull request and explains how
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

  A check (coming in Phase 1) fails if a requirement has no test that ran and
  passed, or if a test names a requirement that doesn't exist.
- **A bug fix starts with a failing test.** Write the test first, show that it
  fails without your fix, then fix it.
- **Tests that guard a requirement can't be weakened quietly.** Deleting or
  skipping a test, removing assertions, changing a golden file or editing an
  active requirement needs an approved decision note in the pull request. A
  check (coming in Phase 1) enforces this. If you think a requirement is
  wrong, open an issue.
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
- **Title in conventional-commit form**, for example
  `fix(routines): fire interval triggers at the right time`.
- **Fill in the template:** what and why, the requirement IDs, how you tested
  it, docs, a changeset sentence and AI assistance.
- **Add a changeset** (`pnpm changeset`, not set up yet) if users will notice the change. Write
  one sentence a user would understand.
- **`pnpm verify` is green** before you ask for review. All checks must pass in
  CI before anything is merged.
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
- Once the DCO check is in place (coming in Phase 1), pull requests with a
  commit that isn't signed off can't be merged.

Your contribution is licensed under the [Apache License 2.0](LICENSE), the same
licence as the rest of Halonic.

## AI-assisted contributions

Halonic is itself built by a team of AI agents, with people deciding what
ships. So AI tools are welcome here, with these rules:

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

## How changes are reviewed

1. The automated checks run.
2. A reviewer reads the change. Changes to tests, requirements, security, build
   or docs also get a review from the person who looks after that area.
3. A maintainer approves and merges. Pull requests merge one at a time, so
   `main` always passes its checks.

We try to give a first response within a week. If you haven't heard from us,
a friendly comment on the pull request is welcome.
