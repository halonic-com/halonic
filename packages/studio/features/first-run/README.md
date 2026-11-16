# @halonicjs/studio-feature-first-run

The First Run feature of the Studio: Home's **Try the sample** card.

- **Layer:** studio
- **Owner:** elena
- **Public API:** `@halonicjs/studio-feature-first-run` (the feature) and `@halonicjs/studio-feature-first-run/api`

In the Acme sample, the feature fills Home's Get set up slot with three steps: start a support request, approve
or reject the reply, see what it did. Each is done by what happens in the workspace, by any route, and stays done on
this device. In any other workspace the slot stays empty. The app gives it the sample facts of each open folder
with `SampleWorkspaceService`.

## Example

```ts
// apps/studio: what the app provides for each open folder
services.provide(SampleWorkspaceService, sampleWorkspaceOf(location, recent, storage));
```
