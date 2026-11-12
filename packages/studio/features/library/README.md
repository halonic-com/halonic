# @halonicjs/studio-feature-library

The Library feature of the Studio. It shows how each connector stands and what the engine refused for it.

- **Layer:** studio
- **Owner:** ravi
- **Public API:** `@halonicjs/studio-feature-library` (the feature) and `@halonicjs/studio-feature-library/api`

## Example

```ts
import { connectionStateOf, connectionStateTable } from "@halonicjs/studio-feature-library/api";

const state = connectionStateOf({ configured: true, signedIn: false, secretValid: true, apiOn: true });
connectionStateTable[state].label; // "Needs sign-in"
```
