# app.sandbox-start-words

- Status: active
- Since: unreleased
- Source: HAL-4293 (plan approved on HAL-10918); sandbox-screens 3.1 and 3.10; microcopy 23.3; HAL-1784 (words are placeholders by key)

The sandbox-start words shall give, for every reason code of the `Sandbox` port, one reason, one fix, the fix as a Callout sentence, the fix for a phone and a docs key, under one catalogue key per reason, so every Studio screen reads the same sentence. A code Halonic doesn't know shall read as `other`. The words shall never contain the check's own sentence. A fix that the command line words as "use Halonic inside WSL 2" shall point to Settings.

## Examples

- Given `bubblewrap-missing`,
  then the reason says bubblewrap isn't installed, the fix names `sudo apt install bubblewrap`, and the Callout fix is the same fix with a capital letter.
- Given every reason code of the port,
  then each has all five parts, and no two reasons share a key.
- Given a code from a newer version,
  then the words are `other`'s, with the key `sandbox-start.other`.
- Given `windows`, `distro-missing`, `setup-conflict` or `setup-needed`,
  then the fix points to Settings, not to WSL 2 on the command line.
- Given `bubblewrap-missing` or `blocked-by-policy`,
  then the reason and the fix are the CLI's reason and fix for that code.
