# @halonicjs/studio-feature-first-run

The First Run feature of the Studio: the first run's state, the first-run bar, the guide card and Home's Get set up.

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

Every open folder shares that one state (`first-run.one-state`): a folder reads it again when the window shows
it, before every change and when `FirstRunDevice.onChanged` says another window saved it, so a folder that
stays open sees what another one changed, and an action or run of a folder the first run has left changes
nothing. When **Open demo** marks a folder that is open already as the demo, `SampleWorkspace.onMarkedSample`
tells the first run, which then starts there.

A paused first run has a setup item in the Inbox (`first-run.setup-item`): "Finish your first run" at its step,
with **Continue**, which takes it up again and opens Support reply, and **Dismiss**, whose toast says Help brings the guide back.

**Help › First run** (`first-run.help`) shows only in the demo. **Show the guide again** takes a paused or
dismissed first run up again at its step, and **Start over** turns the first run off and asks the app for a
fresh copy of the demo through the device's `startOver`. The copy starts the first run when it opens.

In a workspace that isn't the sample, Home's Get set up section shows three steps (`first-run.own-card`):
**Connect your own model**, **Make your first agent** and **Run it once**, done by the rules of
`first-run.own-progress`. Step 1 asks a local provider with the Models feature's `ProviderCheckService`, gives up
after 5 seconds, and offers **Check again** and **Open Models** when it doesn't answer. The card stays for the
visit in which the last step gets done; `SampleWorkspace`'s `ownCardMemory` and `recordOwnCard` remember it per
folder, so it is gone the next time Home opens.

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
