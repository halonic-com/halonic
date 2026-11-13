# Decision: the agent host checks the trust grant itself before a connector starts

- Approval: Paperclip task HAL-8674 (finding M1 of the security review on HAL-8672); Liam approves this note in review
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:YAxAAh2k3NRsYWO8B9clSmqPBStqcoYE73vsF3olOAocM4VGjqCDbW9/GaPMhdSyKfCBMv1cFfLvvZSoj4DGAA==

The open route took the trust grant from the request and passed it to the factory, so a page holding the launch token could claim trust, and a failed sandbox check then started the program with no fence. The host now reads the trust record in its own profile folder before it asks the factory to start anything.

- The host answers `403 workspace_not_trusted` unless the grant's location and fingerprint match the record and the record holds this connector's program, args, folder, env, inheritEnv, secretEnv names, pin and sites.
- The check runs for every start, fenced or not: an untrusted workspace's program should not start fenced either.
- A host with no profile folder opens nothing.

## Covers

- agent-host.connector-routes
