# contracts.fake-deploy-target

- Status: active
- Since: unreleased
- Source: task HAL-6702 (step 1d of the cloud track, HAL-198), build plan approved by Liam on HAL-13512

The `FakeDeployTarget` shall be a `DeployTarget` that keeps its host in memory and opens no socket, so the deploy app service and the `halonic deploy` command can be tested without a real host. It shall pass the `contracts.deploy-target` suite. A test shall be able to make another deploy hold a deployment's lock, which `plan` and `status` then show and which every change refuses with code `deploy-locked` until `unlock` frees it; fail the next self-test, which keeps the live version; add warnings that the next deploy to go live returns; and seed what `export` counts. While it deploys it shall hold the lock as its `who`. A deploy whose signal is aborted shall stop after the step it's in, before the switch, and say what still serves. Its `fakeDeployTargetEntry` shall serve the host `fake` at the port's version and hand out the target it was given. Its addresses shall use a host name under `.invalid`.

## Examples

- Given another deploy holds the lock of `web`,
  when the fake is asked to deploy, roll back or destroy `web`,
  then each rejects with kind `conflict` and code `deploy-locked`.
- Given version 1 live and a self-test set to fail,
  when the fake deploys,
  then the result is `self-test-failed` and version 1 is still live.
- Given two warnings added after the switch,
  when the fake deploys,
  then the result holds both warnings, and the deploy after it holds none.
