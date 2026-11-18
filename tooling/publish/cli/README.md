# halonic

<!-- The README of the `halonic` package on npm (HAL-12394). The stager ships
     it instead of apps/cli/README.md, which is for the people who work on the
     CLI. Its wording follows the root README: change both together. Links are
     full addresses, because npmjs.com doesn't resolve paths in the repository. -->

The command line of [Halonic](https://github.com/halonic-com/halonic), a
local-first Studio, engine and command-line tool for designing, running and
supervising AI agent workflows. Workflows, agents and settings live as plain
files in your own git repository.

The command line runs on Windows (WSL 2), macOS and Linux. Nothing here is a
stable interface yet.

## Install

You need [Node.js](https://nodejs.org/) 26.12 or later. Check with
`node --version`: it must say v26.12 or later. Install Node.js with
[nvm](https://github.com/nvm-sh/nvm) or [fnm](https://github.com/Schniz/fnm)
(`nvm install 26` or `fnm install 26`), not with `apt install nodejs`, which
gives you an older version. On Windows, run all of this inside
[WSL 2](https://learn.microsoft.com/windows/wsl/install) (Ubuntu), not in
PowerShell or Command Prompt.

```sh
npm install -g halonic
halonic --version
```

The last command prints `Halonic` and the version you installed.

## Try it in 5 minutes

```sh
halonic init --example acme
cd acme
halonic test
```

You should see `5 tests passed`. Acme is an invented company's support
workspace. It runs on a built-in test model: no key, no account, nothing sent
anywhere.

```sh
halonic run support-reply --input examples/refund-question.json
```

This runs the Support reply workflow on a made-up email from a customer asking
about a damaged order. It stops at **Approve this reply?** and waits for you.
Answer it with the command it prints:

```sh
halonic runs send <run-id> approve
```

To read what happened, run `halonic runs show <run-id>`.

## Next steps

- [Getting started](https://docs.halonic.dev/getting-started) has the fuller
  steps, and [Troubleshooting](https://docs.halonic.dev/getting-started/troubleshooting)
  helps when something fails.
- [Connect a real model](https://docs.halonic.dev/guides/connect-provider-and-tool)
  instead of the built-in test model.
- Run `halonic doctor` when something fails, and `halonic --help` for every
  command.

## Help and licence

- Questions and help: [SUPPORT.md](https://github.com/halonic-com/halonic/blob/main/SUPPORT.md)
- Problems: [open an issue](https://github.com/halonic-com/halonic/issues/new/choose)
- Security: [SECURITY.md](https://github.com/halonic-com/halonic/blob/main/SECURITY.md)
- Licence: Apache License 2.0, see `LICENSE`, `NOTICE` and
  `THIRD-PARTY-NOTICES.txt` in this package.
