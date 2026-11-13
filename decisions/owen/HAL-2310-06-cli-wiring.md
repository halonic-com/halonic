# Decision: the CLI runs a workspace connector in a session it opens on the first call

- Approval: Paperclip task HAL-2310 (D45, board on HAL-2257 Q3); Liam's decision on HAL-8403; Liam approves this note in review
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:mdQgIk1uewx81E3ShwlHP0H+KXSxjuEYNSrOnA5UGWk+YLmOoShYPUkC/ed9P3vgGg4xaQo4yP4S+gnAI+HQDw==

Liam's decision on HAL-8403 says `FolderRunConnectors` opens one sandbox session per stdio connector when the check passes and closes it on `end`, with `WorkspaceStdioConnectorFactory` wrapping the unfenced starter. Two parts of how it is built differ from that wording, with the same effect:

- **The connector opens its own session, on its first call** (`SessionWorkspaceFactory`), and closes it when it closes. `FolderRunConnectors` already closes every connector at `end`, so no session outlives its run, and `FolderRunConnectors` stays as it is. The agent host's connector routes (part b) reuse the same class, so both hosts build the profile the same way.
- **The class decides between the sandbox and today's start itself**, from `Sandbox.check` at the first call, so `WorkspaceStdioConnectorFactory` has nothing left to decide in the CLI. A plugin's local tool never reaches this factory; it keeps its own path.

Where the sandbox works, the profile is built by Halonic from the connector file and the context (`workspaceConnectorPlace`, `localToolLaunch`); the connector checks it again before it starts the program (`planLaunch`). The CLI opens its own `SrtSandbox` for connectors, on the same journal folder as the harness host's, because the harness host's instance isn't reachable from the run connectors. `halonic tools` still starts a connector as before: it reads a listing, not a run.

Not in this part: the trust check showing "Allowed sites" only where a sandbox works (own pull request), and the agent host and Studio (parts b and c).

## Covers

- cli.connector-sandbox
- connector-stdio-sandbox.workspace-connector-session
