# @halonicjs/studio-feature-remote

The Remote feature of the Studio: Settings › Remote, where a person lets phones reach this
computer, pairs them and revokes them. The Pair a phone dialog and the status bar item follow
(HAL-12241).

- **Layer:** studio
- **Owner:** elena
- **Public API:** `@halonicjs/studio-feature-remote` (the feature) and `@halonicjs/studio-feature-remote/api`

The section shows only while the host's `RemoteControl` (the `RemoteControlService`) reports
`available`. Nothing provides that service until the host's pairing service lands, so the section
stays hidden until then. Its words come from the design "Tunnel phase B screens" (HAL-12206).

## Example

```ts
import { RemoteControlService } from "@halonicjs/studio-feature-remote/api";

services.provide(RemoteControlService, remoteControl);
```
