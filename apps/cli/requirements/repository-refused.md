# cli.repository-refused

- Status: active
- Since: unreleased
- Source: HAL-16336

When the workspace's repository is one the git adapter refuses (`git.repository-refused`), the commands that read the live version (`halonic run`, `halonic runs send`, `halonic routines watch`, `halonic routines list` and `halonic serve`) shall say the adapter's reason after "Couldn't <action>:", then its fix on the next line, exit with 7, and start and store no run.

## Examples

- Given the workspace Acme, live, whose `.git/config` sets `include.path`, when the user runs `halonic run support-reply`, then it prints "✕ Couldn't run support-reply: the repository's config sets include.path, which Halonic doesn't allow." and "  Remove it from .git/config and try again.", exits with 7 and stores no run.
