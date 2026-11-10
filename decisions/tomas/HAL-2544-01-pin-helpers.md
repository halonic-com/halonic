# Decision: a pinned runner's command word must be the pin's, and no package option may follow it

- Approval: Paperclip task HAL-4094 (Liam's review of the pinned launcher stack, for HAL-230 and HAL-2544)
- Kind: internal

Liam's review found that `npx -y @acme/mail-mcp -p @acme/mail-mcp` and `uvx mail-mcp --from
mail-mcp` passed `app.package-runner-launch` and then started the newest version. The check and
the pinning each decided on their own which words were the runner's options. They read `-p` after
the command word as the runner's option, but `npx` and `uvx` pass it on to the server. Fixing it
also showed that `npx -y other-pkg @acme/mail-mcp` passed, because the check only asked that some
word name the pin, not the command word.

The requirement now says how a runner's words are read: the runner's own options, then the command
word, then the words it passes on. One function in `pin-command.ts` (`readRunnerWords`) does this,
for the check and for `app.pinned-runner-args`. With it, the check:

- refuses a launch whose command word isn't the pin's package when there is no package option
  (`npx -y other-pkg @acme/mail-mcp`, `uvx other-tool mail-mcp`). An option with a value of its
  own before the package, such as `uvx --python 3.12 mail-mcp`, is now refused with a pin too,
  because its value reads as the command word. That was already the rule with `--from`, and the
  connector can still start unpinned;
- refuses a package option after the command word, before a `--`. Runners differ there: `npm exec`
  reads it as its own, `npx` and `uvx` pass it on. So a pin can't say which package starts;
- reads package option values only among the runner's own options. A pin-named word anywhere still
  has to be at the pin's version, and registry options are still refused anywhere. Both of those
  err to the safe side.

The examples gain three cases. No test was weakened: the existing cases keep their expectations,
and the bypass tests gain two tests.

## Covers

- app.package-runner-launch
