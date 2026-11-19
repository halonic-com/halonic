# app.sandbox-start-words

- Status: active
- Since: unreleased
- Source: HAL-4293 (plan approved on HAL-10918); sandbox-screens 3.1 and 3.10; microcopy 23.3; HAL-1784 (words are placeholders by key)

The sandbox-start words shall give, for every reason code of the `Sandbox` port, one reason, one fix, the fix as a Callout sentence, the fix for a phone, the fix for Settings, a docs key and the docs link's name, under one catalogue key per reason, so every Studio screen reads the same sentence. A code Halonic doesn't know shall read as `other`. The words shall never contain the check's own sentence. A fix that the command line words as "use Halonic inside WSL 2" shall point to Settings, and Settings, whose own button is that fix, shall get no fix for it. The docs link's name shall say where it goes: the reason's own guide, or "What the sandbox needs" for a reason without one.

## Examples

- Given `bubblewrap-missing`,
  then the reason says bubblewrap isn't installed, the fix names `sudo apt install bubblewrap`, and the Callout fix is the same fix with a capital letter.
- Given every reason code of the port,
  then each has every part (the fix for Settings may be none), and no two reasons share a key.
- Given a code from a newer version,
  then the words are `other`'s, with the key `sandbox-start.other`.
- Given `windows`, `distro-missing`, `setup-conflict` or `setup-needed`,
  then the fix points to Settings, not to WSL 2 on the command line, and there is no fix for Settings.
- Given `bubblewrap-missing` or `blocked-by-policy`,
  then the reason and the fix are the CLI's reason and fix for that code.
- Given `bubblewrap-missing`,
  then the docs link is named "How to install bubblewrap"; given `other`, it is named "What the sandbox needs".
