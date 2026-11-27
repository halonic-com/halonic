# Halonic

<!-- The platform line is the board's A10 launch line (HAL-7283), word for word.
     "Approve from your Android phone." goes between its two sentences once
     approving from the phone works on the release candidate (HAL-195, HAL-7650). -->

> **Studio runs on Windows. The command line runs on Windows (WSL 2),
> macOS and Linux.** 0.1.1 is an early release, and nothing here is a stable
> interface yet.

Halonic is a local-first Studio, engine and command-line tool for designing,
running and supervising AI agent workflows. Workflows, agents and settings live
as plain files in your own git repository.

[![A terminal: halonic init --example acme makes the Acme workspace, halonic test says 5 tests passed, halonic run stops at 'Approve this reply?' and waits, halonic runs send approves it and the run finishes, having sent nothing. The example only drafts replies. Nothing is sent.](docs/assets/readme/first-run-still.svg)](docs/assets/readme/first-run.svg)

*The example only drafts replies. Nothing is sent.*
*Real output from Halonic. Typing and pauses are paced for reading.*
Click the picture to watch it play.

New here? [Getting started](https://docs.halonic.dev/getting-started) has the
fuller Windows (WSL 2), macOS and Linux steps, and
[Troubleshooting](https://docs.halonic.dev/getting-started/troubleshooting) helps
when something fails.

**Built by humans with the help of AI.** [How Halonic is built](#how-halonic-is-built)

## Studio

Studio is the desktop app, for Windows. Download its installer,
`Halonic-<version>-windows-x64-setup.exe`, from the
[latest release](https://github.com/halonic-com/halonic/releases/latest). To
build it yourself, see [apps/studio](apps/studio/README.md).

Studio's Welcome screen has **Open demo**, **Open folder** and **New
workspace**. The demo opens a copy of Acme, an invented company's support
workspace, on **Sample answers**: the built-in test model, with no key and no
cost. You can also make the same copy in a terminal with
`halonic init --example acme` (see [Try it in 5 minutes](#try-it-in-5-minutes)),
then **Open folder** and pick the `acme` folder.

On Windows and macOS, Studio keeps your routines running in the tray when you
close its window, and can start when you log in:
[Keep routines running with the window closed](docs/how-to/keep-routines-running-with-the-window-closed.md)
and [Start Halonic when you log in](docs/how-to/start-halonic-when-you-log-in.md).

## Status: what is not in 0.1.1 yet

0.1.1 is an early release; expect rough edges. The list below is what we
know about today.
<!-- CHECK (HAL-6394): once the "Known issues in 0.1.0" issue is posted, link it here by its number. The old label-search link found nothing. For now, the link below goes to all open issues. -->

Read or report known problems in the [open issues](https://github.com/halonic-com/halonic/issues).

- Studio on macOS and Linux is in progress, with no date. On those, use the
  command line.
- The Android app is in progress. Today, `halonic serve --network` lets your
  phone's browser approve or reject a run that waits for you.
- Cost estimates only for models with a price set in their file; none for
  subscriptions, local models or the test model. A `budget` in
  `workspace.yaml` counts only those estimates, so set a limit at your
  provider too.
- Studio doesn't start connectors (MCP servers) yet.
- The Studio Assistant, the chat that proposes changes to your workspace for
  you to review, is new after 0.1.1. What it can do, what it asks you for and
  its limits: [The Studio Assistant](docs/guides/studio-assistant.md).
- The command line bundles the Claude Code and Codex harnesses, so an agent can run on your Claude or ChatGPT subscription, and also supports `harness: opencode` at the one OpenCode version Halonic has tested. Studio doesn't offer them yet.
- The command line starts connectors in the sandbox when the sandbox works on
  your computer. Otherwise it starts them on your computer, under the trust you
  gave the workspace.

## Install the command line

You need [Node.js](https://nodejs.org/) 26.12 or later. On Windows, run all of
this inside [WSL 2](https://learn.microsoft.com/windows/wsl/install) (Ubuntu),
not in PowerShell or Command Prompt. Check your Node.js first with
`node --version`: it must say v26.12 or later.

```sh
npm install -g halonic@latest
halonic --version
```

The last command prints `Halonic` and the version you installed. Keep the
`@latest`: without it, an older Node.js quietly gets an empty placeholder
with no `halonic` command.

### Install from source

To build the command line yourself, install it from this repository. You need
[git](https://git-scm.com/), [Node.js](https://nodejs.org/) 26.12 or later and
[pnpm](https://pnpm.io/installation) 12.18 or later. On Windows, run all of
this inside [WSL 2](https://learn.microsoft.com/windows/wsl/install) (Ubuntu),
not in PowerShell or Command Prompt.

Check your Node.js first with `node --version`: it must say v26.12 or later.
With an older Node.js, `halonic` stops and says which version it needs. Many
Linux package managers install an older version, so this is worth checking.
Install Node.js with [nvm](https://github.com/nvm-sh/nvm) or
[fnm](https://github.com/Schniz/fnm) (`nvm install 26` or `fnm install 26`),
not with `apt install nodejs`, which gives you an older version.

```sh
git clone https://github.com/halonic-com/halonic.git
cd halonic
pnpm install
pnpm add -g ./apps/cli
halonic --version
cd ..
```

The last command should print `Halonic` and a version number.

`cd ..` leaves the clone, so the next steps don't create files inside it.

`pnpm install` downloads about 150 MB, so it can take a while on a slow
connection.

If you set up pnpm with Corepack, the first `pnpm` command may download the
pnpm version this repository needs. Sometimes it just prints "Corepack is about
to download ..." and goes on. Sometimes it asks "Do you want to continue?":
answer `y` (or press Enter). To skip the question, set
`COREPACK_ENABLE_DOWNLOAD_PROMPT=0` first. It may fetch a newer pnpm than the
version in the lockfile. That is fine: any pnpm 12.18 or later works.

`pnpm add -g ./apps/cli` doesn't copy the CLI: it links your clone, so
`halonic` always runs the code in that folder.

If pnpm says its global bin folder isn't on your PATH, set it up, open a new
terminal, go back to the folder and link the CLI again. A new terminal starts
in your home folder, and there the command links nothing.

```sh
pnpm setup
# open a new terminal, then:
cd halonic
pnpm add -g ./apps/cli
```

To update, pull the latest code in your clone and install again. The link
follows the folder, so there is nothing to add again:

```sh
git pull
pnpm install
```

If you built the Studio page for `halonic serve`, build it again after an
update, or the address shows the older page. `halonic serve` tells you when
the page is older than the code:

```sh
pnpm --filter @halonicjs/app-studio build
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

The reply it asks about shows first, between the "Waiting for you" line and the "Answer with:" line, so you read what you approve. This excerpt skips it. Your run id is different from `4f873c`. Copy the command from your own output.

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
Weekly report   Mondays at 09:00   Next 23 Nov 09:00   Never ran
Routines start on time only while this workspace is open in Halonic Studio, or while `halonic serve` or `halonic routines watch` is running.
```

Acme has one routine, the weekly report, set for Monday at 9:00. This command
lists your routines and when each runs next. It starts nothing. Your "Next"
date will differ: it is the next Monday at 09:00, and it reads "Next tomorrow 09:00"
when that is the next day. To run routines at their set times, keep
`halonic routines watch` open in a terminal, and stop it with Ctrl C.

## Use a real model

Acme runs on the built-in test model. To use your own, follow
[Connect a provider and a tool](https://docs.halonic.dev/guides/connect-provider-and-tool):
it shows which file to edit and how to store your API key. Then:

```sh
halonic doctor
halonic trust
halonic run support-reply --input examples/refund-question.json
```

`halonic doctor` tells you if a model still needs a key. Once Acme reaches a
real model, `halonic trust` asks you to confirm that this computer may run it
(while Acme uses only the test model it says no trust is needed). Without a
terminal, use
`halonic trust --yes --fingerprint <fingerprint>`. If the provider refuses,
[the provider says no](https://docs.halonic.dev/guides/provider-says-no) shows
what each message means. To stop runs at a spending limit, set
`budget.perRun` or `budget.monthly` in `workspace.yaml`
([Budgets](https://docs.halonic.dev/concepts/runs#budgets)), and set one at
your provider too.

## Next steps

1. [Your first routine](https://docs.halonic.dev/getting-started/first-routine)
   continues in the `acme` folder you just made.
2. [Add an approval step](https://docs.halonic.dev/examples/approval-step) to a
   workflow.
3. [Give an agent a tool](https://docs.halonic.dev/examples/agent-with-a-tool).
4. [Connect a real model](https://docs.halonic.dev/guides/connect-provider-and-tool)
   instead of the built-in test model.

Run `halonic validate` after each change to check your files. `halonic init` on
its own makes a workspace with a Default hub and the test model but no agents
yet; the examples above show how to add the first one.

## Something failed?

Run `halonic doctor` and fix what it lists:
[Check your setup with `halonic doctor`](docs/how-to/check-your-setup-with-doctor.md)
explains each line and its fix. A red ✕ Sandbox line is normal on
a fresh install and doesn't stop the steps above. Then run the command that failed
again with `--debug`. Still stuck? Open an
[Install problem](https://github.com/halonic-com/halonic/issues/new?template=install-problem.yml)
or [Bug report](https://github.com/halonic-com/halonic/issues/new/choose)
issue. Remove keys, tokens and private folder or user names first: `--debug`
output can include your home folder.

## Models and privacy

- Use local models through Ollama, LM Studio, llama.cpp or vLLM, or cloud
  models with your own API key. No markup, no credits.
- Agents ask for a model alias such as `fast`, so you change a model in one
  place: [Choose a model for an agent](docs/how-to/choose-a-model-for-an-agent.md).
- No account.
- Halonic talks only to the models and services you set up. Local models keep
  your prompts on your computer.
- A new workspace starts with Local only on, so nothing leaves your computer
  until you turn it off:
  [Turn Local only on or off](docs/how-to/turn-local-only-on-or-off.md).
- One exception, on Android: scanning a pairing code uses Google's ML Kit
  through Google Play services. The camera image stays on your phone, but
  Google may receive usage statistics about the scanner (device and app
  details, a device ID and a per-installation ID, speed, image settings). See
  [Google's ML Kit data disclosure](https://developers.google.com/ml-kit/android-data-disclosure).
- The command line doesn't check for updates yet.

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
   A check for this runs on every change and blocks a pull request that
   breaks the rule.
4. **Every change is reviewed and checked.** Every change goes through a pull
   request, a review and the automated checks before it merges: tests, licence
   and dependency checks, and a check for leaked secrets.
5. **A person says yes to every release.** Nothing is released or published
   without a person's yes, and a person at Halonic is accountable for it.
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
