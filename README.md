# Halonic

<!-- The platform line is the board's A10 launch line (HAL-7283), word for word.
     "Approve from your Android phone." goes between its two sentences once
     approving from the phone works on the release candidate (HAL-195, HAL-7650). -->

> **Studio runs on Windows. The command line runs on Windows (WSL 2),
> macOS and Linux.** 0.1.0 isn't released yet, and nothing here is a stable interface
> yet.

Halonic is a local-first Studio, engine and command-line tool for designing,
running and supervising AI agent workflows. Workflows, agents and settings live
as plain files in your own git repository.

**Built by humans with the help of AI.** [How Halonic is built](#how-halonic-is-built)

## Studio

Studio is the desktop app, for Windows. Its installer comes with the 0.1.0
release. To build it yourself, see [apps/studio](apps/studio/README.md).

## Status: what is not in 0.1.0 yet

0.1.0 is a first release; expect rough edges. What we know about is in the
pinned [Known issues in 0.1.0](https://github.com/halonic-com/halonic/issues?q=is%3Aissue+label%3Aknown-issues)
issue.
<!-- CHECK (HAL-6394): swap in the issue number once it is posted. -->

- Not on npm yet. `npm install -g halonic` installs an empty placeholder, not
  this release.
- Studio on macOS and Linux is in progress, with no date. On those, use the
  command line. Approving from your phone is in progress too.
- No cost estimates for runs with a real model until 0.1.1, and no spending
  limit: set one at your provider.
- Studio doesn't start connectors (MCP servers) yet.
- Agents can't use your Claude or ChatGPT subscription. They use an API key or
  a local model. Agents that run Claude Code or Codex are in progress.
- The sandbox is in progress: 0.1.0 doesn't start agent programs, so nothing
  runs in it.

## Install the command line from source

Halonic is not on npm yet. Don't install `halonic` from npm: that package is an
empty placeholder, not this release.

The `halonic` command installs from this repository. You need
[git](https://git-scm.com/), [Node.js](https://nodejs.org/) 26.12 or later and
[pnpm](https://pnpm.io/installation) 12.18 or later. On Windows, run all of
this inside [WSL 2](https://learn.microsoft.com/windows/wsl/install) (Ubuntu),
not in PowerShell or Command Prompt.
<!-- CHECK (HAL-7650): whether the command line on Windows is still WSL 2 only
     on the release candidate, or also runs natively or comes with Studio (HAL-7651). -->

Check your Node.js first with `node --version`: it must say v26.12 or later.
With an older Node.js, `halonic` stops and says which version it needs. Many
Linux package managers install an older version, so this is worth checking.

```sh
git clone https://github.com/halonic-com/halonic.git
cd halonic
pnpm install
# only if pnpm asks (see below)
pnpm setup
pnpm add -g ./apps/cli
halonic --version
```

`pnpm install` downloads about 150 MB, so it can take a while on a slow
connection.

`pnpm add -g ./apps/cli` doesn't copy the CLI: it links your clone, so
`halonic` always runs the code in that folder. If pnpm says its global bin
folder isn't on your PATH, run `pnpm setup`, open a new terminal, go back to
the folder (`cd halonic`) and run `pnpm add -g ./apps/cli` again. A new
terminal starts in your home folder, and there the command links nothing.

To update, pull the latest code in your clone and install again. The link
follows the folder, so there is nothing to add again:

```sh
git pull
pnpm install
```

To remove the command, run `pnpm remove -g halonic`. Then you can delete the
clone.

## Try it in 5 minutes

```sh
halonic init --example acme
cd acme
halonic test
```

You should see `5 tests passed`. Acme is an invented company's support
workspace. It runs on a built-in test model: no key, no account, nothing sent
anywhere.

### Run it

```sh
halonic run support-reply --input examples/refund-question.json
```

This runs the Support reply workflow on a made-up email from a customer asking
about a damaged order. You see each step finish: read the email, classify it,
draft a reply. Then it stops at **Approve this reply?** and waits for you:

```text
! Waiting for you: Approve this reply?
  Answer with: halonic runs send 4f873c approve (or reject)
```

Your run id is different from `4f873c`. Copy the command from your own output.

### Answer it

```sh
halonic runs send <run-id> approve
```

Use `reject` instead to finish the run without a reply. Either way the run
finishes. You'll see `Sent nothing`, because Acme is an example and doesn't
send anything. To read what happened, run `halonic runs show <run-id>`.

### See what runs on its own

```sh
halonic routines
```

```text
Weekly report   Mondays at 09:00   Next 16 Nov 09:00   Never ran
```

Acme has one routine, the weekly report, set for Monday at 9:00. This command
lists your routines and when each runs next. It starts nothing. Your "Next"
date will differ. To run routines at their set times, keep
`halonic routines watch` open in a terminal, and stop it with Ctrl C.

Next, read how to
[add your first agent](https://docs.halonic.dev/examples/agent-with-a-tool), or
open the `acme` folder and change a file. Run `halonic validate` after each
change to check your files.

`halonic init` on its own makes an empty workspace: a folder with no agents
yet. Add your first agent with the
[agent-with-a-tool example](https://docs.halonic.dev/examples/agent-with-a-tool),
and check your files with `halonic validate` as you go. Want to see a working
one first? Run `halonic init --example acme` and follow the steps above.

## Something failed?

Run `halonic doctor` and fix what it lists. Then run the command that failed
again with `--debug`. Still stuck? Open an
[Install problem](https://github.com/halonic-com/halonic/issues/new?template=install-problem.yml)
or [Bug report](https://github.com/halonic-com/halonic/issues/new/choose)
issue. Remove keys, tokens and private folder or user names first: `--debug`
output can include your home folder.

## Models and privacy

- Use local models through Ollama, LM Studio, llama.cpp or vLLM, or cloud
  models with your own API key. No markup, no credits.
- No account.
- Halonic talks only to the models and services you set up. Local models keep
  your prompts on your computer.
- The 0.1.0 command line doesn't check for updates.

## How Halonic is built

**Built by humans with the help of AI**

People decide what Halonic is, plan the work and say yes to every release. AI
agents do much of the writing: code, tests and docs. We say so up front, so you
can judge the result for yourself.

**How the work goes**

1. **People plan.** Direction, design and release decisions are made by people.
   The work is split into tasks, and each task has an owner.
2. **Requirements come first.** Features are written down as requirements
   before they are built.
3. **Tests prove it.** Each requirement is proven by tests that run on every
   change. The rule is that nothing that works may break. A test that guards a
   requirement can't be deleted or weakened without an approved decision note.
   A check for this runs on every change today; it reports and doesn't block
   yet.
4. **Every change is reviewed and checked.** Every change goes through a pull
   request, a review and the automated checks before it merges: tests, licence
   and dependency checks, and a check for leaked secrets.
5. **A person says yes to every release.** Nothing is released or published
   without a person's yes, and a person at Korse Holding is accountable for it.
   A person can stop or override anything an agent does.

Tests lower the risk of a broken feature; they don't remove it. This is a first
release, so expect rough edges, and tell us about them.

More in [CONTRIBUTING.md](CONTRIBUTING.md#how-halonic-is-built).

## Help and contributing

- Questions and help: [SUPPORT.md](SUPPORT.md), or ask in
  [Q&A](https://github.com/halonic-com/halonic/discussions/new?category=q-a)
- How to contribute: [CONTRIBUTING.md](CONTRIBUTING.md)
- How Halonic is built, with people always in the loop:
  [above](#how-halonic-is-built) and in
  [CONTRIBUTING.md](CONTRIBUTING.md#how-halonic-is-built)
- Security: [SECURITY.md](SECURITY.md)
- Licence: [Apache License 2.0](LICENSE), see also [NOTICE](NOTICE) and
  [TRADEMARKS.md](TRADEMARKS.md)
