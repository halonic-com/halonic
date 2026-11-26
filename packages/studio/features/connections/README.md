# @halonicjs/studio-feature-connections

The Connections feature of the Studio: Settings › Connections, with a row per connection to a place where agents run (Paperclip first), and the Connect Paperclip dialog that signs in there. It reaches the engine only through `AgentConnectionsService` in `@halonicjs/studio-services`, so it knows no provider's types.

A row is "Connected", "Offline", "Signed out" (Paperclip refused the key: **Sign in again**) or "Not connected" (this computer holds no key for it yet: **Sign in**). Both buttons open the sign-in dialog; requirement `connections.connection-row` has the exact wording.

Next to it, Settings › Sync diagnostics is a read-only view of how the engine kept the Inbox and Messenger up to date over the last 24 hours: how changes arrived and their shares, delays, reconnects and each Paperclip call's timing. It reads them through `SyncDiagnosticsService` and shows only where the app provides it (requirement `connections.sync-diagnostics`).

- **Layer:** studio
- **Owner:** tomas
- **Public API:** `@halonicjs/studio-feature-connections` (the feature) and `@halonicjs/studio-feature-connections/api`

## Example

The app provides the engine's connections, and the section shows by itself:

```ts
import { AgentConnectionsService, FakeAgentConnections } from "@halonicjs/studio-services";

// Until the host's sign-in is wired (HAL-17439), the demo and tests use the fake.
services.provide(AgentConnectionsService, () => new FakeAgentConnections());
```
