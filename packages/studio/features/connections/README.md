# @halonicjs/studio-feature-connections

The Connections feature of the Studio: Settings › Connections, with a row per connection to a place where agents run (Paperclip first), and the Connect Paperclip dialog that signs in there. It reaches the engine only through `AgentConnectionsService` in `@halonicjs/studio-services`, so it knows no provider's types.

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
