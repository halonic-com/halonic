# @halonicjs/studio-feature-workflows

The Workflows feature of the Studio: the list, the workflow page with its canvas and step cards,
Configuration and Tests, and starting a run.

- **Layer:** studio
- **Owner:** elena
- **Public API:** `@halonicjs/studio-feature-workflows` (the feature) and `@halonicjs/studio-feature-workflows/api`

## Example

The app gives the feature its workflows; other features read nothing from it yet.

```ts
import { WorkflowsHostService } from "@halonicjs/studio-feature-workflows/api";

services.provide(WorkflowsHostService, workflowsHostFor(workspace));
```
