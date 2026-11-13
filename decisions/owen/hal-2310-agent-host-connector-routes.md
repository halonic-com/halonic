# Decision: the agent host's connector routes

- Approval: Paperclip task HAL-2310 (D45, board on HAL-2257 Q3); Liam's decision on HAL-8403, part (b); Liam approves this note in review, Julian reviews the security side
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:Vl+3ICuPxcyq3t7/XrLskQj+AP/rXUw/EZb9R6HnDmz4kbgnoYUCrX225JM3g3Ur+oaRXs7wH6nk4hVSWmYGBQ==

In Studio the engine runs in a page that can't start programs, so the agent host runs a workspace `stdio` connector, as it runs harnesses. This adds `/v1/connectors/open|tools|call|close` to the host (the stand-in client and Studio's use come in the next parts).

- The host builds the connector's sandbox place itself, with `SessionWorkspaceFactory`, the same class the CLI uses: one session per connector, opened on its first call, closed with it. The request has no profile field, so Studio can't make a connector wider.
- The workspace folder must be a real path equal to one the launcher named with `--sweep-root`; the profile folder is never one and is denied to every connector. The agents' working folders arrive as a list and the host resolves them to real paths, filling conditions 6 and 7.
- Secrets: the request carries the values of the connector's own `secretEnv` names; the host reads no store. The trust grant arrives with the request, and the factory's check runs in the host.
- Where the host's `Sandbox.check` fails, the program starts without a sandbox, as today. There is no new setting.
- A table of open connectors (at most 64) closes them all when the host stops.

## Covers

- agent-host.connector-routes
