# Decision: a workspace connector in the launcher's session starts as before, and its refusals say "workspace connector"

- Approval: Paperclip task HAL-2310 (D45, board on HAL-2257 Q3; decided by Liam on HAL-2303); Liam approves this note in review
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:7JrQ19447SazaJ2rlP6gXSiHKlUiZtZTvyHEbvuF4J63kJb95HREhAhh0n/8HygntWzO6/i87EVg7VuIUJikCQ==

Liam's review of #2074 asked for two changes before the host wiring, and both edit the active
requirement `connector-stdio-sandbox.workspace-connector-start`.

- A workspace connector in the launcher's session (`off`) starts as before, without a sandbox,
  because the launcher has no fence. A plugin's local tool is still refused there, and a session
  whose fence proof failed still refuses a workspace connector.
- The refusals a workspace connector can hit (`inheritEnv` in a sandbox, a sandbox that isn't set up)
  say "workspace connector", not "local tool".

The requirement gains one clause and two examples. Nothing is removed and no test is removed or weakened.

## Covers

- connector-stdio-sandbox.workspace-connector-start
