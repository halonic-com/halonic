# Decision: the run page says the setup causes the engine names, and an address without a host

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-14324 (Sofia's C343 check on HAL-14274, rows S4, S5, S9 and X3, items ST2 and ST3; fixes and fallback states on an approved screen, wording from the check's "What it should say" column, a team decision by Liam under HAL-2282)
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:bDaVRN83f19xevvsPnhzx+NbHXEeFvGZ/fg2iId8yucZ5g9uZog/cI1Eg+IpXEEkEN/0gvYTW7tWNXfDCfjNAw==
- Task: HAL-14324

`runs.run-view.failure-banners` gave every failure that wasn't one of its named reasons the
general banner, "… Halonic can't tell the cause yet.", although the engine already sends the cause
and `halonic run` words it. And for a provider address without `http://`, the engine's host is
empty, so the local sentence read "couldn't reach Ollama at  for …" and told the person to start
Ollama, which doesn't help. So:

- `runs.run-view.failure-banners` adds `models.unknown-provider-type` and
  `models.unknown-model-alias`, read from the run's cause with the same facts the CLI uses
  (`setupFailureOf` in `app.run-failure`). The first line is the CLI's; the fix says Models instead
  of the file, with **Open Models** (on a phone, "Fix this on your computer: Models"). A cause that
  lacks a name its sentence needs, and any cause no banner names, keep the general banner.
- It adds that an empty host gets its own sentence, which points to the provider's address in
  Models with **Open Models** and never prints an empty "at".

No test is removed or weakened. New tests cover each setup cause (line and button), the phone, the
empty host, and an unknown cause, or one missing a name, still on the general banner.

## Covers

- runs.run-view.failure-banners
