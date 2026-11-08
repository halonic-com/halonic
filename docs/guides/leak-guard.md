# The leak guard

This repo is public. Anything pushed to any branch can be seen at once and
can't be taken back. The leak guard stops private things before they leave
your machine, and CI blocks them again before they can reach `main`.

## What it refuses

| Rule               | Refuses                                                                                              |
| ------------------ | ---------------------------------------------------------------------------------------------------- |
| `private-key`      | a private key block (`-----BEGIN … PRIVATE KEY-----`)                                                |
| `aws-access-key` … | known key and token formats: AWS, GitHub, npm, Slack, Google, Stripe, AI provider keys               |
| `env-file`         | a `.env`, `.env.*` or `.envrc` file (`.env.example`, `.sample`, `.template`, `.defaults` are fine)   |
| `key-file`         | a private key or keystore file (`id_rsa`, `*.pem`, `*.key`, `*.p12`, `*.keystore`, …)                |
| `absolute-path`    | a path that only exists on one machine: `/home/…`, `/Users/…`, `C:\…`, `/tmp/…`, `/var/folders/…`, … |
| `personal-term`    | a personal term from the deny-terms list, in any case, also inside a longer word                     |

It checks the lines you add, file names, commit messages, and the author
and committer of each commit. In CI it also checks the branch name and the
pull request title and body.

It never prints a personal term or a secret. A report shows the file, the
line and the rule. A secret is shown masked (`ghp_******** (40
characters)`), a path only by its root (`/home/`), and a part of a file name
that holds a term as `[withheld]`.

## How it runs

- **On commit**, the `pre-commit` hook checks what you staged.
- **On push**, the `pre-push` hook checks every commit you are about to
  push, including its message and author.
- **In CI**, the `Leak guard` job runs the same rules on every pull
  request. Any finding fails `ci-ok`, so nothing can merge.

`pnpm install` installs the hooks. It points git's `core.hooksPath` at
`tooling/check/hooks`, for this clone only. There is no hook framework.
The hooks take well under a second.

Don't skip the hooks with `--no-verify`. CI runs the same rules, and a
leaked secret or term is public the moment it is pushed, even if CI
catches it later.

Run it by hand with `pnpm check:leaks` (every tracked file), or
`pnpm check:leaks --all` (also every commit on every branch).

## Your deny-terms file

Personal terms are names and other private words that must never appear in
the repo. The list is never committed. Keep your copy at
`~/.config/halonic/deny-terms`, one term per line:

```text
# Lines starting with # are comments; blank lines are ignored.
First Lastname
nickname
```

Set `HALONIC_DENY_TERMS_FILE` to keep the file somewhere else. If there is
no file, the hooks print a one-line notice and check everything else. CI
reads the terms from the `HALONIC_DENY_TERMS` Actions secret and fails when
that secret is missing.

Matching ignores case and finds a term inside longer words. The words of a
term may be joined by any separator, so `First Lastname` also matches
`first.lastname` and `FirstLastname`.

## Allowing a false positive

First, check that it really is one. If it is:

- **An absolute path** that has to stay (for example, a doc that explains
  where an operating system keeps its files): add
  `leak-guard: allow absolute-path <reason>` in a comment on the same line.
- **Anything else except a personal term**: add a line to
  `tooling/check/leak-allow.txt`, which needs review from its code owner:

  ```text
  <rule> <file or glob> [fp:<fingerprint>] <reason>
  ```

  A secret rule needs the `fp:` fingerprint from the leak guard's report.
  The entry then allows that one value in that file and nothing else. A
  glob's `*` matches within a folder, and `**` matches across folders.

A personal term can't be allowed. Reword the text instead. Technical
phrases that happen to contain a term, such as a CSS property name, go in
`tooling/check/terms-allowed-phrases.txt`. A phrase that is only the term
itself is ignored there.

## If something got through

If a secret was pushed anywhere, treat it as leaked. Rotate it first, then
remove it. For a personal term or a path, tell the repo owners straight
away: rewriting public history needs them.
