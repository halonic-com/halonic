# @halonicjs/adapter-sandbox-cloudflare-container

The `Sandbox` port on a Cloudflare Container: one container per run, started once, destroyed at
the run's end or its time limit, with its internet off and outbound traffic only to Halonic's
bridge and the profile's allowed sites.

- **Layer:** adapters
- **Owner:** owen
- **Runtime:** workers
- **Public API:** `@halonicjs/adapter-sandbox-cloudflare-container`

## How it works

- `RunContainerState` is the logic of the Durable Object that owns one run's container. The
  Worker's container class (in `targets/cloudflare/runtime`, since only `cloudflare-*` packages
  may use `cloudflare:workers`) wraps it around `ctx.container` and names each instance after its
  run id. The object refuses any call that names another run, and a second start even for the
  same run.
- It starts the container with `enableInternet: false` and intercepts only the bridge's name
  (plain HTTP, port 80) and each allowed site (HTTPS). The platform drops everything else, and
  `outboundGate` checks every intercepted request again.
- At `begin` it sets its alarm for the run's deadline, so the container is destroyed then even if
  the run object is gone.
- `ContainerSandbox` is the `Sandbox` the run uses. It reaches the bridge only by name (the
  `socket` bridge kind) and refuses a loopback bridge.

## Example

```ts
const sandbox = new ContainerSandbox({
  runId,
  containerFor: (name) => env.SANDBOX_CONTAINER.get(env.SANDBOX_CONTAINER.idFromName(name)),
});
const session = await sandbox.open(profile);
```
