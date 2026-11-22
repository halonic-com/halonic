# runs.run-view.secrets-unreadable-banner

- Status: active
- Since: unreleased
- Source: HAL-15693 (a run stopped by a secrets file the person can't read showed "Halonic can't tell the cause yet"; wording on an approved screen, F24's shape for a file other users can read, decided by the team on the task under HAL-2282, with the CLI's words; words check C687 on HAL-16223)

When a run failed and its cause is `secrets.file-unreadable` with the file and the fix (`app.run-failure-secrets-unreadable`), the run page's banner shall say in the danger tone "*Support reply* stopped in the step *Draft*: the secrets file *file* can't be read by your user account." and then the fix the CLI gives for the same file (`cli.run-secrets-unreadable`), as one sentence:

- `chmod`: "Run chmod 600 *file* in a terminal, then run again.";
- `chown`: "It belongs to another user: run sudo chown "$(id -un)" *file*, then chmod 600 *file* in a terminal, then run again.";
- `properties` (Windows): "Give your user account access to it in the file's Properties, under Security, then run again."

On the desktop, the banner shall have **Copy command** for `chmod`, which copies `chmod 600 *file*`, and for `chown`, which copies `sudo chown "$(id -un)" *file* && chmod 600 *file*`; `properties` has no command and no button. On a phone, the sentence shall say "on your computer" instead of "in a terminal", or begin "On your computer, give" for `properties`, with no button. In the command, the file is written for a shell (`std.shell-word`).

## Examples

- Given a run whose cause is `secrets.file-unreadable` for `/profile/secrets/secrets.json` with the fix `chmod`,
  when its page opens on the desktop,
  then the banner reads "Support reply stopped in the step Draft: the secrets file /profile/secrets/secrets.json can't be read by your user account. Run chmod 600 /profile/secrets/secrets.json in a terminal, then run again." with **Copy command** copying `chmod 600 /profile/secrets/secrets.json`.
- Given the fix `chown` and a file with a space in its path,
  then the sentence and the copied command both write the file in double quotes.
- Given the fix `properties`,
  then the banner has no **Copy command**.
