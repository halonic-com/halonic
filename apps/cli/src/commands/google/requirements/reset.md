# cli.commands.google.reset

- Status: active
- Since: unreleased
- Source: HAL-13881 (Julian's threat review of PR #4088 on HAL-13878: a way out when the made token key is gone); builds on `token-store.made-token-key`

The `halonic google reset` command shall be the way out when the profile's token key is gone while secrets it sealed remain, since nobody ever sees a key Halonic made. After asking, or straight away with `--yes`, it shall remove the profile's `google` folder (the Google accounts set up on this computer, with their sealed client secrets and refresh tokens) and the integrations' sealed sign-ins (`integration-sign-ins/tokens`), print "✓ Removed. Set up Google again in the Studio to make a new token key." and exit 0, also when there was nothing to remove. It shall leave the token key, the profile's other secrets and every workspace as they are, so that the next Google setup makes a new key when none is set. Answering No, or Enter, shall remove nothing, print "Nothing was removed." and exit 1. Without a terminal to ask, or with `CI` set, and without `--yes`, it shall remove nothing and exit 2 with the fix "To remove them anyway, pass --yes." An argument shall exit 2 with its usage. The fix line of a missing token key, in the CLI and the Studio's host, shall name this command.

## Examples

- Given a sealed Google secret, a sealed sign-in and no token key,
  when `halonic google reset` is run and the question is answered y,
  then the `google` folder and `integration-sign-ins/tokens` are gone, the other secrets stay, and `halonic google secret` on a new setup makes a key and saves.
- Given the same profile,
  when the question is answered n,
  then it prints "Nothing was removed.", exits 1 and every folder stays.
- Given no terminal and no `--yes`,
  then it exits 2 and removes nothing.
- Given `halonic google reset --yes` on a fresh profile,
  then it asks nothing, prints the ✓ line and exits 0.
- Given no token key but a sealed token,
  when `halonic google secret` stops with exit 5,
  then its fix line names `halonic google reset`.
