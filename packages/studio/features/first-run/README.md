# @halonicjs/studio-feature-first-run

The First Run feature of the Studio: the first run's state, the first-run bar and the guide card.

- **Layer:** studio
- **Owner:** elena
- **Public API:** `@halonicjs/studio-feature-first-run` (the feature) and `@halonicjs/studio-feature-first-run/api`

The first run goes from Welcome's **Open demo** to the first win, approving the drafted reply of Acme's
Support reply in the Inbox (first-run-flow, HAL-7985). The feature keeps its one state on this device
(`first-run.state`): on at a step (Demo, Model, Run, Approve) in the demo it started in, paused, or done. It
follows the demo's runs of Support reply to move the steps. While it is on, it shows the first-run bar under the
top bar through the shell's `strips.add` (`first-run.bar`): the four steps and the way out, **Skip, I'll
explore**. It also gives Support reply's page the guide card through the Workflows feature's
`WorkflowGuideService` (`first-run.guide-card`). The app gives it the open folder's sample facts with
`SampleWorkspaceService` and a place for the state with `FirstRunDeviceService`.

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
services.provide(FirstRunDeviceService, firstRunDeviceOf(location, storage));
```
