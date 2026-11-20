# @halonicjs/studio-feature-first-run

The First Run feature of the Studio: Home's **Try the sample** card.

- **Layer:** studio
- **Owner:** elena
- **Public API:** `@halonicjs/studio-feature-first-run` (the feature) and `@halonicjs/studio-feature-first-run/api`

In the demo (the copy of Acme that Welcome's **Open demo** makes), the feature fills Home's Get set up slot with three steps: start a support request, approve
or reject the reply, see what it did. Each is done by what happens in the workspace, by any route, and stays done on
this device. In any other workspace the slot stays empty. The app gives it the sample facts of each open folder
with `SampleWorkspaceService`.

`ModelChoiceHostService` is the engine side of the Pick a model screen's **Test and continue**: the app
provides it for each open folder. `test` makes one tiny call through the adapter a run uses, with only the
pasted key in memory, and gives the outcome; a passed test gives a `testId`. `preview` gives the trust line's
facts and the fingerprint they lead to, with nothing written. `continue` saves the key, then the files as one
undo step, then trusts the folder, but only when the files lead to the fingerprint the screen showed. A key is
saved only after its test passed, and no answer holds it.

## Example

```ts
// apps/studio: what the app provides for each open folder
services.provide(SampleWorkspaceService, sampleWorkspaceOf(location, recent, storage));
```
