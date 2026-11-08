# ADR: the integration interface

- Status: accepted
- Date: 8 Nov 2026
- Deciders: Liam (CTO); input from Ravi (integrations) on HAL-99
- Source: HAL-135

## Context

Model providers, MCP, Google, Gmail, Drive and the knowledge connectors are
built in their own repo, `halonic-com/integrations`. Later on, the
built-in assistant writes and changes integrations too. So the
interface between an integration and Halonic has to hold even when the
integration's code is wrong or hostile: it must not reach a host it didn't
declare, read a file, or leak a key.

The interface is fixed in phase 1 with the other ports, under the same freeze
rule (port list ADR, "The freeze").

## Decision

### 1. A new port, `Integration` (version 1)

`packages/core/ports/src/integration.ts` adds:

- **`Integration`**: `name`, `version`, `tools` and `connect(host)`.
- **`IntegrationTool`**: the `ConnectorTool` shape with `risk` required.
- **`IntegrationHost`**: what an integration is given, and all it is given:
  `http` (an `IntegrationHttpClient`), `tokens` (only its own) and `settings`.
  It has **no `Secrets` and no raw `HttpClient`**.
- **`IntegrationConnection`**: `callTool`, `close`, and optional
  `listTools` (an MCP server's tools can change), `createLlmProvider` and
  `createKnowledgeProvider`.
- **`SecretPlacement`**: a request names a secret
  (`auth: { secret: "openai-key", as: "bearer" }`, or a header, or a form
  field) and the host puts the value in, only when the permission sheet lets
  that secret go to the request's host. **Integration code never holds a
  secret value**, so it can't put one in a URL, a tool result, an error or a
  log. This matters most once the assistant writes integrations.

`IntegrationHttpClient` extends `HttpClient`, so the transport underneath is
the existing port and anything that takes an `HttpClient` takes it.

### 2. `ConnectorTool` gets two optional fields

`risk?: "read" | "write" | "send"` and `untrusted?: boolean`. Both are
optional output fields, which the freeze rule allows without a version bump,
and nothing that exists today has to change. An absent `risk` means unknown
and is treated as `write`, so an MCP tool never counts as harmless because
nobody said otherwise. `read` changes nothing, `write` changes data, and
`send` reaches people outside (the old Google connector's meaning).

### 3. The permission sheet and the limited client

- The sheet (`integration.yaml`) is a file kind in `core/format`, so
  `halonic validate` and the JSON Schema cover it. It declares `id`,
  `version`, `kit` (the `Integration` port version it was built against),
  `provides`, `hosts`, `secrets` (each with the hosts it may go to),
  `tokens`, `tools` (with `risk` and `untrusted`) and `needs`.
- `adapters/integration-kit` builds the `IntegrationHost` from the sheet: exact
  host match, `https` only, redirects followed by the kit and every hop
  checked again, a timeout, a response size limit, and a request log with
  method, host, path, status and time only. Web types only, so it runs in the
  Worker too.
- The kit's workspace name follows the layout rule
  (`@halonicjs/adapter-integration-kit`); it is published as
  `@halonicjs/integration-kit` (below). The suite lives in
  `packages/testing/integration`, which the layout rule names
  `@halonicjs/testing-integration`, the name it is published under.

### 4. How the integrations repo gets the kit: published to npm

We **publish `@halonicjs/integration-kit` and
`@halonicjs/testing-integration` from this repo's CI with npm trusted
publishing and provenance**. The integrations repo pins exact versions and
installs with a frozen lockfile.

- **Not a pinned git dependency.** A git dependency has no integrity hash, and
  our own rules forbid it (`blockExoticSubdeps`, and the lockfile check
  fails on git sources). Allowing it in one repo opens the hole those
  rules close.
- **Not a vendored copy** (Ravi's proposal, so as not to publish before the
  repos are public). Both repos are now public on purpose, so
  that reason is gone. A vendored copy is a second source of truth that a
  byte-for-byte check has to keep honest; a published release has an
  integrity hash and provenance for free.
- The published kit is self-contained: our internal code is bundled in and
  its only dependency is `zod`.
- The integrations repo uses the same install hardening. Only `@halonicjs/*`
  is excluded from the 3-day release age, so our own releases aren't held
  back; `trustPolicy: no-downgrade` catches a hijacked release.
- The main repo pins an integrations release with its integrity hash, and a
  check fails when that release was built against another major version of
  the kit.
- The two packages join `published` in `tooling/check/policy.json` in the pull
  request that first publishes them. Before that, the user turns on
  trusted publishing for both names under the `@halonicjs` org (HAL-58).

## Not in version 1, and why that is safe

Each of these is an optional method or field on what the integration
returns, an optional member of the host, or a new port, so adding it later
keeps the version.

- **An OAuth refresh helper on the host**, so Gmail and Drive never see the
  refresh token or the client secret either. Comes with Google sign-in.
- **A `{ kind: "integration", name }` connector transport** replacing
  `google`. It comes when Google moves to the integrations repo. A new
  transport kind gets its own factory, so existing factories never see it.
- **A process-launcher port** for stdio MCP servers, kept behind the trust
  step. Comes with the MCP client.
- **Streaming on `LlmProvider`.** `LlmCapabilities.streaming` exists; the
  method comes with the first provider that streams.

## Consequences

- Built-in adapters in this repo (git, files) keep the raw `HttpClient` and
  `Secrets` through the existing factory contexts. Only integrations get the
  limited host.
- An integration that reaches an undeclared host, reads a file or tries to
  leak a key fails in the kit and in the conformance suite's attack tests.
  The isolated worker enforces the same at run time for code the
  assistant wrote.
- Publishing makes the interface public before switch-over; both repos are
  public on purpose, so this is accepted.
