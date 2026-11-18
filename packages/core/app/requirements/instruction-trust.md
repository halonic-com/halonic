# app.instruction-trust

- Status: active
- Since: unreleased
- Source: HAL-3106, migration plan step 2; Liam's decision on HAL-10213 (the pure check moves out of `harness-kit` into `core/app`)

The app package shall have `instructionTrust(trusted, current)`, a pure check of a run's instruction pin against the pin a person trusted. With the same set digest it shall answer `trusted`. With no trusted pin, or any difference, it shall answer `ask` and name the files added, removed and changed. A file named like an object method, such as `constructor`, shall count as an ordinary name.

## Examples

- Given the same pin on both sides,
  when the trust is checked,
  then the answer is `trusted`.
- Given no trusted pin and a pin with `AGENTS.md`,
  when the trust is checked,
  then the answer is to ask, and names `AGENTS.md` as added.
- Given a trusted pin and a current pin where `AGENTS.md` has another digest,
  when the trust is checked,
  then the answer is to ask, and names `AGENTS.md` as changed.
