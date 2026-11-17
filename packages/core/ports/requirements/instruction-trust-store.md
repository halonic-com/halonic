# ports.instruction-trust-store

- Status: active
- Since: unreleased
- Source: HAL-3106, migration plan step 2 (a changed instruction file asks for trust again); Liam's decision on HAL-10213 (a new port, not a field of the placement record)

The ports package shall have an `InstructionTrustStore` port (version 1) that gets, saves and removes the instructions a person trusted for an agent, by workspace location and agent id. A record shall hold the key, the pin (the digest of the whole set and each file's digest, by file name) and the time the person trusted it. No record means nothing is trusted. The port shall only store records: it shall have no method that decides whether instructions are trusted. Every adapter shall pass the `contracts.instruction-trust-store` suite.

The port's documentation shall state that records live in the user's profile and never in a workspace, that only a person writes one (no tool the model can call reaches the store), that a record that can't be read makes `get` throw with its key, and that `remove` still deletes it.

The ports package shall export `isInstructionTrustFor(key, value)`, which is true only for a value with exactly the fields of a record, the given key, a pin with exactly `digest` and `files`, every digest in `sha256:` form with 64 lowercase hex digits, and a time that is text. Adapters check what they read with it, and the service in `core/app` checks what a store gives back with it.

## Examples

- Given the `InstructionTrustStore` port,
  when its methods are read,
  then they are exactly `get`, `save` and `remove`.
- Given a record without a pin or without an agent id,
  when it is compiled,
  then it doesn't compile.
- Given a value with every field of a record and also `trusted: true`,
  when `isInstructionTrustFor` checks it,
  then it is false.
- Given a record for `coder` in `/workspaces/acme`,
  when `isInstructionTrustFor` checks it against `coder` in `/workspaces/other`,
  then it is false.
- Given a record whose file digest is `sha256:00` or `md5:…`,
  when `isInstructionTrustFor` checks it,
  then it is false.
