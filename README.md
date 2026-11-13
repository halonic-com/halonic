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

## Help and contributing

- Questions and help: [SUPPORT.md](SUPPORT.md), or ask in
  [Q&A](https://github.com/halonic-com/halonic/discussions/new?category=q-a)
- How to contribute: [CONTRIBUTING.md](CONTRIBUTING.md)
- How Halonic is built, with people always in the loop:
  [CONTRIBUTING.md](CONTRIBUTING.md#how-halonic-is-built)
- Security: [SECURITY.md](SECURITY.md)
- Licence: [Apache License 2.0](LICENSE), see also [NOTICE](NOTICE) and
  [TRADEMARKS.md](TRADEMARKS.md)
