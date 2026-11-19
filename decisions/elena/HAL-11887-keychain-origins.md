# Decision: the desktop keychain keeps the origins a key may be sent to

- Requirements: `studio.src-tauri.crates.secrets.secret-commands`, `studio.src-tauri.crates.keychain.desktop-keychain`, `studio.src-tauri.served-page`
- Task: HAL-11887
- Approval: pending (security review on HAL-11887)
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:6wB4x8fGPs/fR4SUtyojWg4p5+jD+SU/kvEVmp9VilAqz+SkK8ETBiGl1M5FDUyTdJW9X5W0uuZZmUPQOgVyAA==

## What changes

Step B of key binding (HAL-11343, approved on HAL-11347) lets a stored key carry the origins it may be sent
to. The CLI keeps them in its secrets file since HAL-11871; Studio passed `noKeyOrigins` because the
desktop keychain had nowhere to put them. This pull request gives the keychain that place. It adds two
requirements and extends three:

- `secret-commands`: `secret_delete` also removes the key's allowed origins, before the value. Every other
  sentence and example stays.
- `desktop-keychain`: the origins are a second entry under the service `halonic-origins` and the same
  canonical name, and a list that isn't text is kept and reported as `backend` rather than deleted. One
  example comes in.
- `served-page`: the connect page's list of commands gains `secret_allowed_origins` and
  `secret_allow_origin`, which are granted to the desktop's own main window only, like the other
  `secret_*` commands. The served Studio still gets no native access.

Nothing is weakened. No test is changed except to add the two new commands to the served-page lists.
Users see no change yet: the page doesn't call the commands until the Studio adapter and the Models page
(HAL-11872) use them.

## Choices

- **A second keychain entry, not a file.** The list lives and dies with its key, sits where the key's
  owner already unlocks, and a workspace folder can't write it. A separate service keeps a list from ever
  being read as a value, and keeps all 128 characters of a name free.
- **The shell makes the origin.** The page sends an address; the shell parses it with the `url` crate
  (already a dependency, WHATWG like `new URL`) and stores only `origin.ascii_serialization()`. The tests
  pin twelve addresses to the origin Node gives, so the CLI, Studio and the model resolver agree on the
  string they compare.
- **Fail closed on a damaged list.** A list that isn't one the shell wrote is an error, never "no list":
  reading it as none would put the key back on the older trust rule.
- **Delete origins before the key.** A failure halfway leaves a key without origins (the older rule,
  as before this change), never a list that a new key under the same name would take over.
- **One change at a time.** `secret_set`, `secret_delete` and `secret_allow_origin` take one lock in the
  shell, so two calls can't lose an origin and a deleted key can't leave a list behind.

## Covers

- studio.src-tauri.crates.secrets.secret-commands
- studio.src-tauri.crates.keychain.desktop-keychain
- studio.src-tauri.served-page
