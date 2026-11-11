# ports.connector-sandbox-session

- Status: active
- Since: 0.1.0
- Source: HAL-1738 (plugins P5), plugins ADR sections 3 and 4: a plugin's local tool runs only in a `SandboxSession`, never directly on this computer; HAL-3386 test plan C2: a yes to run without the sandbox covers plugin backends and integrations, never programs

When `ConnectorFactoryContext.sandbox` is set, the `stdio` connector shall start its program in that session and nowhere else. A factory that starts programs on this computer shall refuse such a context when it creates the connector, before it reads a secret or starts anything. A factory that starts programs through the session shall start nothing while the session's fence proof isn't `fenced`, whatever the person said about running without the sandbox, and shall not fall back to this computer.

The host factory's refusal is tested in `adapters/mcp`, the fence rule in `adapters/connector-stdio-sandbox`.

## Examples

- Given a trusted `stdio` connector and a context with a fenced sandbox session,
  when the host's stdio factory is asked to create it,
  then it throws, and no program has started on this computer or in the session.
- Given a context whose sandbox session's fence proof is `not-fenced`, and a saved yes to run without the sandbox,
  when the sandboxed stdio factory's connector lists its tools,
  then it throws, `session.start` is never called and nothing starts on this computer.
