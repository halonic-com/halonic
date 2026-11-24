# Decision: Julian's review scope widens: 800 lines, wording files and package manifests

- Approval: the board asked for it on HAL-14809 (22 Nov); Liam named the paths there and signs it on HAL-16850, which replaces #5059 with Julian's findings fixed
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:BjBMJuEhCPd/4/C3uI68a97VDbJyPZzTGAX6voAvR6/qvuFTIFlX3EjUqVCSHOqWr+uRohBTPjU9TdHL7lfYAw==

`paperclip.reviewer-paths` changes in four ways, so fewer pull requests wait for Liam:

- Julian's line limit goes from 400 to 800 changed lines, and a pull request that only
  changes tests and Markdown has no line limit.
- The words `sandbox`, `secret`, `sign-in`, `oauth`, `keychain` and `trust` no longer
  count in tests, Markdown and wording files (the CLI's `apps/cli/src/messages/`,
  `*-words.ts`); they still count in code, and in any other `messages/` folder.
- A package's `package.json` is Julian's when the lockfile doesn't change and nothing
  inside a field that publishes, installs or pins something does (`version`, `private`,
  `publishConfig`, `bin`, `packageManager`, `engines`, `devEngines`, `pnpm`, and the
  install and publish scripts). The root `package.json` stays Liam's.
- The reviewer path list itself becomes Liam's, so Julian doesn't approve a change to his
  own scope.

The examples change to match. `pr_status` reads each changed manifest at the merge base
and the head and compares the parsed fields, so a change inside `publishConfig`, `engines`,
`bin` or `pnpm` counts even when the diff shows only the inner key. A manifest it can't
read or parse counts as Liam's.

## Why

At 10:18 on 22 Nov, 37 pull requests waited for review, and most of the ones only Liam
could approve were there because of size or a word in a wording file, not a sensitive path.
CI, the guard, native code, secrets, sign-in, sandbox and trust code, dependencies and
releases stay with Liam.

## Covers

- paperclip.reviewer-paths
- tooling/paperclip/src/reviewer-paths.test.ts
