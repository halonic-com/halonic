# @halonicjs/studio-feature-routines

The Routines feature of the Studio.

- **Layer:** studio
- **Owner:** tomas
- **Public API:** `@halonicjs/studio-feature-routines` (the feature) and `@halonicjs/studio-feature-routines/api`

## Example

The app provides the workspace's routines; this feature's screens and the Triggers sections read them:

```ts
import { RoutinesHostService } from "@halonicjs/studio-feature-routines/api";

const routines = await services.get(RoutinesHostService).list();
```
