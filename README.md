# Halonic

> **Status: pre-1.0, not yet usable.** This repository is being built. There
> are no releases yet, and nothing here is a stable interface. The full README
> follows before the first public release.

Halonic is a local-first Studio, engine and command-line tool for designing,
running and supervising AI agent workflows. Workflows, agents and settings live
as plain files in your own git repository.

## Install from source

For 0.1.0 the `halonic` command installs from this repository. You need
[git](https://git-scm.com/), [Node.js](https://nodejs.org/) 26.12 or later and
[pnpm](https://pnpm.io/installation) 12.18 or later. On Windows, run all of
this inside [WSL2](https://learn.microsoft.com/windows/wsl/install) (Ubuntu),
not in PowerShell or Command Prompt.

```sh
git clone https://github.com/halonic-com/halonic.git
cd halonic
pnpm install
pnpm setup            # only if pnpm's global bin folder isn't on PATH yet; then open a new terminal
pnpm add -g ./apps/cli
halonic --version
```

`pnpm add -g ./apps/cli` doesn't copy the CLI: it links your clone, so
`halonic` always runs the code in that folder. If pnpm says its global bin
folder isn't on your PATH, run `pnpm setup`, open a new terminal and run
`pnpm add -g ./apps/cli` again.

To update, pull the latest code in your clone and install again. The link
follows the folder, so there is nothing to add again:

```sh
git pull
pnpm install
```

To remove the command, run `pnpm remove -g halonic`. Then you can delete the
clone.

- Questions and help: [SUPPORT.md](SUPPORT.md), or ask in
  [Q&A](https://github.com/halonic-com/halonic/discussions/new?category=q-a)
- How to contribute: [CONTRIBUTING.md](CONTRIBUTING.md)
- How Halonic is built, with people always in the loop:
  [CONTRIBUTING.md](CONTRIBUTING.md#how-halonic-is-built)
- Security: [SECURITY.md](SECURITY.md)
- Licence: [Apache License 2.0](LICENSE), see also [NOTICE](NOTICE) and
  [TRADEMARKS.md](TRADEMARKS.md)
